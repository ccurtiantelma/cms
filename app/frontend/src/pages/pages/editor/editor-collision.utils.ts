/**
 * Collision detection del `DndContext` dell'editor: `pointerWithin` + risoluzione "contenitore
 * più profondo". Le zone di rilascio sono annidate (strisce prima/dopo di ogni nodo, zona
 * "dentro" di ogni contenitore, colonne di Section): con il solo `pointerWithin` un drop su un
 * contenitore che ha già dei figli poteva risolvere una zona del genitore o di un fratello.
 *
 * Regole, in ordine:
 * 1. il contenitore bersaglio è la zona "dentro"/colonna **più piccola** che contiene il puntatore
 *    (il contenitore più annidato sotto il cursore);
 * 2. una striscia prima/dopo vince solo se è fratella *diretta* dentro quel contenitore
 *    (`data.parentId` uguale): le strisce degli antenati non rubano il drop;
 * 3. altrimenti, se il contenitore ha già figli, il drop cade nella fessura più vicina al
 *    puntatore fra i figli (sopra/sotto in base al punto medio verticale): si inserisce sempre
 *    nell'array `children` di QUEL contenitore, mai in un altro;
 * 4. contenitore vuoto: zona "dentro" (indice 0).
 *
 * Prima di tutto, le zone il cui rilascio sarebbe rifiutato (`canDropInto`: dentro sé stessi o
 * un proprio discendente, tipo non ammesso) sono escluse: con il puntatore sopra il blocco
 * trascinato o su un contenitore che non accetta quel tipo, la zona risolta è la più vicina
 * *valida* (tipicamente il genitore), invece di restare "incastrati" su un bersaglio rosso da
 * cui non si può rilasciare. Se nessuna zona sotto il puntatore è valida si mantiene il
 * comportamento precedente (bersaglio rifiutato, mostrato in rosso).
 */
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { canDropInto } from './block-registry.utils';
import {
  pointerWithin,
  type ClientRect,
  type Collision,
  type CollisionDetection,
  type DroppableContainer,
} from '@dnd-kit/core';

const INSIDE_PREFIX = 'inside:';
const COLUMN_PREFIX = 'section-column:';
const BEFORE_PREFIX = 'before:';
const AFTER_PREFIX = 'after:';

function parentIdOf(container: DroppableContainer | undefined): string | null | undefined {
  return (container?.data.current as { parentId?: string | null } | undefined)?.parentId;
}

function area(rect: ClientRect | undefined): number {
  return rect ? rect.width * rect.height : Number.POSITIVE_INFINITY;
}

function centerY(rect: ClientRect): number {
  return rect.top + rect.height / 2;
}

function asCollision(container: DroppableContainer): Collision {
  return { id: container.id, data: { droppableContainer: container, value: 0 } };
}

/**
 * Fessura più vicina al puntatore fra i figli diretti di `parentId` (`null` = radice), come
 * coppie di zone `before:X`/`after:X` (sopra/sotto in base al punto medio verticale). `null`
 * se il genitore non ha figli visibili. Con `requireInside`, `null` anche se il puntatore è
 * fuori dall'ingombro *orizzontale* dei figli (radice: senza, un puntatore sulla sidebar
 * risolverebbe una zona). Verticalmente nessun limite: sopra il primo figlio vale "prima", sotto
 * l'ultimo "dopo" (lo spazio vuoto in fondo al canvas è un rilascio in coda valido).
 */
function nearestGap(
  args: Parameters<CollisionDetection>[0],
  parentId: string | null,
  requireInside = false,
): Collision | null {
  const { pointerCoordinates, droppableRects, droppableContainers } = args;
  if (!pointerCoordinates) return null;
  const byId = new Map(droppableContainers.map((container) => [container.id, container]));
  const children: { before: DroppableContainer; after: DroppableContainer; mid: number }[] = [];
  const bounds = { left: Infinity, right: -Infinity };
  for (const container of droppableContainers) {
    const id = String(container.id);
    if (!id.startsWith(BEFORE_PREFIX) || parentIdOf(container) !== parentId) continue;
    const after = byId.get(`${AFTER_PREFIX}${id.slice(BEFORE_PREFIX.length)}`);
    const beforeRect = droppableRects.get(container.id);
    const afterRect = after ? droppableRects.get(after.id) : undefined;
    // Figlio nascosto (`display: none`): rect nullo, non è una fessura reale.
    if (!after || !beforeRect || !afterRect || beforeRect.width === 0) continue;
    children.push({
      before: container,
      after,
      mid: (centerY(beforeRect) + centerY(afterRect)) / 2,
    });
    bounds.left = Math.min(bounds.left, beforeRect.left);
    bounds.right = Math.max(bounds.right, beforeRect.right);
  }
  if (children.length === 0) return null;
  if (
    requireInside &&
    (pointerCoordinates.x < bounds.left || pointerCoordinates.x > bounds.right)
  ) {
    return null;
  }

  children.sort((a, b) => a.mid - b.mid);
  const next = children.find((child) => pointerCoordinates.y < child.mid);
  return asCollision(next ? next.before : children[children.length - 1].after);
}

/** `true` se rilasciare `args.active` nella zona `container` sarebbe ammesso dal registro. */
function isAdmissibleZone(
  container: DroppableContainer | undefined,
  activeId: string,
  activeType: string | undefined,
): boolean {
  const data = container?.data.current as { parentId?: string | null } | undefined;
  // Zone senza `parentId` nel payload (non nostre): non si giudicano.
  if (!data || data.parentId === undefined) return true;
  return canDropInto(useBlockEditorStore.getState().tree, activeId, data.parentId, activeType);
}

export const editorCollisionDetection: CollisionDetection = (args) => {
  const rawHits = pointerWithin(args);
  const { pointerCoordinates, droppableRects, droppableContainers, active } = args;
  if (!pointerCoordinates) return rawHits;
  // Fuori da ogni zona (tipicamente sul corpo di un blocco radice, lontano dai 10px di bordo):
  // la radice non ha una zona "dentro", quindi si risolve la fessura più vicina fra i blocchi
  // radice invece di `over: null` (nessun indicatore, rilascio perso).
  if (rawHits.length === 0) {
    const rootGap = nearestGap(args, null, true);
    return rootGap ? [rootGap] : rawHits;
  }

  const rawById = new Map(droppableContainers.map((container) => [container.id, container]));
  const activeId = active ? String(active.id) : null;
  const activeType = (active?.data.current as { type?: string } | undefined)?.type;
  const admissible =
    activeId === null
      ? rawHits
      : rawHits.filter((hit) => isAdmissibleZone(rawById.get(hit.id), activeId, activeType));
  let hits = admissible;
  if (hits.length === 0) {
    // Nessuna zona ammessa sotto il puntatore (es. dentro il contenitore trascinato stesso):
    // prima la fessura più vicina a livello radice, se ammessa; solo se neppure quella c'è,
    // il bersaglio rifiutato (rosso) invece di nessun feedback.
    const rootAllowed =
      activeId === null ||
      canDropInto(useBlockEditorStore.getState().tree, activeId, null, activeType);
    const rootGap = rootAllowed ? nearestGap(args, null, true) : null;
    if (rootGap) return [rootGap];
    hits = rawHits;
  }

  const containerZones = hits.filter((hit) => {
    const id = String(hit.id);
    return id.startsWith(INSIDE_PREFIX) || id.startsWith(COLUMN_PREFIX);
  });
  if (containerZones.length === 0) {
    // Solo strisce di bordo di blocchi radice: la fessura più vicina è già quella giusta. Altre
    // zone esplicite (`CanvasSectionInserter`, `root-empty-dropzone`) vincono così come sono.
    const onlyRootStrips = hits.every((hit) => {
      const id = String(hit.id);
      return (
        (id.startsWith(BEFORE_PREFIX) || id.startsWith(AFTER_PREFIX)) &&
        parentIdOf(rawById.get(hit.id)) === null
      );
    });
    if (onlyRootStrips) {
      const rootGap = nearestGap(args, null, true);
      if (rootGap) return [rootGap];
    }
    return hits;
  }

  const deepest = containerZones.reduce((best, hit) =>
    area(droppableRects.get(hit.id)) < area(droppableRects.get(best.id)) ? hit : best,
  );
  const byId = new Map(droppableContainers.map((container) => [container.id, container]));
  const deepestContainer = byId.get(deepest.id);
  const targetParentId = parentIdOf(deepestContainer);

  // Regola 2: striscia fra fratelli diretti del contenitore bersaglio.
  const ownStrip = hits.find((hit) => {
    const id = String(hit.id);
    return (
      (id.startsWith(BEFORE_PREFIX) || id.startsWith(AFTER_PREFIX)) &&
      parentIdOf(byId.get(hit.id)) === targetParentId
    );
  });
  if (ownStrip) return [ownStrip];

  // Colonne di Section: l'indice è la colonna, non una fessura fra i figli.
  if (!String(deepest.id).startsWith(INSIDE_PREFIX) || !targetParentId) return [deepest];

  // Regola 3: fessura più vicina fra i figli diretti.
  return [nearestGap(args, targetParentId) ?? deepest];
};

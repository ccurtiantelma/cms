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
 */
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

export const editorCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const { pointerCoordinates, droppableRects, droppableContainers } = args;
  if (hits.length === 0 || !pointerCoordinates) return hits;

  const containerZones = hits.filter((hit) => {
    const id = String(hit.id);
    return id.startsWith(INSIDE_PREFIX) || id.startsWith(COLUMN_PREFIX);
  });
  if (containerZones.length === 0) return hits;

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

  // Regola 3: fessura più vicina fra i figli diretti (coppie `before:X`/`after:X`).
  const children: { before: DroppableContainer; after: DroppableContainer; mid: number }[] = [];
  for (const container of droppableContainers) {
    const id = String(container.id);
    if (!id.startsWith(BEFORE_PREFIX) || parentIdOf(container) !== targetParentId) continue;
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
  }
  if (children.length === 0) return [deepest];

  children.sort((a, b) => a.mid - b.mid);
  const next = children.find((child) => pointerCoordinates.y < child.mid);
  return [asCollision(next ? next.before : children[children.length - 1].after)];
};

/**
 * Contenuto del pannello destro "Struttura/Navigator" dell'editor full-screen
 * (`FullScreenEditorLayout`): l'albero dei blocchi in editing, con selezione dal nome invece
 * che dal canvas — utile quando un blocco è fuori dalla viewport simulata corrente.
 *
 * Sottoscrive solo la radice dell'albero (`useShallow`, come `EditorCanvas`) e risolve
 * ricorsivamente icone/etichette dal registro (`BLOCK_TYPES`) e dalla stessa mappa icone
 * della palette (`blockIcon`, `BlockPalette.tsx`) — nessuna seconda mappa tipo→icona nel
 * codebase, nessuno stato duplicato rispetto allo store dell'albero.
 *
 * **Drag & drop locale.** Questo pannello ha un proprio `DndContext`/`SortableContext`
 * (`@dnd-kit`), indipendente da quello condiviso di `FullScreenEditorLayout.tsx` (canvas +
 * palette widget): un riordino qui non deve intersecare lo stato di drag del canvas, e
 * viceversa. Le voci dell'albero sono appiattite in un solo `SortableContext` verticale
 * (`flattenIds`, ordine di visita in profondità = ordine di rendering top-to-bottom): dnd-kit
 * misura le posizioni reali a schermo per l'anteprima del trascinamento, l'array `items`
 * serve solo a dichiarare quali id partecipano a *questa* lista ordinabile.
 *
 * Sul drop, l'unica azione è `moveNodeToAction(id, targetParentId, index)` dello store:
 * l'ammissibilità del contenitore di destinazione (`canContainType`) e i casi limite
 * strutturali (dentro sé stesso, dentro un proprio discendente) sono già suoi — questo
 * componente non ripete quella logica, si limita a calcolare *dove* si è rilasciato
 * (genitore + indice del nodo sorvolato, `findLocation`), con la stessa semantica di
 * `moveNodeTo` ("indice sulla lista di destinazione dopo la rimozione del nodo trascinato").
 *
 * **"Occhio" e "cestino" per riga** non duplicano controlli già presenti nella chrome del
 * canvas (`EditorBlockWrapper.tsx`): l'eliminazione passa dallo stesso `ConfirmModal` con lo
 * stesso `zIndex={1100}` (il pannello vive sopra la chrome full-screen, z-index 1000), la
 * visibilità è lo stesso stato UI effimero `hiddenInCanvasIds` che `EditorBlockWrapper`
 * traduce in un `display: none` reale — mai una seconda fonte di verità.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ActionIcon, Group, NavLink, ScrollArea, Text, Tooltip } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconTrash,
} from '@tabler/icons-react';
import {
  useBlockEditorStore,
  useIsHiddenInCanvas,
  useSelectedId,
} from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { findLocation, findNode, type BlockNode } from './block-tree.utils';
import { canDropInto } from './block-registry.utils';
import { blockIcon } from './BlockPalette';
import ConfirmModal from '../../../components/ConfirmModal';
import CanvasContextMenu from './CanvasContextMenu';
import styles from './EditorStructureNavigator.module.css';

/** Lunghezza massima dell'etichetta derivata dal contenuto reale di un nodo (troncata oltre). */
const MAX_DERIVED_LABEL_LENGTH = 40;

/** Etichetta leggibile di un tipo di blocco, presa dal registro (mai scritta a mano). */
function blockLabel(type: string): string {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.label ?? type;
}

/** Nome icona dichiarato dal registro per un tipo di blocco (`meta.icon`), se esiste. */
function blockIconName(type: string): string | undefined {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.icon;
}

/** Accorcia un testo oltre `MAX_DERIVED_LABEL_LENGTH`, con ellissi — mai a metà parola lunga. */
function truncateLabel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DERIVED_LABEL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_DERIVED_LABEL_LENGTH - 1)}…`;
}

/**
 * Etichetta mostrata per un nodo dell'albero. Solo `heading` ha un contenuto testuale breve
 * e a riga singola adatto a fare da titolo (`props.text`, plainText — `Heading.tsx`):
 * `richText` è deliberatamente escluso pur avendo testo, perché la sua prop è `html`, non
 * un buon titolo da troncare. Tutti gli altri tipi (incluso `richText`) mostrano l'etichetta
 * del registro — coerente con l'aspettativa "Bottone" per un blocco pulsante, non la sua
 * label interna. Fallback all'etichetta del registro se il testo derivato è vuoto/assente.
 */
function nodeLabel(node: BlockNode): string {
  if (node.type === 'heading') {
    const text = node.props.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return truncateLabel(text);
    }
  }
  return blockLabel(node.type);
}

/**
 * Porta il blocco `id` in vista nel canvas, se il suo wrapper è montato nel DOM
 * (`data-block-id`, `EditorBlockWrapper.tsx`). No-op silenzioso altrimenti — un nodo appena
 * aggiunto in coda a un albero lungo, o non ancora renderizzato per qualunque motivo, non è
 * un errore da segnalare, semplicemente non c'è nulla da far scorrere.
 */
function scrollBlockIntoView(id: string): void {
  // `window.CSS`, non l'identificatore `CSS` importato da `@dnd-kit/utilities` più sopra
  // (quello è l'helper di trasformazioni del drag, un omonimo che oscurerebbe l'API
  // globale `CSS.escape` se referenziato per nome nudo).
  const selector =
    typeof window !== 'undefined' && typeof window.CSS?.escape === 'function'
      ? `[data-block-id="${window.CSS.escape(id)}"]`
      : `[data-block-id="${id}"]`;
  document
    .querySelector<HTMLElement>(selector)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Porta la riga `id` in vista **in questo pannello** (`[data-tree-node-id]`, sotto), non nel
 * canvas — direzione opposta a `scrollBlockIntoView`. Serve quando la selezione arriva dal
 * canvas (clic su un blocco fuori dallo scroll corrente del navigator): senza questo, la riga
 * si evidenzia (`active`, via `selectedId`) ma può restare fuori vista, invisibile finché
 * l'utente non scrolla a mano. `block: 'nearest'`, non `'center'` come per il canvas — qui la
 * riga è quasi sempre già vicina al bordo visibile di un pannello stretto, e un ricentraggio
 * ad ogni selezione produrrebbe uno scatto percepibile più che un aiuto.
 */
function scrollTreeRowIntoView(id: string): void {
  const selector =
    typeof window !== 'undefined' && typeof window.CSS?.escape === 'function'
      ? `[data-tree-node-id="${window.CSS.escape(id)}"]`
      : `[data-tree-node-id="${id}"]`;
  document
    .querySelector<HTMLElement>(selector)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Appiattisce l'albero in ordine di visita in profondità — stesso ordine del rendering. */
function flattenIds(nodes: readonly BlockNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...flattenIds(node.children));
  }
  return ids;
}

interface StructureNodeProps {
  node: BlockNode;
  depth: number;
  roots: readonly BlockNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
}

/**
 * Una voce dell'albero, con i suoi figli resi in ricorsione. Non usa `NavLink.children`/il
 * collasso integrato di Mantine: i controlli per-riga (maniglia di trascinamento, occhio,
 * cestino) vivono come fratelli del `NavLink` in un `Group`, non nel suo `rightSection` —
 * `NavLink` senza `href` rende un `<button>`, e un `ActionIcon` (anch'esso un `<button>`)
 * annidato lì dentro sarebbe HTML invalido (bottone-in-bottone) con un click che rischia di
 * innescare due gestori. Come fratelli, restano interattivi senza ambiguità.
 */
function StructureNode({
  node,
  depth,
  roots,
  selectedId,
  onSelect,
  onRequestDelete,
  onHoverChange,
  onMove,
}: StructureNodeProps): JSX.Element {
  const label = nodeLabel(node);
  const Icon = blockIcon(blockIconName(node.type));
  const isHiddenInCanvas = useIsHiddenInCanvas(node.id);
  const toggleHiddenInCanvas = useBlockEditorStore((state) => state.toggleHiddenInCanvas);

  // Bordi del riordino "su/giù": stessa `findLocation` che alimenta già `handleDragEnd`,
  // qui solo per sapere se il nodo è il primo/ultimo fra i suoi fratelli diretti — i
  // pulsanti si disabilitano al bordo invece di affidarsi al no-op silenzioso di
  // `moveBlockAction` (`pushCommand` ritorna `{}` ai bordi, `EditorBlockWrapper.tsx` segue
  // lo stesso schema per la sua toolbar).
  const location = findLocation(roots, node.id);
  const isFirst = !location || location.index === 0;
  const isLast = !location || location.index === location.siblingsCount - 1;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active } =
    useSortable({ id: node.id });
  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Anteprima di rifiuto durante l'hover (stesso principio di `dropZoneAttrs` nel canvas,
  // `EditorBlockWrapper.tsx`): `handleDragEnd` rilascia il nodo trascinato fra i figli del
  // *genitore* del nodo sorvolato, non dentro di lui — quindi l'ammissibilità va verificata
  // contro il tipo di quel genitore (`overLocation.parentId`), non contro `node.type`.
  const isRejected = useMemo(() => {
    if (!isOver || !active || active.id === node.id) return false;
    const overLocation = findLocation(roots, node.id);
    if (!overLocation) return false;
    return !canDropInto(roots, String(active.id), overLocation.parentId);
  }, [isOver, active, roots, node.id]);

  return (
    <div ref={setNodeRef} style={dragStyle} data-tree-node-id={node.id}>
      <Group
        gap={4}
        wrap="nowrap"
        className={styles.row}
        data-rejected={isRejected}
        style={{ paddingLeft: depth * 12 }}
        onMouseEnter={() => onHoverChange(node.id)}
        onMouseLeave={() => onHoverChange(null)}
      >
        <Tooltip label="Trascina per riordinare" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Trascina per riordinare il blocco "${label}"`}
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </ActionIcon>
        </Tooltip>

        <NavLink
          style={{ flex: 1, minWidth: 0 }}
          leftSection={<Icon size={16} />}
          label={label}
          active={node.id === selectedId}
          onClick={() => onSelect(node.id)}
        />

        <Tooltip label="Sposta su" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={isFirst}
            aria-label={`Sposta su il blocco "${label}"`}
            onClick={(event) => {
              event.stopPropagation();
              onMove(node.id, 'up');
            }}
          >
            <IconChevronUp size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Sposta giù" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={isLast}
            aria-label={`Sposta giù il blocco "${label}"`}
            onClick={(event) => {
              event.stopPropagation();
              onMove(node.id, 'down');
            }}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={isHiddenInCanvas ? 'Mostra nel canvas' : 'Nascondi nel canvas'} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={
              isHiddenInCanvas
                ? `Mostra il blocco "${label}" nel canvas`
                : `Nascondi il blocco "${label}" nel canvas`
            }
            onClick={(event) => {
              event.stopPropagation();
              toggleHiddenInCanvas(node.id);
            }}
          >
            {isHiddenInCanvas ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Elimina" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Elimina il blocco "${label}"`}
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(node.id);
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {node.children.map((child) => (
        <StructureNode
          key={child.id}
          node={child}
          depth={depth + 1}
          roots={roots}
          selectedId={selectedId}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
          onHoverChange={onHoverChange}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

/** Navigator dell'albero di blocchi della bozza corrente. */
export default function EditorStructureNavigator(): JSX.Element {
  const roots = useBlockEditorStore(useShallow((state) => state.tree));
  const selectedId = useSelectedId();
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const moveBlockAction = useBlockEditorStore((state) => state.moveBlockAction);
  const setHoveredId = useBlockEditorStore((state) => state.setHoveredId);

  /** Id del nodo per cui è aperta la conferma di eliminazione, `null` se nessuna è aperta. */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteNode = pendingDeleteId ? findNode(roots, pendingDeleteId) : undefined;

  // `distance: 4`: un click puro (nessuno spostamento) non deve attivare un drag — altrimenti
  // ogni click di selezione sulla maniglia rischierebbe di essere interpretato come un
  // trascinamento di un pixel, stesso principio già in uso nel `DndContext` condiviso del
  // canvas (`FullScreenEditorLayout.tsx`).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const sortableIds = useMemo(() => flattenIds(roots), [roots]);

  // Il pannello può chiudersi (o smontarsi) mentre il puntatore è ancora su una riga: senza
  // questo cleanup l'ultimo `hoveredId` resterebbe scritto nello store e un blocco nel
  // canvas apparirebbe evidenziato "da solo", senza nessun puntatore sopra a spiegarlo.
  useEffect(() => () => setHoveredId(null), [setHoveredId]);

  // Direzione canvas → navigator: `selectedId` cambia anche quando la selezione arriva da un
  // clic nel canvas (`EditorBlockWrapper.tsx`, stessa `selectNode` dello store), non solo dal
  // clic in questo pannello (che scrolla già da sé via `handleSelect`). Senza questo effetto,
  // una riga fuori dallo scroll corrente si evidenzierebbe come attiva restando invisibile.
  useEffect(() => {
    if (selectedId) scrollTreeRowIntoView(selectedId);
  }, [selectedId]);

  /** Seleziona il nodo e lo porta in vista nel canvas — mai l'uno senza l'altro da qui. */
  function handleSelect(id: string): void {
    selectNode(id);
    scrollBlockIntoView(id);
  }

  /**
   * Sposta il nodo trascinato fra i figli del genitore del nodo sorvolato, alla sua stessa
   * posizione — la stessa semantica "indice sulla lista di destinazione dopo la rimozione"
   * di `moveNodeTo` (`block-tree.utils.ts`), qui applicata sia al riordino fra fratelli sia
   * allo spostamento fra genitori diversi: un solo calcolo per entrambi i casi, nessuna
   * ramificazione fra "stesso contenitore"/"contenitore diverso" duplicata qui.
   */
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const overLocation = findLocation(roots, String(over.id));
    if (!overLocation) return;
    moveNodeToAction(String(active.id), overLocation.parentId, overLocation.index);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <CanvasContextMenu>
        <ScrollArea.Autosize mah="100%" p="sm">
          {roots.length === 0 ? (
            <Text size="sm" c="dimmed" p="sm">
              Nessun blocco nella bozza.
            </Text>
          ) : (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {roots.map((node) => (
                <StructureNode
                  key={node.id}
                  node={node}
                  depth={0}
                  roots={roots}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  onRequestDelete={setPendingDeleteId}
                  onHoverChange={setHoveredId}
                  onMove={moveBlockAction}
                />
              ))}
            </SortableContext>
          )}
        </ScrollArea.Autosize>
      </CanvasContextMenu>

      {pendingDeleteId && pendingDeleteNode && (
        <ConfirmModal
          opened
          onClose={() => setPendingDeleteId(null)}
          onConfirm={() => {
            removeBlockAction(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          title={`Elimina blocco "${nodeLabel(pendingDeleteNode)}"`}
          confirmLabel="Elimina"
          confirmColor="red"
          // Sopra la chrome full-screen dell'editor (z-index 1000): stesso valore dello
          // stesso `ConfirmModal` in `EditorBlockWrapper.tsx`.
          zIndex={1100}
        >
          {pendingDeleteNode.children.length > 0
            ? `Il blocco e i suoi ${pendingDeleteNode.children.length} blocchi figli vengono rimossi dalla bozza. L'eliminazione diventa definitiva al salvataggio.`
            : "Il blocco viene rimosso dalla bozza. L'eliminazione diventa definitiva al salvataggio."}
        </ConfirmModal>
      )}
    </DndContext>
  );
}

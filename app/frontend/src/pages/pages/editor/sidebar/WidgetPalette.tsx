/**
 * Scheda "Widgets" della sidebar dell'editor full-screen (`EditorSidebar`): la libreria dei
 * tipi di blocco disponibili, trascinabili sul canvas — non una `Menu` click-to-add come
 * `BlockPalette` ("Aggiungi blocco"/"Inserisci sopra"/"Aggiungi dentro" restano lì, legate a
 * un contenitore preciso). Qui non c'è un contenitore di destinazione: mostra tutti i tipi
 * assegnabili in generale, l'ammissibilità nel punto di rilascio la decide già la drop-zone
 * di destinazione (`EditorBlockWrapper`, `data-rejected`, via `canDropInto`).
 *
 * Ogni tessera è una sorgente di drag dnd-kit con id sintetico `new-block:<type>` e
 * `data: { type, isNew: true }`: quell'id non esiste nell'albero (non è ancora un nodo), ed
 * è `FullScreenEditorLayout.handleDragEnd` — non `moveNodeToAction` — a distinguere questo
 * caso da un nodo esistente trascinato per essere spostato.
 *
 * Ogni tessera è anche un **click-to-add**: un click (nessun movimento del puntatore, quindi
 * mai scambiato per un drag — `activationConstraint.distance` di `FullScreenEditorLayout`)
 * invoca `addBlockAction` con lo stesso `defaultPropsFor` usato dalla `Menu` di
 * `BlockPalette`. Destinazione: dentro il blocco correntemente selezionato se è un
 * contenitore (stesso criterio `isContainer` di `EditorBlockWrapper`), altrimenti in fondo
 * alla radice — nessuna destinazione esplicita da scegliere prima di cliccare.
 */
import { createElement, useState } from 'react';
import { Text, TextInput } from '@mantine/core';
import { useDraggable } from '@dnd-kit/core';
import { IconSearch } from '@tabler/icons-react';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../../types/blocks.types';
import { blockIcon, defaultPropsFor } from '../BlockPalette';
import { useAuthStore } from '../../../../hooks/useAuth';
import {
  useBlockEditorStore,
  useNodeById,
  useSelectedId,
} from '../../../../hooks/useBlockEditorStore';
import styles from './WidgetPalette.module.css';

/**
 * Tipi assegnabili in generale: attivi, non deprecati, entro la soglia di ruolo — stesso
 * filtro di `allowedDescriptors` in `BlockPalette.tsx`, senza il filtro per contenitore
 * (`allowedChildTypes`/`canContainType`), che qui non ha senso: questa palette non è legata
 * a un genitore specifico.
 */
function assignableDescriptors(roleLevel: number | undefined): BlockTypeDescriptor[] {
  return BLOCK_TYPES.filter(
    (descriptor) =>
      descriptor.enabled &&
      !descriptor.deprecated &&
      (descriptor.minRole === undefined ||
        roleLevel === undefined ||
        roleLevel <= descriptor.minRole),
  );
}

interface WidgetTileProps {
  descriptor: BlockTypeDescriptor;
  /** Click-to-add: nessun movimento del puntatore, quindi mai un drag (vedi commento di testa). */
  onAdd: (descriptor: BlockTypeDescriptor) => void;
}

/** Una tessera trascinabile — e cliccabile — della libreria widget. */
function WidgetTile({ descriptor, onAdd }: WidgetTileProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new-block:${descriptor.type}`,
    data: { type: descriptor.type, isNew: true },
  });
  const label = descriptor.meta?.label ?? descriptor.type;
  // `createElement` invece del tag JSX `<Icon />`: `blockIcon` restituisce sempre lo stesso
  // riferimento stabile di `ICON_MAP` (mai una funzione creata qui), ma un tag JSX con nome
  // dinamico assegnato a una variabile locale è indistinguibile, per l'analisi statica di
  // React Compiler (`react-hooks/static-components`), da un componente creato a ogni render.
  const icon = createElement(blockIcon(descriptor.meta?.icon), { size: 20 });

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`${styles.tile} ${isDragging ? styles.dragging : ''}`}
      aria-label={`Inserisci il blocco ${label} (clic), o trascinalo per posizionarlo`}
      // `listeners` di `useDraggable` aggiunge solo gestori di puntatore (`onPointerDown`
      // e simili), mai `onClick`: un click nativo qui non è intercettato, e
      // `activationConstraint.distance` del sensore (`FullScreenEditorLayout`) garantisce
      // che un vero trascinamento non attivi anche questo `onClick`.
      onClick={() => onAdd(descriptor)}
      {...attributes}
      {...listeners}
    >
      {/* Wrapper di solo stile: l'icona resta lo stesso elemento stabile di `blockIcon`
          (nessuna modifica alla logica sopra), solo un colore d'accento fisso invece di
          ereditare `currentColor` dal testo della tessera. */}
      <span className={styles.tileIcon}>{icon}</span>
      <Text size="xs" className={styles.tileLabel}>
        {label}
      </Text>
    </button>
  );
}

/**
 * Destinazione di un click-to-add: dentro il nodo selezionato se è un contenitore (stesso
 * criterio `isContainer` di `EditorBlockWrapper.tsx` — `childrenAllow.length > 0`), altrimenti
 * in fondo alla radice. `index` di fallback ricalcato su `BlockPaletteProps.index` di
 * `BlockPalette.tsx`: `addBlockAction`/`addBlock` clampano comunque ai limiti validi.
 */
function clickInsertionTarget(selectedNode: { id: string; type: string } | undefined): {
  parentId: string | null;
  index: number;
} {
  if (!selectedNode) return { parentId: null, index: Number.MAX_SAFE_INTEGER };
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === selectedNode.type);
  const isContainer = (descriptor?.childrenAllow.length ?? 0) > 0;
  if (!isContainer) return { parentId: null, index: Number.MAX_SAFE_INTEGER };
  return { parentId: selectedNode.id, index: Number.MAX_SAFE_INTEGER };
}

/** Libreria dei tipi di blocco trascinabili — e cliccabili — con ricerca per etichetta. */
export default function WidgetPalette(): JSX.Element {
  const [query, setQuery] = useState('');
  const roleLevel = useAuthStore((state) => state.user?.role);
  const selectedId = useSelectedId();
  const selectedNode = useNodeById(selectedId);
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);

  const descriptors = assignableDescriptors(roleLevel).filter((descriptor) => {
    const label = descriptor.meta?.label ?? descriptor.type;
    return label.toLowerCase().includes(query.trim().toLowerCase());
  });

  function handleAdd(descriptor: BlockTypeDescriptor): void {
    const target = clickInsertionTarget(selectedNode);
    addBlockAction(target.parentId, descriptor.type, target.index, defaultPropsFor(descriptor));
  }

  return (
    <div className={styles.root}>
      <TextInput
        placeholder="Cerca widget..."
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        className={styles.search}
      />

      {descriptors.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" mt="md">
          Nessun widget trovato.
        </Text>
      ) : (
        <div className={styles.grid}>
          {descriptors.map((descriptor) => (
            <WidgetTile key={descriptor.type} descriptor={descriptor} onAdd={handleAdd} />
          ))}
        </div>
      )}
    </div>
  );
}

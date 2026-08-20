/**
 * Canvas dell'editor (PLAN-F04-editor-visivo.md T4): l'albero della bozza renderizzato
 * con i componenti di F02 e decorato dalla chrome di `EditorBlockWrapper`.
 *
 * Sottoscrive **solo gli id dei nodi di radice** (`useShallow`): la modifica di una prop
 * o l'aggiunta di un figlio dentro una sezione non fa ri-renderizzare il canvas, ma il
 * solo wrapper interessato (NFR § Performance — editor).
 *
 * Ospita il `DndContext` di dnd-kit (PLAN-F04c-editor-maturo.md T7): il drag & drop è uno
 * strato di input sopra `moveNodeToAction`, già validata e già invertibile — nessuna azione
 * nuova nasce qui. Lo stato del trascinamento in corso (`draggedLabel`, per il
 * `DragOverlay`) è un `useState` locale a questo componente, **mai** nello store Zustand:
 * un `set()` per movimento del puntatore ricalcolerebbe i selettori di tutto l'albero
 * (NFR § Performance — editor).
 */
import { useState } from 'react';
import { Paper, Stack, Text } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import BlockPalette from './BlockPalette';
import EditorBlockWrapper from './EditorBlockWrapper';

/** Payload di una zona di rilascio (`EditorBlockWrapper.tsx`): dove inserire il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

/** Etichetta leggibile del tipo trascinato, per il `DragOverlay`; il nome tecnico è un fallback. */
function draggedTypeLabel(event: DragStartEvent): string {
  const type = (event.active.data.current as { type?: string } | undefined)?.type;
  if (!type) return 'Blocco';
  return BLOCK_TYPES.find((entry) => entry.type === type)?.meta?.label ?? type;
}

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);

  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);

  // Puntatore + tastiera (dnd-kit T7): la tastiera è anche la via deterministica per i test
  // E2E futuri. `distance` evita che un click sulla maniglia (selezione, tooltip) venga
  // scambiato per un trascinamento di un pixel.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent): void {
    setDraggedLabel(draggedTypeLabel(event));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDraggedLabel(null);
    const { active, over } = event;
    if (!over) return;
    const target = over.data.current as DropTarget | undefined;
    if (!target) return;
    // Nessuna azione nuova: lo stesso comando invertibile e validato che muovono i
    // pulsanti indent/outdent/su/giù. `moveNodeToAction` no-opera da sola se il registro
    // non ammette il tipo lì, o se la destinazione è il nodo stesso o un suo discendente.
    moveNodeToAction(String(active.id), target.parentId, target.index);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedLabel(null)}
    >
      <Paper
        withBorder
        p="md"
        radius="md"
        // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
        // a "nessun blocco selezionato" una volta scelto un nodo.
        onClick={() => selectNode(null)}
      >
        <Stack gap="sm">
          {rootIds.length === 0 ? (
            <Text size="sm" c="dimmed">
              La bozza non contiene ancora blocchi. Aggiungi il primo blocco per iniziare.
            </Text>
          ) : (
            rootIds.map((id) => <EditorBlockWrapper key={id} id={id} />)
          )}

          <div onClick={(event) => event.stopPropagation()}>
            <BlockPalette parentId={null} label="Aggiungi blocco in fondo" />
          </div>
        </Stack>
      </Paper>

      <DragOverlay>
        {draggedLabel ? (
          <Paper withBorder p="xs" radius="sm" shadow="md">
            <Text size="sm" fw={600}>
              {draggedLabel}
            </Text>
          </Paper>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

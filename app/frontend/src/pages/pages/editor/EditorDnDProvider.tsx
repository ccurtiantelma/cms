/**
 * `DndContext` unico dell'editor (PLAN-F04c-editor-maturo.md T7): la sorgente di drag
 * (`WidgetPalette`, colonna sinistra) e le destinazioni (drop-zone di `EditorBlockWrapper`,
 * dentro il canvas) sono fratelli, quindi condividono l'istanza di questo provider, primo
 * antenato comune. Ospita sensori, ponte di misura cross-frame (ADR-72, `useCrossFrameMeasuring`),
 * auto-scroll (`useEditorAutoScroll`) e `EditorDragOverlay`.
 */
import { useState, type ReactNode, type RefObject } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { defaultPropsFor } from './block-registry.utils';
import EditorDragOverlay, { draggedBlockInfo, type DraggedBlockInfo } from './EditorDragOverlay';
import { editorCollisionDetection } from './editor-collision.utils';
import { isPaletteOrigin } from './iframe-canvas-measuring.utils';
import { useCrossFrameMeasuring } from './useCrossFrameMeasuring';
import { useEditorAutoScroll } from './useEditorAutoScroll';

/** Payload di una zona di rilascio (`EditorBlockWrapper.tsx`): dove inserire il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

export interface EditorDnDProviderProps {
  /** Elemento `<iframe>` del canvas, per la misura cross-frame. */
  iframeElRef: RefObject<HTMLIFrameElement | null>;
  /** Contenitore che scrolla durante il drag (`.canvasArea`). */
  canvasAreaRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export default function EditorDnDProvider({
  iframeElRef,
  canvasAreaRef,
  children,
}: EditorDnDProviderProps): JSX.Element {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const [draggedBlock, setDraggedBlock] = useState<DraggedBlockInfo | null>(null);
  const { measuring, dragOriginRef } = useCrossFrameMeasuring(iframeElRef);
  useEditorAutoScroll(canvasAreaRef, draggedBlock !== null);

  // Puntatore + tastiera: la tastiera è anche la via deterministica per i test E2E. `distance`
  // evita che un click (selezione, tooltip, click-to-add) sia scambiato per un trascinamento.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function endDrag(): void {
    dragOriginRef.current = null;
    setDraggedBlock(null);
  }

  function handleDragStart(event: DragStartEvent): void {
    // Origine del drag (ADR-72 § "Decisione" punto 3): tessera di `WidgetPalette` (documento
    // padre) contro riordino di un nodo esistente (DOM portato nell'iframe).
    dragOriginRef.current = isPaletteOrigin(String(event.active.id)) ? 'parent' : 'iframe';
    setDraggedBlock(draggedBlockInfo(event));
  }

  function handleDragEnd(event: DragEndEvent): void {
    endDrag();
    const { active, over } = event;
    if (!over) return;
    const target = over.data.current as DropTarget | undefined;
    if (!target) return;
    const activeData = active.data.current as { type?: string; isNew?: boolean } | undefined;
    if (activeData?.isNew) {
      // Tessera di `WidgetPalette` (id sintetico `new-block:<type>`): stessa `addBlockAction`
      // della `Menu` click-to-add di `BlockPalette`.
      const descriptor = BLOCK_TYPES.find((entry) => entry.type === activeData.type);
      if (!descriptor) return;
      addBlockAction(target.parentId, descriptor.type, target.index, defaultPropsFor(descriptor));
      return;
    }
    // Riordino: lo stesso comando invertibile e validato dei pulsanti indent/outdent/su/giù.
    moveNodeToAction(String(active.id), target.parentId, target.index);
  }

  return (
    <DndContext
      sensors={sensors}
      // `pointerWithin` + contenitore più profondo (`editor-collision.utils.ts`): un drop su un
      // contenitore con figli inserisce sempre nei `children` di QUEL contenitore.
      collisionDetection={editorCollisionDetection}
      // Senza il ponte cross-frame un drag che attraversa il confine iframe↔padre risolve
      // sempre `over: null` (ADR-72 § "Decisione" punto 3).
      measuring={measuring}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
    >
      {children}
      <EditorDragOverlay draggedBlock={draggedBlock} />
    </DndContext>
  );
}

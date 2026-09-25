/**
 * `DndContext` unico dell'editor (PLAN-F04c-editor-maturo.md T7): la sorgente di drag
 * (`WidgetPalette`, colonna sinistra) e le destinazioni (drop-zone di `EditorBlockWrapper`,
 * dentro il canvas) sono fratelli, quindi condividono l'istanza di questo provider, primo
 * antenato comune. Ospita sensori, ponte di misura cross-frame (ADR-72, `useCrossFrameMeasuring`),
 * auto-scroll (`useEditorAutoScroll`, via `EditorDragEffects`) e `EditorDragOverlay`.
 */
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { defaultPropsFor } from './block-registry.utils';
import EditorDragOverlay, { draggedBlockInfo, type DraggedBlockInfo } from './EditorDragOverlay';
import { editorCollisionDetection } from './editor-collision.utils';
import { frameScaleOf, isPaletteOrigin } from './iframe-canvas-measuring.utils';
import { useCrossFrameMeasuring } from './useCrossFrameMeasuring';
import { useEditorAutoScroll } from './useEditorAutoScroll';

/** Payload di una zona di rilascio (`EditorBlockWrapper.tsx`): dove inserire il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

/** Scarto (px) fra il cursore e l'angolo in alto a sinistra del ghost. */
const GHOST_CURSOR_OFFSET_PX = 14;

/**
 * Componente figlio di `DndContext` (serve `useDndContext`): auto-scroll del canvas e
 * rimisura delle zone di rilascio dopo ogni scroll — i rettangoli misurati a inizio drag
 * diventano stantii appena l'iframe scrolla, e `pointerWithin` risolverebbe la zona sbagliata.
 */
function EditorDragEffects({
  iframeElRef,
  canvasAreaRef,
  isDragActive,
}: {
  iframeElRef: RefObject<HTMLIFrameElement | null>;
  canvasAreaRef: RefObject<HTMLElement | null>;
  isDragActive: boolean;
}): null {
  const { measureDroppableContainers, droppableContainers } = useDndContext();
  const remeasure = useCallback(() => {
    measureDroppableContainers(droppableContainers.getEnabled().map((container) => container.id));
  }, [measureDroppableContainers, droppableContainers]);
  useEditorAutoScroll({ iframeElRef, canvasAreaRef, isDragActive, onScroll: remeasure });
  return null;
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

  // Puntatore + tastiera: la tastiera è anche la via deterministica per i test E2E. `distance`
  // evita che un click (selezione, tooltip, click-to-add) sia scambiato per un trascinamento.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Un drag nato nel padre (palette) non riceve `pointermove` mentre il puntatore è sopra
  // l'`<iframe>`: il browser li consegna al documento dell'iframe, dnd-kit (che ascolta il
  // padre) perde il puntatore, ghost e zona `over` restano congelati sul bordo — il blocco
  // "incastrato" sopra il canvas. Durante il drag l'iframe lascia quindi passare il puntatore
  // al padre (`pointer-events: none`); il riordino, nato nell'iframe, ne mantiene la cattura.
  function setIframePassthrough(enabled: boolean): void {
    const iframe = iframeElRef.current;
    if (iframe) iframe.style.pointerEvents = enabled ? 'none' : '';
  }

  // Rete di sicurezza: se il provider si smonta a drag in corso l'iframe non resta muto.
  useEffect(
    () => () => {
      const iframe = iframeElRef.current;
      if (iframe) iframe.style.pointerEvents = '';
    },
    [iframeElRef],
  );

  function endDrag(): void {
    dragOriginRef.current = null;
    setIframePassthrough(false);
    setDraggedBlock(null);
  }

  // Ghost ancorato al cursore. Le coordinate del puntatore sono quelle del documento di
  // origine del drag (padre per la palette, iframe per il riordino) mentre `DragOverlay` è
  // sempre nel padre: per l'origine iframe si riporta l'offset e la scala del riquadro,
  // altrimenti il ghost compare sfalsato dell'offset dell'iframe rispetto al cursore.
  const ghostFollowsCursor: Modifier = useCallback(
    ({ transform, activatorEvent, activeNodeRect }) => {
      const start = activatorEvent ? getEventCoordinates(activatorEvent) : null;
      if (!start || !activeNodeRect) return transform;
      const iframe = iframeElRef.current;
      const fromIframe = dragOriginRef.current === 'iframe' && iframe !== null;
      const frameRect = fromIframe ? iframe.getBoundingClientRect() : null;
      const scale = frameRect && iframe ? frameScaleOf(frameRect.width, iframe.offsetWidth) : 1;
      const cursorX = (frameRect?.left ?? 0) + (start.x + transform.x) * scale;
      const cursorY = (frameRect?.top ?? 0) + (start.y + transform.y) * scale;
      return {
        ...transform,
        x: cursorX + GHOST_CURSOR_OFFSET_PX - activeNodeRect.left,
        y: cursorY + GHOST_CURSOR_OFFSET_PX - activeNodeRect.top,
      };
    },
    [iframeElRef, dragOriginRef],
  );

  function handleDragStart(event: DragStartEvent): void {
    // Origine del drag (ADR-72 § "Decisione" punto 3): tessera di `WidgetPalette` (documento
    // padre) contro riordino di un nodo esistente (DOM portato nell'iframe).
    const fromPalette = isPaletteOrigin(String(event.active.id));
    dragOriginRef.current = fromPalette ? 'parent' : 'iframe';
    setIframePassthrough(fromPalette);
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
      <EditorDragEffects
        iframeElRef={iframeElRef}
        canvasAreaRef={canvasAreaRef}
        isDragActive={draggedBlock !== null}
      />
      <EditorDragOverlay draggedBlock={draggedBlock} modifiers={[ghostFollowsCursor]} />
    </DndContext>
  );
}

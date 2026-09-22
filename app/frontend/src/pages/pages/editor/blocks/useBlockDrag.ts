/**
 * Drag & drop (dnd-kit, T7) di un singolo nodo: `useDraggable` per il nodo stesso, le tre
 * zone di rilascio (prima/dopo/dentro) e lo stato del trascinamento in corso letto da
 * `DndContext`. Nessuno stato di drag entra mai nello store Zustand: `active`/`isOver` vivono
 * nel `DndContext` di `EditorCanvas.tsx`, letti qui solo per decidere cosa disegnare.
 */
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import { canDropInto } from '../block-registry.utils';

/**
 * Attributi `data-*` di una zona di rilascio: se il puntatore ci sta sopra (`isOver`), e se
 * quel drop sarebbe ammesso — letto con `canDropInto` sull'albero corrente (`getState().tree`,
 * non una sottoscrizione: durante l'hover l'albero non cambia). I tre segni di rilascio
 * (linea, evidenziazione, rifiuto) sono tutti CSS su questi due attributi.
 */
export function dropZoneAttrs(
  isOver: boolean,
  activeDragId: string | null,
  activeDragType: string | undefined,
  targetParentId: string | null,
): { 'data-over': boolean; 'data-rejected': boolean } {
  const rejected =
    isOver && activeDragId !== null
      ? !canDropInto(
          useBlockEditorStore.getState().tree,
          activeDragId,
          targetParentId,
          activeDragType,
        )
      : false;
  return { 'data-over': isOver, 'data-rejected': rejected };
}

interface UseBlockDragArgs {
  id: string;
  type: string | undefined;
  parentId: string | null | undefined;
  index: number | undefined;
  childCount: number;
  /**
   * Il trascinamento generale del nodo cede sempre il passo a un gesto più specifico già in
   * corso sullo stesso puntatore: editing di testo, resize della maniglia di `container` o
   * della maniglia inter-colonna di `section`.
   */
  disabled: boolean;
}

export function useBlockDrag({
  id,
  type,
  parentId,
  index,
  childCount,
  disabled,
}: UseBlockDragArgs) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id,
    data: { type },
    disabled,
  });
  const { setNodeRef: setDropBeforeRef, isOver: isOverBefore } = useDroppable({
    id: `before:${id}`,
    data: { parentId: parentId ?? null, index: index ?? 0 },
  });
  const { setNodeRef: setDropAfterRef, isOver: isOverAfter } = useDroppable({
    id: `after:${id}`,
    data: { parentId: parentId ?? null, index: (index ?? 0) + 1 },
  });
  const { setNodeRef: setDropInsideRef, isOver: isOverInside } = useDroppable({
    id: `inside:${id}`,
    data: { parentId: id, index: childCount },
  });
  const { active } = useDndContext();
  const activeDragId = active ? String(active.id) : null;
  const activeDragType = active
    ? (active.data.current as { type?: string } | undefined)?.type
    : undefined;

  return {
    attributes,
    listeners,
    setDragRef,
    isDragging,
    setDropBeforeRef,
    setDropAfterRef,
    setDropInsideRef,
    isOverBefore,
    isOverAfter,
    isOverInside,
    activeDragId,
    activeDragType,
  };
}

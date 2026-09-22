/**
 * Larghezza del `container` (E03, percentuale del padre). L'anteprima passa dallo store
 * (`setContainerResizePreview`, mai history); il rilascio committa **un solo** punto di undo/redo.
 */
import { useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  useBlockEditorStore,
  useContainerResizePercent,
} from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import {
  CONTAINER_WIDTH_PROP,
  containerWidthPercentFromPointer,
  readContainerWidthPercent,
  resolveContainerWidthSpec,
  resolveLayoutParentWidth,
} from '../container-resize.utils';
import { releaseHandleCapture, type ResizePointerHandlers } from './resize-pointer';

const CONTAINER_WIDTH_SPEC = resolveContainerWidthSpec();

interface UseContainerWidthResizeArgs {
  id: string;
  node: BlockNode | undefined;
  wrapperRef: RefObject<HTMLDivElement | null>;
  isSelected: boolean;
}

export function useContainerWidthResize({
  id,
  node,
  wrapperRef,
  isSelected,
}: UseContainerWidthResizeArgs) {
  const setPreview = useBlockEditorStore((state) => state.setContainerResizePreview);
  const clearPreview = useBlockEditorStore((state) => state.clearContainerResizePreview);
  const commitWidth = useBlockEditorStore((state) => state.commitContainerWidthAction);
  const previewPercent = useContainerResizePercent(id);

  const [isResizingWidth, setIsResizingWidth] = useState(false);
  /**
   * `originLeft` (bordo sinistro al `pointerdown`, fisso: un `justifyContent` centrato lo farebbe
   * scivolare) e `parentWidth` si misurano una volta sola; `lastPercent` è ciò che si committa.
   */
  const dragRef = useRef<{ originLeft: number; parentWidth: number; lastPercent: number } | null>(
    null,
  );

  /** Solo un `container` **selezionato** (mai su hover) e solo se il registro dichiara la prop. */
  const showContainerResizeHandle =
    node?.type === 'container' && isSelected && CONTAINER_WIDTH_SPEC !== null;
  const persistedPercent = readContainerWidthPercent(node?.props[CONTAINER_WIDTH_PROP]);
  const effectiveWidthPercent = previewPercent ?? persistedPercent;
  /** Inline: percentuale continua. `flexGrow/flexShrink: 0` servono quanto la larghezza. */
  const widthStyle: CSSProperties | undefined =
    effectiveWidthPercent === null
      ? undefined
      : { width: `${effectiveWidthPercent}%`, flexGrow: 0, flexShrink: 0 };

  const widthHandlers: ResizePointerHandlers = {
    onPointerDown(event) {
      event.stopPropagation();
      if (!CONTAINER_WIDTH_SPEC) return;
      const wrapperEl = wrapperRef.current;
      const parentWidth = resolveLayoutParentWidth(wrapperEl);
      if (!wrapperEl || parentWidth === null) return;

      const rect = wrapperEl.getBoundingClientRect();
      // Il badge parte dalla larghezza reale del nodo, non dal solo valore persistito.
      const startPercent =
        containerWidthPercentFromPointer(
          rect.left + rect.width,
          rect.left,
          parentWidth,
          CONTAINER_WIDTH_SPEC,
        ) ?? CONTAINER_WIDTH_SPEC.max;

      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { originLeft: rect.left, parentWidth, lastPercent: startPercent };
      setIsResizingWidth(true);
      setPreview(id, startPercent);
    },
    onPointerMove(event) {
      const drag = dragRef.current;
      if (!drag || !CONTAINER_WIDTH_SPEC) return;
      const percent = containerWidthPercentFromPointer(
        event.clientX,
        drag.originLeft,
        drag.parentWidth,
        CONTAINER_WIDTH_SPEC,
      );
      if (percent === null) return;
      drag.lastPercent = percent;
      setPreview(id, percent);
    },
    onPointerUp(event) {
      releaseHandleCapture(event);
      const drag = dragRef.current;
      dragRef.current = null;
      setIsResizingWidth(false);
      if (drag) commitWidth(id, drag.lastPercent);
    },
    onPointerCancel(event) {
      releaseHandleCapture(event);
      dragRef.current = null;
      setIsResizingWidth(false);
      clearPreview();
    },
  };

  return {
    isResizingWidth,
    showContainerResizeHandle,
    effectiveWidthPercent,
    widthStyle,
    widthHandlers,
  };
}

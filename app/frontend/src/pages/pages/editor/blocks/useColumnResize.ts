/**
 * Ripartizione inter-colonna della `section` (`columnRatio`). L'anteprima passa dallo store
 * (`setColumnResizePreview`, mai history); il rilascio committa **un solo** punto di undo/redo.
 * I dati del gesto vivono in un ref: cambiano a ogni `pointermove`, un re-render per pixel non serve.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  useBlockEditorStore,
  useColumnResizeRatio,
  type EditorViewport,
} from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import {
  resolveColumnRatio,
  resolveColumnRatioFromFraction,
  type ColumnRatioValue,
} from '../column-resize.utils';
import { resolveEffectiveResponsiveValue } from './block-wrapper.constants';
import { releaseHandleCapture, type ResizePointerHandlers } from './resize-pointer';

interface UseColumnResizeArgs {
  id: string;
  node: BlockNode | undefined;
  activeViewport: EditorViewport;
  childCount: number;
}

export function useColumnResize({ id, node, activeViewport, childCount }: UseColumnResizeArgs) {
  const setPreview = useBlockEditorStore((state) => state.setColumnResizePreview);
  const clearPreview = useBlockEditorStore((state) => state.clearColumnResizePreview);
  const commitRatio = useBlockEditorStore((state) => state.commitColumnRatioAction);
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const previewRatio = useColumnResizeRatio(id);

  /** `true` mentre la maniglia è sotto trascinamento (il chiamante disabilita il drag del nodo). */
  const [isResizingColumns, setIsResizingColumns] = useState(false);
  /** `containerEl` (la `<section>`, misurata al `pointerdown`) e `lastRatio` (stop da committare). */
  const dragRef = useRef<{ containerEl: HTMLElement; lastRatio: ColumnRatioValue } | null>(null);

  const props = node?.props ?? {};
  /** Solo `section` con due figli e `columns` effettivo `'2'` sul viewport attivo. */
  const showColumnResizer =
    node?.type === 'section' &&
    childCount === 2 &&
    resolveEffectiveResponsiveValue(props.columns, activeViewport) === '2';
  const persistedRatio = resolveColumnRatio(props.columnRatio);
  /** L'anteprima del trascinamento vince sul valore persistito finché il gesto dura. */
  const effectiveColumnRatio = previewRatio ?? persistedRatio;
  /** Colonne effettive (1-4) per il viewport attivo, per i segnaposto dello stato vuoto. */
  const parsedColumns = Number(resolveEffectiveResponsiveValue(props.columns, activeViewport));
  const effectiveColumnsCount =
    Number.isInteger(parsedColumns) && parsedColumns >= 1 && parsedColumns <= 4 ? parsedColumns : 1;

  const columnHandlers: ResizePointerHandlers = {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      event.stopPropagation();
      selectNode(id);
      const handle = event.currentTarget;
      // `.childrenArea` (`display: contents`) è il genitore diretto; la `<section>` è il suo genitore.
      const containerEl = handle.parentElement?.parentElement;
      if (!containerEl) return;
      handle.setPointerCapture(event.pointerId);
      dragRef.current = { containerEl, lastRatio: persistedRatio };
      setIsResizingColumns(true);
      setPreview(id, persistedRatio);
    },
    onPointerMove(event) {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = drag.containerEl.getBoundingClientRect();
      if (rect.width === 0) return;
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const nextRatio = resolveColumnRatioFromFraction(fraction);
      if (nextRatio !== drag.lastRatio) {
        drag.lastRatio = nextRatio;
        setPreview(id, nextRatio);
      }
    },
    onPointerUp(event) {
      releaseHandleCapture(event);
      const drag = dragRef.current;
      dragRef.current = null;
      setIsResizingColumns(false);
      if (drag) commitRatio(id, drag.lastRatio);
    },
    /** `pointercancel`: l'anteprima si butta via **senza** committare. */
    onPointerCancel(event) {
      releaseHandleCapture(event);
      dragRef.current = null;
      setIsResizingColumns(false);
      clearPreview();
    },
  };

  return {
    isResizingColumns,
    showColumnResizer,
    effectiveColumnRatio,
    effectiveColumnsCount,
    columnHandlers,
  };
}

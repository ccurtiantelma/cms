/**
 * Ridimensionamento responsive di un blocco (ADR-71): compone la larghezza del `container`
 * (`useContainerWidthResize`), la ripartizione delle colonne della `section` (`useColumnResize`)
 * (le maniglie di resize sul box selezionato non sono più montate, ADR-95). `isResizing` va passato a `useBlockDrag`
 * (`disabled`): altrimenti il `PointerSensor` leggerebbe lo stesso `pointermove` come l'inizio
 * di uno spostamento dell'intero nodo.
 */
import type { RefObject } from 'react';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import { useColumnResize } from './useColumnResize';
import { useContainerWidthResize } from './useContainerWidthResize';

interface UseBlockResizeArgs {
  id: string;
  /** `undefined` se il nodo è sparito dall'albero: i valori derivati restano neutri. */
  node: BlockNode | undefined;
  wrapperRef: RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  activeViewport: EditorViewport;
  childCount: number;
}

export function useBlockResize({
  id,
  node,
  wrapperRef,
  isSelected,
  activeViewport,
  childCount,
}: UseBlockResizeArgs) {
  const width = useContainerWidthResize({ id, node, wrapperRef, isSelected });
  const columns = useColumnResize({ id, node, activeViewport, childCount });

  return {
    ...width,
    ...columns,
    isResizing: width.isResizingWidth || columns.isResizingColumns,
  };
}

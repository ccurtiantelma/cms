import { useDroppable } from '@dnd-kit/core';
import { dropZoneAttrs } from './useBlockDrag';
import styles from '../EditorBlockWrapper.module.css';

interface ColumnDropTargetProps {
  parentId: string;
  columnIndex: number;
  columnCount: number;
  activeDragId: string | null;
  activeDragType: string | undefined;
}

/** Bersaglio visibile per inserire un blocco nella singola colonna di una Section. */
export default function ColumnDropTarget({
  parentId,
  columnIndex,
  columnCount,
  activeDragId,
  activeDragType,
}: ColumnDropTargetProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-column:${parentId}:${columnIndex}`,
    data: { parentId, index: columnIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.columnDropTarget}
      style={{ left: `${(columnIndex * 100) / columnCount}%`, width: `${100 / columnCount}%` }}
      {...dropZoneAttrs(isOver, activeDragId, activeDragType, parentId)}
      aria-label={`Drop target Colonna ${columnIndex + 1}`}
    />
  );
}

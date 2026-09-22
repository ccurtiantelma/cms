import type { Ref } from 'react';
import { dropZoneAttrs } from './useBlockDrag';
import styles from '../EditorBlockWrapper.module.css';

interface BlockDropZoneProps {
  position: 'before' | 'after';
  registerRef: Ref<HTMLDivElement>;
  isOver: boolean;
  activeDragId: string | null;
  activeDragType: string | undefined;
  parentId: string | null;
}

/** Zona di rilascio prima/dopo: annidata nel wrapper, non fratello, per non diventare grid item vero. */
export default function BlockDropZone({
  position,
  registerRef,
  isOver,
  activeDragId,
  activeDragType,
  parentId,
}: BlockDropZoneProps): JSX.Element {
  const positionClass = position === 'before' ? styles.dropZoneBefore : styles.dropZoneAfter;
  return (
    <div
      ref={registerRef}
      className={`${styles.dropZone} ${positionClass}`}
      {...dropZoneAttrs(isOver, activeDragId, activeDragType, parentId)}
    />
  );
}

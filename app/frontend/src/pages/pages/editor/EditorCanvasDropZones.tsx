/**
 * Zone di drop e di inserimento primario del canvas, a livello radice. Isolate da
 * `EditorCanvas.tsx` (Wave 3): condividono lo stesso schema dati `{ parentId, index }` letto da
 * `FullScreenEditorLayout.handleDragEnd`, quindi ogni zona resta un semplice `useDroppable`.
 *
 * Niente Mantine qui (documento iframe di ADR-72): `CanvasSectionInserter` resta il
 * componente già in uso, questo file si limita a fissare il suo contratto sulla radice
 * (`parentId: null`). `CanvasAddSectionZone` non è più montata da qui (T-canvas-declutter-2):
 * i suoi tre trigger vivono ora in `CanvasBreadcrumbBar` (`EditorCanvasThemeFrame.tsx`).
 */
import { useDroppable } from '@dnd-kit/core';
import CanvasSectionInserter from './CanvasSectionInserter';
import styles from './EditorCanvasDropZones.module.css';

/**
 * Bersaglio del primo blocco su albero vuoto (`root-empty-dropzone`): senza un nodo in radice
 * non c'è nessuna striscia `before`/`after` di `EditorBlockWrapper` su cui rilasciare. A riposo
 * è una striscia quasi invisibile, si allarga ed evidenzia solo durante un trascinamento
 * (`data-over`).
 */
export function EmptyRootDropZone(): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: 'root-empty-dropzone',
    data: { parentId: null, index: 0 },
  });
  return <div ref={setNodeRef} className={styles.emptyDropzone} data-over={isOver} />;
}

/** Striscia di drop invisibile fra due sezioni radice (o prima della prima). */
export function RootSectionInserter({ index }: { index: number }): JSX.Element {
  return <CanvasSectionInserter index={index} />;
}

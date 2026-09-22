/**
 * Zone di drop e di inserimento primario del canvas, a livello radice. Isolate da
 * `EditorCanvas.tsx` (Wave 3): condividono lo stesso schema dati `{ parentId, index }` letto da
 * `FullScreenEditorLayout.handleDragEnd`, quindi ogni zona resta un semplice `useDroppable`.
 *
 * Niente Mantine qui (documento iframe di ADR-72): `CanvasAddSectionZone` e
 * `CanvasSectionInserter` restano i componenti già in uso, questo file si limita a fissare il
 * loro contratto sulla radice (`parentId: null`).
 */
import { useDroppable } from '@dnd-kit/core';
import CanvasAddSectionZone from './CanvasAddSectionZone';
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

/** Box "Aggiungi sezione" (struttura/template/widget) alla posizione `index` della radice. */
export function RootAddSectionZone({ index }: { index: number }): JSX.Element {
  return <CanvasAddSectionZone parentId={null} index={index} />;
}

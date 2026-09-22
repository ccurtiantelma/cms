/**
 * Stato vuoto del canvas (albero senza blocchi radice): nessun contenuto visivo proprio oltre
 * al box "Aggiungi sezione" (`CanvasAddSectionZone`), più la drop-zone invisibile che accoglie
 * il primo blocco trascinato dalla palette.
 */
import { EmptyRootDropZone, RootAddSectionZone } from './EditorCanvasDropZones';

export default function EditorCanvasEmptyState(): JSX.Element {
  return (
    <>
      <EmptyRootDropZone />
      <RootAddSectionZone index={0} />
    </>
  );
}

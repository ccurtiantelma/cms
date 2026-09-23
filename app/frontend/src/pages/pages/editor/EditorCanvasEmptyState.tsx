/**
 * Stato vuoto del canvas (albero senza blocchi radice): solo la drop-zone invisibile che
 * accoglie il primo blocco trascinato dalla palette. Il box "Aggiungi sezione" non è più
 * renderizzato qui (T-canvas-declutter-2): i suoi tre trigger vivono ora nella riga sticky
 * del breadcrumb (`CanvasBreadcrumbBar`, `EditorCanvasThemeFrame.tsx`), sempre visibile anche
 * su un albero vuoto.
 */
import { EmptyRootDropZone } from './EditorCanvasDropZones';

export default function EditorCanvasEmptyState(): JSX.Element {
  return <EmptyRootDropZone />;
}

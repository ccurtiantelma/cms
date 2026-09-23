/**
 * Iterazione dei nodi di livello radice: una striscia di inserimento prima di ogni sezione e
 * il wrapper di ciascun blocco. Riceve solo gli id: la modifica di una prop dentro una
 * sezione non ri-renderizza la lista, ma il solo `EditorBlockWrapper` interessato.
 *
 * Il box "Aggiungi sezione" non è più in coda a questa lista (T-canvas-declutter-2): i suoi
 * tre trigger vivono ora nella riga sticky del breadcrumb (`CanvasBreadcrumbBar`,
 * `EditorCanvasThemeFrame.tsx`), montata una sola volta da `EditorCanvas.tsx`.
 */
import EditorBlockWrapper from './EditorBlockWrapper';
import { RootSectionInserter } from './EditorCanvasDropZones';

interface EditorCanvasRootListProps {
  rootIds: string[];
}

export default function EditorCanvasRootList({ rootIds }: EditorCanvasRootListProps): JSX.Element {
  return (
    <>
      <RootSectionInserter index={0} />
      {rootIds.flatMap((id, index) => [
        <EditorBlockWrapper key={id} id={id} />,
        <RootSectionInserter key={`inserter-${index + 1}`} index={index + 1} />,
      ])}
    </>
  );
}

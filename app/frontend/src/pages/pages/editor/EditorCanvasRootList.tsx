/**
 * Iterazione dei nodi di livello radice: una striscia di inserimento prima di ogni sezione,
 * il wrapper di ciascun blocco e, in coda, il box "Aggiungi sezione" (sempre presente, come
 * in Elementor Pro). Riceve solo gli id: la modifica di una prop dentro una sezione non
 * ri-renderizza la lista, ma il solo `EditorBlockWrapper` interessato.
 */
import EditorBlockWrapper from './EditorBlockWrapper';
import { RootAddSectionZone, RootSectionInserter } from './EditorCanvasDropZones';

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
      <RootAddSectionZone index={rootIds.length} />
    </>
  );
}

import { useDroppable } from '@dnd-kit/core';
import CanvasDropIndicator from './CanvasDropIndicator';
import styles from './CanvasSectionInserter.module.css';

interface CanvasSectionInserterProps {
  /** Posizione fra i nodi radice in cui inserire la nuova sezione. */
  index: number;
}

/**
 * Striscia di drop fra le sezioni radice, invisibile a riposo: nessun pulsante "+"
 * persistente (rimosso, richiesta esplicita del task — l'editor deve restare identico a
 * Elementor Pro, dove fra le sezioni non c'è un trigger isolato sempre visibile). Resta
 * solo come bersaglio `useDroppable` per il drag & drop di un widget dalla sidebar
 * (`FullScreenEditorLayout.handleDragEnd`), con l'indicatore magenta di `CanvasDropIndicator`
 * mostrato solo durante il trascinamento sopra di lei (`data-over`). L'aggiunta di una nuova
 * Section fra due sezioni esistenti resta raggiungibile dalla voce "Sezione" del menu
 * "Inserisci sopra/sotto" (`BlockPalette`, montata dalla toolbar integrata di
 * `EditorBlockWrapper.tsx`) o dal box `CanvasAddSectionZone` in fondo al canvas.
 */
export default function CanvasSectionInserter({
  index,
}: CanvasSectionInserterProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `root-section-inserter:${index}`,
    data: { parentId: null, index },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.inserter}
      data-over={isOver}
      onClick={(event) => event.stopPropagation()}
    >
      <CanvasDropIndicator visible={isOver} />
    </div>
  );
}

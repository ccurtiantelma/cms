/**
 * Canvas dell'editor (PLAN-F04-editor-visivo.md T4): l'albero della bozza renderizzato
 * con i componenti di F02 e decorato dalla chrome di `EditorBlockWrapper`.
 *
 * Sottoscrive **solo gli id dei nodi di radice** (`useShallow`): la modifica di una prop
 * o l'aggiunta di un figlio dentro una sezione non fa ri-renderizzare il canvas, ma il
 * solo wrapper interessato (NFR § Performance — editor).
 *
 * Il `DndContext` di dnd-kit (PLAN-F04c-editor-maturo.md T7) non vive più qui: da quando la
 * sidebar Widgets (`EditorSidebar`) è una sorgente di drag, il primo antenato comune fra
 * sidebar e canvas è `FullScreenEditorLayout`, che ora lo ospita — vedi il commento di testa
 * di quel file.
 *
 * Lo stato vuoto ("nessun blocco") è anche una drop-zone (`useDroppable`, id
 * `root-empty-dropzone`, stesso schema dati `{ parentId, index }` letto da
 * `FullScreenEditorLayout.handleDragEnd`): senza un nodo già in radice non c'è nessuna
 * striscia `before`/`after` di `EditorBlockWrapper` su cui rilasciare il primo blocco. Il
 * div resta montato — solo invisibile, senza contenuto proprio — anche ad albero vuoto:
 * la resa visiva "Aggiungi sezione" è ora interamente di `CanvasAddSectionZone`, montata
 * subito sotto, che occupa la stessa funzione sia ad albero vuoto sia pieno.
 */
import { useShallow } from 'zustand/react/shallow';
import { Stack } from '@mantine/core';
import { useDroppable } from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import CanvasAddSectionZone from './CanvasAddSectionZone';
import EditorBlockWrapper from './EditorBlockWrapper';
import styles from './EditorCanvas.module.css';

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const { setNodeRef: setEmptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: 'root-empty-dropzone',
    data: { parentId: null, index: 0 },
  });

  return (
    <div
      className={styles.canvasRoot}
      // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
      // a "nessun blocco selezionato" una volta scelto un nodo.
      onClick={() => selectNode(null)}
    >
      <Stack gap="sm">
        {rootIds.length === 0 ? (
          // Nessun contenuto visivo proprio (scelta di giudizio, vedi il commento di testa):
          // la resa "Aggiungi sezione" è ora interamente di `CanvasAddSectionZone`, montata
          // subito sotto anche in questo ramo. Il div resta solo come bersaglio
          // `useDroppable` per il primo blocco trascinato — a riposo è una striscia quasi
          // invisibile (`EditorCanvas.module.css`), che si allarga ed evidenzia in magenta
          // solo durante un trascinamento sopra di lei (`data-over`).
          <div ref={setEmptyDropRef} className={styles.emptyDropzone} data-over={isOverEmpty} />
        ) : (
          rootIds.map((id) => <EditorBlockWrapper key={id} id={id} />)
        )}

        {/* Zona "Aggiungi sezione" (sostituisce il vecchio popover `BlockPalette` di
            "Aggiungi blocco in fondo"), sempre montata in coda: sia ad albero vuoto sia
            pieno, un solo punto di ingresso invece di due meccaniche separate. */}
        <CanvasAddSectionZone parentId={null} index={rootIds.length} />
      </Stack>
    </div>
  );
}

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
 * **Questo componente è il `canvasTree` proiettato nell'iframe da `IframeCanvas.tsx`**
 * (`ADR-72-canvas-iframe-portal-bridge.md`): resta lo stesso codice sorgente già in uso prima
 * di quella ADR, non duplicato — il montaggio nell'iframe via `ReactDOM.createPortal` è
 * interamente responsabilità del chiamante (`IframeCanvas.tsx`, `FullScreenEditorLayout.tsx`),
 * questo file resta agnostico di dove il proprio DOM finisce fisicamente montato. Per lo
 * stesso motivo **non importa Mantine**: essendo montato nel `document` isolato dell'iframe
 * (CSS Modules propri + markup semantico, mai una classe Mantine il cui foglio di stile vive
 * solo nel `document` padre — CLAUDE.md § Regola Mantine, isolamento CSS di ADR-72 § "Decisione"
 * punto 1/ADR-70 § "Decisione" punto 5).
 *
 * Lo stato vuoto ("nessun blocco") è anche una drop-zone (`useDroppable`, id
 * `root-empty-dropzone`, stesso schema dati `{ parentId, index }` letto da
 * `FullScreenEditorLayout.handleDragEnd`): senza un nodo già in radice non c'è nessuna
 * striscia `before`/`after` di `EditorBlockWrapper` su cui rilasciare il primo blocco. Il
 * div resta montato — solo invisibile, senza contenuto proprio — anche ad albero vuoto:
 * la resa visiva "Aggiungi sezione" ad albero vuoto è di `CanvasAddSectionZone` (i tre
 * trigger fedeli a Elementor Pro — struttura/template/widget — più il modal a due passi
 * `SectionStructureModal`). Quella stessa `CanvasAddSectionZone` resta montata anche ad
 * albero pieno, in fondo al canvas dopo l'ultimo blocco radice (`index={rootIds.length}`):
 * sempre presente come in Elementor Pro, non solo a pagina vuota (richiesta esplicita del
 * task). Le strisce `CanvasSectionInserter` fra le sezioni radice non portano invece un
 * pulsante "+" visibile (rimosso nello stesso task — nessun trigger isolato sempre visibile
 * lì), restano solo bersaglio invisibile del drag & drop; l'inserimento puntuale fra due
 * sezioni esistenti resta comunque raggiungibile dalla voce "Sezione" del menu "Inserisci
 * sopra/sotto" di ogni Section (`BlockPalette`, toolbar di `EditorBlockWrapper.tsx`).
 *
 * Porta anche `GLOBAL_TOKENS_CANVAS_SCOPE_CLASS` (`libs/globalTokensCompiler.ts`): è il
 * selettore su cui `IframeCanvas.tsx` scopa, nel documento dell'iframe, sia il CSS compilato
 * dei Global Design Tokens sia (storicamente, quando il canvas viveva nel documento padre) il
 * `ThemeConfig` dell'Editor tema — quest'ultimo ora scopato su `:root` di quel documento
 * dedicato (`IframeCanvas.tsx`, non serve più una classe di scope quando il documento è
 * esclusivo del canvas). Il Canvas mostra quindi ciò che il visitatore vedrà, non l'aspetto
 * della chrome amministrativa attorno, che resta sui default di fabbrica di Mantine.
 */
import { useShallow } from 'zustand/react/shallow';
import { useDroppable } from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { GLOBAL_TOKENS_CANVAS_SCOPE_CLASS } from '../../../libs/globalTokensCompiler';
import CanvasAddSectionZone from './CanvasAddSectionZone';
import CanvasContextMenu from './CanvasContextMenu';
import CanvasSectionInserter from './CanvasSectionInserter';
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
    <CanvasContextMenu>
      <div
        // `GLOBAL_TOKENS_CANVAS_SCOPE_CLASS` è il selettore su cui `IframeCanvas.tsx` scopa,
        // nel documento dell'iframe, il CSS dei Global Design Tokens: mai `:root`, per non
        // far trapelare le variabili del sito nella chrome amministrativa (sidebar, toolbar)
        // — che comunque vive in un documento distinto (quello padre), non in questo.
        className={`${styles.canvasRoot} ${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`}
        // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
        // a "nessun blocco selezionato" una volta scelto un nodo.
        onClick={() => selectNode(null)}
      >
        {/*
          Wrapper "Layout" del tema (v8): stesso `.pageOuter`/`.pageBoxed` del sito pubblico
          (`PageView.tsx`) — vedi il commento di testa di `EditorCanvas.module.css`. Applicato
          sempre, coi default di fabbrica il Canvas resta visivamente invariato solo se il
          contenuto non richiede più di 1200px, stesso principio del rendering pubblico.
        */}
        <div className={styles.pageOuter}>
          <div className={styles.pageBoxed}>
            {/*
              `.blockStack` (EditorCanvas.module.css): equivalente non-Mantine di
              `<Stack gap="sm">` — questo albero vive nel documento isolato dell'iframe
              (`IframeCanvas.tsx`), dove il foglio di stile di Mantine (caricato solo nel
              `document` padre) non è disponibile. `gap` legge la stessa variabile
              `--cms-space-sm` già scritta da `generateThemeCss`/`compileTokensToCss` in quel
              documento, coerente col resto del vocabolario dei token dei blocchi.
            */}
            <div className={styles.blockStack}>
              {rootIds.length === 0 ? (
                // Nessun contenuto visivo proprio (scelta di giudizio, vedi il commento di testa):
                // la resa "Aggiungi sezione" è interamente di `CanvasAddSectionZone`, montata
                // subito sotto — il div resta solo come bersaglio `useDroppable` per il primo
                // blocco trascinato: a riposo è una striscia quasi invisibile
                // (`EditorCanvas.module.css`), che si allarga ed evidenzia in magenta solo
                // durante un trascinamento sopra di lei (`data-over`).
                <>
                  <div
                    ref={setEmptyDropRef}
                    className={styles.emptyDropzone}
                    data-over={isOverEmpty}
                  />
                  <CanvasAddSectionZone parentId={null} index={0} />
                </>
              ) : (
                <>
                  <CanvasSectionInserter index={0} />
                  {rootIds.flatMap((id, index) => [
                    <EditorBlockWrapper key={id} id={id} />,
                    <CanvasSectionInserter key={`inserter-${index + 1}`} index={index + 1} />,
                  ])}
                  <CanvasAddSectionZone parentId={null} index={rootIds.length} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </CanvasContextMenu>
  );
}

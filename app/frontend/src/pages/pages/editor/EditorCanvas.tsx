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
 * Shell di composizione (Wave 3): il rendering è delegato a moduli dichiarativi —
 * `EditorCanvasEmptyState` (albero vuoto), `EditorCanvasRootList` (nodi radice + strisce di
 * inserimento), `EditorCanvasDropZones` (drop-zone e "Aggiungi sezione" a livello radice),
 * `EditorCanvasThemeFrame` (cornice THEME - HEADER/FOOTER e breadcrumb). La cornice tema è solo
 * contesto visivo fuori flusso: non entra nell'albero dei blocchi né nel box model.
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
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { GLOBAL_TOKENS_CANVAS_SCOPE_CLASS } from '../../../libs/globalTokensCompiler';
import CanvasContextMenu from './CanvasContextMenu';
import EditorCanvasEmptyState from './EditorCanvasEmptyState';
import EditorCanvasRootList from './EditorCanvasRootList';
import EditorCanvasThemeFrame, { CanvasBreadcrumbBar } from './EditorCanvasThemeFrame';
import styles from './EditorCanvas.module.css';

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);

  return (
    <CanvasContextMenu>
      <div
        // Selettore su cui `IframeCanvas.tsx` scopa il CSS dei Global Design Tokens: mai `:root`.
        className={`${styles.canvasRoot} ${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`}
        // Un click sullo sfondo deseleziona: senza, non si tornerebbe a "nessun blocco".
        onClick={() => selectNode(null)}
      >
        <EditorCanvasThemeFrame area="header" />
        {/* Wrapper "Layout" del tema (v8): stesso `.pageOuter`/`.pageBoxed` di `PageView.tsx`. */}
        <div className={styles.pageOuter}>
          <div className={styles.pageBoxed}>
            {/* `.blockStack`: equivalente non-Mantine di `<Stack gap="sm">` (documento iframe). */}
            <div className={styles.blockStack}>
              {rootIds.length === 0 ? (
                <EditorCanvasEmptyState />
              ) : (
                <EditorCanvasRootList rootIds={rootIds} />
              )}
            </div>
          </div>
        </div>
        <CanvasBreadcrumbBar />
        {/* Dopo il breadcrumb: àncora di altezza 0, il badge si disegna sopra di esso. */}
        <EditorCanvasThemeFrame area="footer" />
      </div>
    </CanvasContextMenu>
  );
}

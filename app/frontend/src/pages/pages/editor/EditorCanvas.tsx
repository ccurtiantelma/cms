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
 * selettore su cui questo componente scopa il CSS compilato dal `ThemeConfig` dell'Editor
 * tema — la **stessa** fonte che veste il sito pubblicato (`app/public-site`), compilata
 * dalla stessa funzione (`generateThemeCss`). Il Canvas mostra quindi ciò che il visitatore
 * vedrà, non l'aspetto della chrome amministrativa attorno, che resta sui default di
 * fabbrica di Mantine.
 *
 * L'applicazione è imperativa, su un `<style>` di `document` scopato a questa radice: le
 * custom property cambiano a cascata sui discendenti senza ri-renderizzare né questo
 * componente né l'albero dei blocchi.
 */
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Stack } from '@mantine/core';
import { useDroppable } from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { useThemeColorStore } from '../../../hooks/useThemeColor';
import { GLOBAL_TOKENS_CANVAS_SCOPE_CLASS } from '../../../libs/globalTokensCompiler';
import { generateThemeCss, THEME_STYLE_TAG_ID } from '../../../utils/theme-css.utils';
import CanvasAddSectionZone from './CanvasAddSectionZone';
import CanvasContextMenu from './CanvasContextMenu';
import CanvasSectionInserter from './CanvasSectionInserter';
import EditorBlockWrapper from './EditorBlockWrapper';
import styles from './EditorCanvas.module.css';

/**
 * Tiene aggiornato il `<style>` del documento con il tema compilato, scopato alla radice
 * del Canvas. Un solo tag riusato (per id) invece di uno per render: montare/smontare un
 * foglio di stile ad ogni modifica del tema farebbe lampeggiare il Canvas.
 *
 * `scheme: 'light'` — non `'auto'`: il Canvas è una superficie di editing, e il suo aspetto
 * non deve dipendere dalla preferenza chiaro/scuro del sistema operativo di chi sta
 * lavorando. Lo scheme scuro del tema si verifica dove conta, cioè in anteprima
 * (`/__preview/`) e sul sito, dove segue la preferenza del visitatore.
 */
function useCanvasTheme(): void {
  const themeConfig = useThemeColorStore((state) => state.themeConfig);

  useEffect(() => {
    const css = generateThemeCss(themeConfig, {
      selector: `.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`,
      scheme: 'light',
    });
    let styleTag = document.getElementById(THEME_STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = THEME_STYLE_TAG_ID;
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = css;
  }, [themeConfig]);
}

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  useCanvasTheme();
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const { setNodeRef: setEmptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: 'root-empty-dropzone',
    data: { parentId: null, index: 0 },
  });

  return (
    <CanvasContextMenu>
      <div
        // `GLOBAL_TOKENS_CANVAS_SCOPE_CLASS` è il selettore su cui `useCanvasTheme` scopa
        // il CSS del tema: mai `:root`, per non far trapelare le variabili del sito nella
        // chrome amministrativa (sidebar, toolbar) che circonda questo canvas.
        className={`${styles.canvasRoot} ${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`}
        // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
        // a "nessun blocco selezionato" una volta scelto un nodo.
        onClick={() => selectNode(null)}
      >
        <Stack gap="sm">
          {rootIds.length === 0 ? (
            // Nessun contenuto visivo proprio (scelta di giudizio, vedi il commento di testa):
            // la resa "Aggiungi sezione" è interamente di `CanvasAddSectionZone`, montata
            // subito sotto — il div resta solo come bersaglio `useDroppable` per il primo
            // blocco trascinato: a riposo è una striscia quasi invisibile
            // (`EditorCanvas.module.css`), che si allarga ed evidenzia in magenta solo
            // durante un trascinamento sopra di lei (`data-over`).
            <>
              <div ref={setEmptyDropRef} className={styles.emptyDropzone} data-over={isOverEmpty} />
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
        </Stack>
      </div>
    </CanvasContextMenu>
  );
}

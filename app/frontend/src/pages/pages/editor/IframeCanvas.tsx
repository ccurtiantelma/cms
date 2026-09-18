/**
 * Guscio dell'iframe same-origin del Canvas dell'editor (`ADR-72-canvas-iframe-portal-bridge.md`,
 * supera `ADR-70` § "Decisione" punti 1/3; `SPEC-F04-super-elementor.md` § 1). Monta un
 * `<iframe>` a piena area con un documento `srcDoc` minimale e proietta il `canvasTree`
 * ricevuto come `children` (oggi: `InvalidBlockProvider > EditorCanvas`, invariati, stesso
 * codice sorgente) dentro `iframe.contentDocument` con `ReactDOM.createPortal`, **restando
 * nello stesso albero React/Fiber** del documento padre — nessun secondo
 * `ReactDOM.createRoot()`, nessun secondo entry point/bundle Vite (ADR-72 § "Decisione" punto
 * 1). L'unico `DndContext`/`InternalContext` di `dnd-kit` resta quello montato da
 * `FullScreenEditorLayout.tsx`: il Context React attraversa il confine del `document` perché
 * la propagazione segue l'albero Fiber, non il documento fisico in cui il DOM portato finisce
 * (verificato in `PLAN-F04-dnd-iframe-portal-spike.md` § "Risultato" punto 1).
 *
 * **Ciclo di montaggio (SPEC §1.2)**: l'`<iframe>` monta con `srcDoc` statico
 * (`<div id="canvas-root">` vuoto, nessun bundle JS proprio). Solo sull'evento `load` (mai
 * prima: `contentDocument` non è affidabile prima di questo evento) questo componente ottiene
 * `iframe.contentDocument.getElementById('canvas-root')` e lo passa come container a
 * `createPortal`. Se il container non è raggiungibile al `load` (caso limite), il canvas mostra
 * uno stato di errore esplicito — mai un canvas vuoto silenzioso (SPEC §1.2 punto 4, CLAUDE.md
 * § dominio CMS — mai stato silenzioso).
 *
 * **Isolamento CSS (SPEC §1.3, ADR-70 § "Decisione" punto 5, invariato)**: tre pipeline
 * indipendenti, tutte scritte su `iframe.contentDocument` una volta pronto, mai sul `document`
 * padre:
 * 1. `ThemeConfig` (Editor tema, ADR-4) — `generateThemeCss` con `selector: ':root'`: un
 *    documento dedicato non necessita più della classe di scope usata quando il canvas viveva
 *    nel documento padre (`EditorCanvas.tsx`, prima di questo componente).
 * 2. Global Design Tokens — `applyGlobalTokensToDocument` (stessa funzione esportata da
 *    `useBlockEditorStore.ts`, non reimplementata qui), scopati su
 *    `.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}` (la classe che `EditorCanvas.tsx` porta sulla
 *    propria radice): questo effetto **rispecchia**, non sostituisce, le chiamate esistenti
 *    dello store sul `document` padre (`setGlobalTokens`/`hydrateGlobalTokens`/`undo`/`redo`) —
 *    toccare quegli internals condivisi sarebbe un rischio più alto di un secondo punto di
 *    applicazione qui.
 * 3. CSS Module di progetto (tutti i `*.module.css` sotto `src/`, `import.meta.glob` con
 *    `query: '?inline'`, nessuna dipendenza npm nuova) — non solo `style-tokens.module.css`:
 *    l'intero albero portato (`EditorCanvas.tsx`, `EditorBlockWrapper.tsx`, `Section.tsx` e
 *    ogni altro blocco sotto `components/blocks/blocks/`) importa normalmente (non `?inline`)
 *    i propri CSS Module, e Vite li inietta automaticamente solo nel `document` padre al
 *    momento dell'esecuzione del modulo — mai nell'`iframe.contentDocument`, che non ha un
 *    secondo entry point/bundle (ADR-72 § "Decisione" punto 1). Senza questo aggregatore, il
 *    layout Grid di `Section.module.css` e il `position: absolute` di maniglie/overlay/badge
 *    di `EditorBlockWrapper.module.css` non arriverebbero mai nel documento isolato — stesso
 *    hashing deterministico dell'import "normale" già usato dai componenti, concatenati in
 *    ordine di path (deterministico) in un unico `<style>` proprio dell'head dell'iframe.
 *
 * **Non clonato**: nessun altro foglio di stile del documento padre, in particolare nessun CSS
 * di Mantine — l'isolamento richiesto è esplicito (CLAUDE.md § Regola Mantine — i componenti
 * dei blocchi non importano Mantine; qui lo stesso principio si applica all'intero documento
 * isolato, non solo ai singoli componenti di blocco).
 *
 * **Pipeline 4/4 — CSS dei valori liberi PropKind v2** (round R2 "parità Elementor Pro",
 * `components/blocks/generateCanvasCss.ts`): `colorRef`/`fontRef`/`typography`/`spacing`/
 * `radius`/`gradient`/`position`/`transform`/`filter`/`layout` non sono esprimibili con le
 * classi CSS Module statiche di `style-tokens.ts` (valori liberi, non token di un enum chiuso)
 * — questo tag, ricalcolato a ogni cambio dell'albero o dei breakpoint attivi, li applica ai
 * nodi del canvas via il nuovo attributo `data-canvas-style-id`, portato dalla radice del
 * componente di contenuto (oggi solo `Container.tsx`, round R2) — deviazione dichiarata dal
 * selettore `[data-block="<id>"]` di `SPEC-PROPKIND-V2-DETAILS.md` § 10 (pensato per il
 * consumer HTML pubblico) e distinto da `data-block-id` (`EditorBlockWrapper.tsx`, un livello
 * di annidamento più esterno) — vedi il commento di testa di `generateCanvasCss.ts` per il
 * dettaglio. **Nessun `data-nonce`**: nessun meccanismo CSP/nonce
 * esiste oggi nell'admin editor (verificato sull'intero repository — l'unico nonce esistente è
 * quello di `app/public-site`, ADR-74, dominio pubblico distinto); un attributo placeholder
 * senza un meccanismo di verifica reale sarebbe sicurezza finta, non introdotta qui.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ForwardedRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  applyGlobalTokensToDocument,
  useActiveBreakpoints,
  useGlobalTokens,
  useRootBlocks,
} from '../../../hooks/useBlockEditorStore';
import { useThemeColorStore } from '../../../hooks/useThemeColor';
import { compileTokensToCss } from '../../../libs/globalTokensCompiler';
import { GLOBAL_TOKENS_CANVAS_SCOPE_CLASS } from '../../../libs/globalTokensCompiler';
import { generateThemeCss, THEME_STYLE_TAG_ID } from '../../../utils/theme-css.utils';
import { generateCanvasCss } from '../../../components/blocks/generateCanvasCss';
import styles from './IframeCanvas.module.css';

/** Id del contenitore del `srcDoc` — stesso contratto letterale di SPEC-F04-super-elementor.md §1.1. */
const CANVAS_ROOT_ID = 'canvas-root';

/** Id del tag `<style>` che ospita i CSS Module di progetto nell'head dell'iframe. */
const BLOCK_TOKEN_STYLE_TAG_ID = 'eaidos-block-token-css';

/** Id del tag `<style>` che ospita il CSS dei valori liberi PropKind v2 (commento di testa, Pipeline 4/4). */
const CANVAS_CSS_STYLE_TAG_ID = 'eaidos-canvas-styles';

// `import.meta.glob` (Vite 6, nativo — nessuna dipendenza npm nuova, ADR-70 § "Decisione"
// punto 6, invariato): raccoglie con `?inline` (stringa CSS già compilata, stesso hashing
// deterministico dell'import "normale") ogni `*.module.css` di progetto sotto `src/` — quindi
// automaticamente `style-tokens.module.css`, `EditorCanvas.module.css`,
// `EditorBlockWrapper.module.css`, ogni `.module.css` di blocco (`Section`, `Button`,
// `Container`, ecc.), presenti e futuri — mai il CSS di
// Mantine, che non è un `.module.css` di progetto ma vive in `node_modules` (commento di testa,
// "Non clonato"). `eager: true`: valutato al caricamento del modulo, nessun `await` nel
// componente. Concatenato in ordine di path (`Object.keys(...).sort()`) per un output
// deterministico, indipendente dall'ordine di scoperta del filesystem.
const blockModuleCssMap = import.meta.glob('/src/**/*.module.css', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>;
const aggregatedBlockCss = Object.keys(blockModuleCssMap)
  .sort()
  .map((path) => blockModuleCssMap[path])
  .join('\n');

/**
 * Documento `srcDoc` minimale (SPEC §1.1): nessun bundle JS proprio, un solo contenitore
 * vuoto — il contenuto arriva interamente dall'albero React del documento padre via
 * `createPortal`. Il reset su `html`/`body` non è decorativo:
 * - `margin:0`: senza, il margine UA di default (8px) sfalserebbe la larghezza simulata dal
 *   Breakpoint Switcher (`FullScreenEditorLayout.module.css` `.viewportFramed`, larghezza
 *   esatta in px dello `style` inline `viewportFrameStyle`) di 16px.
 * - `height:100%` (non `min-height:100%`, invariato — vedi nota sotto): `.canvasRoot`
 *   (`EditorCanvas.module.css`, commento in testa a `.canvasRoot`) risolve il proprio
 *   `min-height: 100%` esplicitamente "contro `html,body{height:100%}`" — una percentuale
 *   (`height` o `min-height`) risolve solo se il containing block ha un'altezza *definita*
 *   (non `auto`); `min-height` da solo non la fissa mai (il computed `height` resta `auto`
 *   finché il contenuto non la forza), quindi sostituirlo con `min-height:100%` qui
 *   azzererebbe la base percentuale a catena e romperebbe esattamente il caso che quel
 *   commento descrive (l'area cliccabile per la deselezione ad albero vuoto/corto non
 *   coprirebbe più l'intero canvas). Nessun rischio di clip su un albero più alto della
 *   viewport dell'iframe: `overflow` resta `visible` (default, mai impostato altrove su
 *   `html`/`body`/`.canvasRoot`), quindi un contenuto che eccede l'altezza fissata trabocca
 *   visivamente invece di essere tagliato.
 * - `padding:0`/`box-sizing:border-box`/`width:100%`: stesso principio del reset UA sopra —
 *   nessun padding di default su `body`, e un elemento portato che dichiari `width: 100%`
 *   (es. `.section`/`.canvasRoot`) deve risolvere sul contenuto della cella, non
 *   aggiungerci un proprio bordo/padding sopra (`content-box` sommerebbe, sfalsando di nuovo
 *   la larghezza simulata dal Breakpoint Switcher come per il margine sopra).
 */
const IFRAME_SRC_DOC = `<!doctype html><html><head><style>html,body{margin:0;padding:0;box-sizing:border-box;width:100%;height:100%}</style></head><body><div id="${CANVAS_ROOT_ID}"></div></body></html>`;

export interface IframeCanvasProps {
  /** Il `canvasTree` da proiettare nell'iframe — oggi `InvalidBlockProvider > EditorCanvas`,
   * stesso codice sorgente già in uso, non duplicato (ADR-72 § "Decisione" punto 1). */
  children: ReactNode;
}

/** Assegna sia il ref interno (necessario per leggere l'iframe negli effetti/handler di questo
 * componente) sia quello sollevato dal chiamante (`FullScreenEditorLayout.tsx`, per la
 * funzione di misura cross-frame di `dnd-kit`, ADR-72 § "Decisione" punto 3). */
function assignRefs(
  el: HTMLIFrameElement | null,
  internalRef: MutableRefObject<HTMLIFrameElement | null>,
  forwardedRef: ForwardedRef<HTMLIFrameElement>,
): void {
  internalRef.current = el;
  if (typeof forwardedRef === 'function') {
    forwardedRef(el);
  } else if (forwardedRef) {
    forwardedRef.current = el;
  }
}

/**
 * Guscio dell'iframe del Canvas — vedi il commento di testa del file per il ciclo di
 * montaggio e l'isolamento CSS. Il ref forwardato è l'elemento `<iframe>` stesso: il solo
 * meccanismo di wiring richiesto da `FullScreenEditorLayout.tsx` per leggere sincronicamente
 * `iframe.getBoundingClientRect()`/`iframe.contentDocument` nella funzione di misura
 * cross-frame (nessun secondo canale, nessun evento custom).
 */
const IframeCanvas = forwardRef<HTMLIFrameElement, IframeCanvasProps>(function IframeCanvas(
  { children }: IframeCanvasProps,
  forwardedRef: ForwardedRef<HTMLIFrameElement>,
) {
  const internalRef = useRef<HTMLIFrameElement | null>(null);
  const [contentDoc, setContentDoc] = useState<Document | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [loadError, setLoadError] = useState(false);

  const themeConfig = useThemeColorStore((state) => state.themeConfig);
  const globalTokens = useGlobalTokens();
  const tree = useRootBlocks();
  const activeBreakpoints = useActiveBreakpoints();

  /**
   * Sull'evento `load` dell'iframe (mai prima), cerca `#canvas-root` nel `contentDocument`.
   * Se assente — caso limite, lo stesso documento `srcDoc` è sempre same-origin per
   * costruzione — mostra lo stato di errore invece di un canvas vuoto silenzioso (SPEC §1.2
   * punto 4).
   */
  function handleLoad(): void {
    const iframe = internalRef.current;
    const doc = iframe?.contentDocument ?? null;
    const container = doc?.getElementById(CANVAS_ROOT_ID) ?? null;
    if (!doc || !container) {
      setContentDoc(null);
      setPortalContainer(null);
      setLoadError(true);
      return;
    }
    // Marca `<html>` del documento dell'iframe come confine scrollabile reale del canvas
    // (FASE 6, gap scoperto dalla migrazione ADR-72): `EditorBlockWrapper.tsx` risolve
    // l'anti-clip della toolbar di selezione con `wrapperEl.closest('[data-canvas-scroll-area]')`
    // sul proprio nodo, portato in questo stesso documento — `[data-canvas-scroll-area]` su
    // `.canvasArea` del documento padre (`FullScreenEditorLayout.tsx`) non è più un antenato
    // raggiungibile da `closest()` una volta attraversato il confine dell'iframe, e resta
    // comunque il confine sbagliato: l'iframe è un box a dimensione fissa (le regole flex del
    // padre lo stirano all'altezza di `.canvasArea`, `overflow-y: auto` di
    // `.canvasArea` non scatta mai), lo scroll reale del contenuto del canvas è quello nativo
    // del documento dell'iframe stesso.
    doc.documentElement.setAttribute('data-canvas-scroll-area', 'true');
    setLoadError(false);
    setContentDoc(doc);
    setPortalContainer(container);
  }

  // Pipeline 1/3 — ThemeConfig su `:root` del documento dell'iframe (commento di testa, punto
  // 1): un solo tag riusato (per id), mai smontato/rimontato ad ogni modifica del tema, così
  // il Canvas non lampeggia. Riesegue ad ogni cambio di `themeConfig` (o quando il documento
  // diventa disponibile).
  useEffect(() => {
    if (!contentDoc) return;
    const css = generateThemeCss(themeConfig, { selector: ':root', scheme: 'light' });
    let styleTag = contentDoc.getElementById(THEME_STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = contentDoc.createElement('style');
      styleTag.id = THEME_STYLE_TAG_ID;
      contentDoc.head.appendChild(styleTag);
    }
    styleTag.textContent = css;
  }, [contentDoc, themeConfig]);

  // Pipeline 2/3 — Global Design Tokens, scopati su `.eaidos-canvas-theme-scope` del documento
  // dell'iframe (commento di testa, punto 2): `null` finché la sessione non ne ha impostati
  // (stesso stato iniziale del `document` padre nello store — nessun default di fabbrica
  // reintrodotto di nascosto).
  useEffect(() => {
    if (!contentDoc || !globalTokens) return;
    applyGlobalTokensToDocument(
      compileTokensToCss(globalTokens, `.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`),
      contentDoc,
    );
  }, [contentDoc, globalTokens]);

  // Pipeline 3/3 — CSS Module di progetto (commento di testa, punto 3): contenuto statico
  // (l'aggregato è calcolato una sola volta al caricamento del modulo, non ad ogni render),
  // iniettato una sola volta per documento montato (un nuovo `load` dell'iframe rimpiazza
  // `contentDoc`, quindi questo effetto rieseguirà sul documento nuovo).
  useEffect(() => {
    if (!contentDoc) return;
    let styleTag = contentDoc.getElementById(BLOCK_TOKEN_STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = contentDoc.createElement('style');
      styleTag.id = BLOCK_TOKEN_STYLE_TAG_ID;
      contentDoc.head.appendChild(styleTag);
    }
    styleTag.textContent = aggregatedBlockCss;
  }, [contentDoc]);

  // Pipeline 4/4 — CSS dei valori liberi PropKind v2 (commento di testa): ricalcolato a ogni
  // cambio dell'albero (`generation` non serve qui, `tree` cambia riferimento a ogni mutazione
  // per lo structural sharing di `block-tree.utils.ts`) o dei breakpoint attivi. Nessun
  // `data-nonce` (commento di testa, gap CSP dichiarato).
  useEffect(() => {
    if (!contentDoc) return;
    let styleTag = contentDoc.getElementById(CANVAS_CSS_STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = contentDoc.createElement('style');
      styleTag.id = CANVAS_CSS_STYLE_TAG_ID;
      contentDoc.head.appendChild(styleTag);
    }
    styleTag.textContent = generateCanvasCss(tree, activeBreakpoints);
  }, [contentDoc, tree, activeBreakpoints]);

  return (
    <div className={styles.frameWrapper}>
      <iframe
        id="cms-canvas-frame"
        ref={(el) => assignRefs(el, internalRef, forwardedRef)}
        srcDoc={IFRAME_SRC_DOC}
        title="Canvas dei blocchi"
        onLoad={handleLoad}
        className={styles.frame}
      />
      {loadError && (
        <Alert
          color="red"
          variant="filled"
          icon={<IconAlertTriangle size={18} />}
          title="Canvas non disponibile"
          className={styles.errorState}
          data-testid="iframe-canvas-error"
        >
          Il documento del canvas non si è caricato correttamente. Ricarica la pagina; se il
          problema persiste, contatta l&apos;amministratore.
        </Alert>
      )}
      {portalContainer ? createPortal(children, portalContainer) : null}
    </div>
  );
});

export default IframeCanvas;

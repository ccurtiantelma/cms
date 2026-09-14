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
 * 3. CSS Module dei blocchi (`style-tokens.module.css`) — importato con `?inline` (stringa CSS
 *    già compilata da Vite, stesso hashing deterministico dell'import "normale" già usato da
 *    `Button.tsx`/`Container.tsx`/ecc.) e iniettato in un `<style>` proprio dell'head
 *    dell'iframe: nessuna dipendenza npm nuova, nessuna duplicazione di foglio stile.
 *
 * **Non clonato**: nessun altro foglio di stile del documento padre, in particolare nessun CSS
 * di Mantine — l'isolamento richiesto è esplicito (CLAUDE.md § Regola Mantine — i componenti
 * dei blocchi non importano Mantine; qui lo stesso principio si applica all'intero documento
 * isolato, non solo ai singoli componenti di blocco).
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
import { applyGlobalTokensToDocument, useGlobalTokens } from '../../../hooks/useBlockEditorStore';
import { useThemeColorStore } from '../../../hooks/useThemeColor';
import { compileTokensToCss } from '../../../libs/globalTokensCompiler';
import { GLOBAL_TOKENS_CANVAS_SCOPE_CLASS } from '../../../libs/globalTokensCompiler';
import { generateThemeCss, THEME_STYLE_TAG_ID } from '../../../utils/theme-css.utils';
// `?inline`: CSS Module compilato come stringa (Vite), non auto-iniettato nel documento padre —
// vedi il commento di testa sopra, punto 3. Stesso hashing di classe dell'import "normale" già
// usato dai componenti di blocco: nessuna dipendenza npm nuova, nessuna modifica a
// `vite.config.ts`.
import blockTokenCss from '../../../components/blocks/style-tokens.module.css?inline';
import styles from './IframeCanvas.module.css';

/** Id del contenitore del `srcDoc` — stesso contratto letterale di SPEC-F04-super-elementor.md §1.1. */
const CANVAS_ROOT_ID = 'canvas-root';

/** Id del tag `<style>` che ospita il CSS Module dei blocchi nell'head dell'iframe. */
const BLOCK_TOKEN_STYLE_TAG_ID = 'eaidos-block-token-css';

/**
 * Documento `srcDoc` minimale (SPEC §1.1): nessun bundle JS proprio, un solo contenitore
 * vuoto — il contenuto arriva interamente dall'albero React del documento padre via
 * `createPortal`.
 */
const IFRAME_SRC_DOC = `<!doctype html><html><body><div id="${CANVAS_ROOT_ID}"></div></body></html>`;

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

  // Pipeline 3/3 — CSS Module dei blocchi (commento di testa, punto 3): contenuto statico,
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
    styleTag.textContent = blockTokenCss;
  }, [contentDoc]);

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

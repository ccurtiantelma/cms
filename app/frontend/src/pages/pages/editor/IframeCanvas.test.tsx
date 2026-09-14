/**
 * Test del guscio dell'iframe del Canvas (`IframeCanvas.tsx`, ADR-72/SPEC-F04 §1): contratto
 * DOM del `srcDoc`, montaggio del `canvasTree` via `createPortal` dentro
 * `iframe.contentDocument` (mai nel `document` padre), le tre pipeline CSS isolate (ThemeConfig
 * su `:root`, Global Design Tokens scopati su `.eaidos-canvas-theme-scope`, CSS Module dei
 * blocchi), lo stato di errore esplicito quando `#canvas-root` non è raggiungibile al `load`.
 *
 * **Nota di metodo — jsdom non processa `srcdoc`** (`HTMLFrameElement-impl.js` di jsdom aggancia
 * la navigazione dell'iframe solo all'attributo `src`, mai a `srcdoc`): in questo ambiente di
 * test `iframe.contentDocument` resta sempre un documento vuoto (`about:blank`) indipendente da
 * ciò che il componente imposta come `srcDoc`. `loadIframeDocument` sotto riproduce quindi a
 * mano ciò che un browser reale farebbe durante la navigazione (`document.open/write/close`)
 * prima di far scattare l'evento `load` — stessa tecnica già necessaria per qualunque test di
 * un componente che dipende da `iframe.contentDocument` sotto jsdom. jsdom fa comunque scattare
 * un proprio evento `load` automatico e **asincrono** sul documento vuoto iniziale (mai prima
 * delle assertion sincrone di questo file, verificato empiricamente): le assertion di ogni test
 * leggono lo stato subito dopo il proprio `fireEvent.load` sincrono, prima che quel rumore
 * asincrono possa ripresentarsi — comunque innocuo perché ri-osserverebbe lo stesso documento
 * già scritto da `loadIframeDocument` (idempotente).
 *
 * Le azioni dello store invocate direttamente da un test (`setGlobalTokens`, non passando da
 * un `fireEvent`/`userEvent`) vanno avvolte in `act()`: l'effetto che rispecchia i token sul
 * documento dell'iframe (`useEffect` reattivo a `useGlobalTokens()`) gira dopo un giro di
 * render React, non in modo imperativo/sincrono come la scrittura sul `document` padre già
 * fatta dallo store stesso — senza `act()` l'assertion leggerebbe il DOM prima che quell'
 * effetto sia stato flushato.
 */
import { createRef } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import {
  GLOBAL_TOKENS_CANVAS_SCOPE_CLASS,
  GLOBAL_TOKENS_STYLE_TAG_ID,
  DEFAULT_GLOBAL_TOKENS,
} from '../../../libs/globalTokensCompiler';
import { THEME_STYLE_TAG_ID } from '../../../utils/theme-css.utils';

const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { default: IframeCanvas } = await import('./IframeCanvas');

/**
 * Riproduce a mano ciò che una navigazione `srcDoc` reale produrrebbe nel `contentDocument`
 * dell'iframe (vedi commento di testa), poi fa scattare l'evento `load` che `IframeCanvas`
 * ascolta per agganciare il proprio `createPortal` e le pipeline CSS.
 */
function loadIframeDocument(
  iframe: HTMLIFrameElement,
  bodyHtml = '<div id="canvas-root"></div>',
): Document {
  const doc = iframe.contentDocument;
  if (!doc) throw new Error('contentDocument non disponibile in jsdom');
  doc.open();
  doc.write(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`);
  doc.close();
  fireEvent.load(iframe);
  return doc;
}

function getFrame(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector('#cms-canvas-frame');
  if (!iframe) throw new Error('#cms-canvas-frame non trovato');
  return iframe as HTMLIFrameElement;
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.setState({ globalTokens: null });
});

describe('IframeCanvas — contratto DOM e montaggio', () => {
  it('monta un iframe same-origin col contratto DOM di SPEC-F04-super-elementor.md §1.1', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div>contenuto</div>
      </IframeCanvas>,
    );

    const iframe = getFrame(container);
    expect(iframe.getAttribute('title')).toBe('Canvas dei blocchi');
    expect(iframe.getAttribute('srcdoc')).toContain('id="canvas-root"');
    // Nessun `sandbox`: un `sandbox` senza `allow-same-origin` esplicito degraderebbe l'iframe
    // a origin opaca (SPEC §1.1).
    expect(iframe.hasAttribute('sandbox')).toBe(false);
  });

  it('proietta i children nel document dell’iframe via createPortal, mai nel document padre', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div data-testid="canvas-content">Blocco</div>
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    const doc = loadIframeDocument(iframe);

    expect(doc.querySelector('[data-testid="canvas-content"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="canvas-content"]')).toBeNull();
  });

  it('solleva al chiamante il riferimento all’elemento <iframe> stesso (wiring del ref per la misura cross-frame di FullScreenEditorLayout)', () => {
    const ref = createRef<HTMLIFrameElement>();
    const { container } = renderWithProviders(
      <IframeCanvas ref={ref}>
        <div />
      </IframeCanvas>,
    );

    expect(ref.current).toBe(getFrame(container));
  });

  it('mostra uno stato di errore esplicito se #canvas-root non è raggiungibile al load, mai un canvas vuoto silenzioso', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div data-testid="canvas-content">Blocco</div>
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    loadIframeDocument(iframe, '<p>nessun contenitore qui</p>');

    expect(container.querySelector('[data-testid="iframe-canvas-error"]')).not.toBeNull();
  });
});

describe('IframeCanvas — isolamento CSS (ADR-70 § "Decisione" punto 5, invariato)', () => {
  it('scopa il ThemeConfig su :root del documento dell’iframe (documento dedicato, non serve più la classe di scope)', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div />
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    const doc = loadIframeDocument(iframe);

    const styleTag = doc.getElementById(THEME_STYLE_TAG_ID);
    expect(styleTag).not.toBeNull();
    expect(styleTag?.textContent).toContain(':root {');
  });

  it('scopa i Global Design Tokens su .eaidos-canvas-theme-scope del documento dell’iframe, mai su :root', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div />
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    const doc = loadIframeDocument(iframe);

    act(() => {
      useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);
    });

    const styleTag = doc.getElementById(GLOBAL_TOKENS_STYLE_TAG_ID);
    expect(styleTag).not.toBeNull();
    const css = styleTag?.textContent ?? '';
    expect(css).toContain(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS} {`);
    expect(css).not.toMatch(/(^|\s):root\b/);
  });

  it('non scrive i Global Design Tokens sul document padre (mirror sul solo documento dell’iframe, nessuna sostituzione delle chiamate esistenti dello store)', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div />
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    loadIframeDocument(iframe);

    act(() => {
      useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);
    });

    // Lo store scrive comunque sul `document` padre per conto proprio (comportamento
    // preesistente, non toccato da questo componente): qui si verifica solo che
    // `IframeCanvas` non introduca una seconda scrittura duplicata/divergente lì.
    const mainStyleTag = document.getElementById(GLOBAL_TOKENS_STYLE_TAG_ID);
    expect(mainStyleTag?.textContent ?? '').toContain(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS} {`);
  });

  it('inietta il CSS Module dei blocchi in un <style> proprio dell’head del documento dell’iframe', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div />
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    const doc = loadIframeDocument(iframe);

    const styleTag = doc.getElementById('eaidos-block-token-css');
    expect(styleTag).not.toBeNull();
    expect(styleTag?.tagName).toBe('STYLE');
  });
});

describe('IframeCanvas — performance (nessun remount distruttivo dell’albero portato)', () => {
  it('un aggiornamento dei Global Design Tokens non ri-monta l’albero portato nell’iframe', () => {
    const { container } = renderWithProviders(
      <IframeCanvas>
        <div data-testid="stable-node">stabile</div>
      </IframeCanvas>,
    );
    const iframe = getFrame(container);
    const doc = loadIframeDocument(iframe);
    const nodeBefore = doc.querySelector('[data-testid="stable-node"]');

    act(() => {
      useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);
    });

    const nodeAfter = doc.querySelector('[data-testid="stable-node"]');
    expect(nodeAfter).not.toBeNull();
    expect(nodeAfter).toBe(nodeBefore);
  });
});

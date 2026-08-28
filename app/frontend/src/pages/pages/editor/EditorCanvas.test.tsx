/**
 * Regression test dello scope isolation dei Global Design Tokens sul Canvas
 * (`EditorCanvas.tsx` + `useBlockEditorStore.hydrateGlobalTokens`/`setGlobalTokens`).
 *
 * Il tag `<style id="eaidos-global-tokens">` vive comunque nello `head` del documento
 * principale (nessun canvas in iframe oggi), ma il CSS che contiene deve scopare le
 * variabili su `.eaidos-canvas-theme-scope` — la classe che `EditorCanvas` porta sulla
 * propria radice — e mai su `:root`, altrimenti le variabili del contenuto
 * governerebbero anche la chrome amministrativa (sidebar, toolbar) che circonda il
 * canvas.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import {
  GLOBAL_TOKENS_CANVAS_SCOPE_CLASS,
  GLOBAL_TOKENS_STYLE_TAG_ID,
  DEFAULT_GLOBAL_TOKENS,
} from '../../../libs/globalTokensCompiler';

const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { default: EditorCanvas } = await import('./EditorCanvas');

function globalTokensStyleTag(): HTMLStyleElement | null {
  return document.getElementById(GLOBAL_TOKENS_STYLE_TAG_ID) as HTMLStyleElement | null;
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.setState({ globalTokens: null });
  globalTokensStyleTag()?.remove();
});

afterEach(() => {
  globalTokensStyleTag()?.remove();
});

describe('EditorCanvas — scope isolation dei Global Design Tokens', () => {
  it('porta la classe di scope su cui lo store scopa il CSS dei token', () => {
    const { container } = renderWithProviders(<EditorCanvas />);

    const root = container.querySelector(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`);
    expect(root).not.toBeNull();
  });

  it('setGlobalTokens scopa il CSS su .eaidos-canvas-theme-scope, mai su :root', () => {
    renderWithProviders(<EditorCanvas />);

    useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);

    const styleTag = globalTokensStyleTag();
    expect(styleTag).not.toBeNull();
    const css = styleTag?.textContent ?? '';
    expect(css).toContain(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS} {`);
    expect(css).not.toMatch(/(^|\s):root\b/);
  });

  it('hydrateGlobalTokens (idratazione non annullabile) scopa lo stesso modo di setGlobalTokens', () => {
    renderWithProviders(<EditorCanvas />);

    useBlockEditorStore.getState().hydrateGlobalTokens(DEFAULT_GLOBAL_TOKENS);

    const css = globalTokensStyleTag()?.textContent ?? '';
    expect(css).toContain(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS} {`);
    expect(css).not.toMatch(/(^|\s):root\b/);
  });

  it('le variabili compilate non toccano :root del documento (nessuna propagazione alla chrome outer)', () => {
    renderWithProviders(<EditorCanvas />);

    useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);

    const rootStyles = getComputedStyle(document.documentElement);
    expect(rootStyles.getPropertyValue('--eaidos-global-color-primary').trim()).toBe('');
  });

  it('un aggiornamento dei token non ri-monta l\'albero di blocchi esistente', () => {
    useBlockEditorStore.getState().initTree([
      { id: 'h-1', type: 'heading', props: { level: 'h2', text: 'Titolo' }, children: [] },
    ]);
    const { container } = renderWithProviders(<EditorCanvas />);
    const blockNodeBefore = container.querySelector('[data-block-id="h-1"]');

    useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);

    const blockNodeAfter = container.querySelector('[data-block-id="h-1"]');
    // Applicazione imperativa al tag <style>, non passata come prop/stato del wrapper:
    // lo stesso nodo DOM del blocco resta montato, nessun remount distruttivo.
    expect(blockNodeAfter).toBe(blockNodeBefore);
  });
});

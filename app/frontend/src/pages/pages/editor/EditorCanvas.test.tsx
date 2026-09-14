/**
 * Test di `EditorCanvas.tsx` — il `canvasTree` proiettato nell'iframe da `IframeCanvas.tsx`
 * (`ADR-72-canvas-iframe-portal-bridge.md`). **Aggiornato per ADR-72**: fino a questa ADR il
 * canvas montava direttamente nel `document` principale e questo file asseriva che il tag
 * `<style id="eaidos-global-tokens">` vivesse lì — premessa ormai falsa (oggi esiste un canvas
 * in iframe, `IframeCanvas.tsx`), quindi quelle assertion sono state spostate in
 * `IframeCanvas.test.tsx` § "isolamento CSS", dove il documento giusto da verificare è
 * `iframe.contentDocument`, non più il `document` di questo test (che qui renderizza
 * `EditorCanvas` da solo, senza alcun iframe attorno — comportamento comunque legittimo da
 * testare in isolamento, ma non più rappresentativo di dove il tag dei token finisce in
 * produzione).
 *
 * Ciò che resta di competenza di `EditorCanvas.tsx` in sé, testato qui:
 * - porta la classe di scope (`GLOBAL_TOKENS_CANVAS_SCOPE_CLASS`) su cui `IframeCanvas.tsx`
 *   scopa il CSS dei Global Design Tokens nel documento dell'iframe;
 * - non subisce un remount distruttivo dell'albero di blocchi quando lo stato dei token
 *   cambia altrove (questo componente non sottoscrive `globalTokens`, quindi un cambiamento
 *   di quello stato non deve mai far perdere l'identità dei nodi DOM già montati).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import {
  GLOBAL_TOKENS_CANVAS_SCOPE_CLASS,
  DEFAULT_GLOBAL_TOKENS,
} from '../../../libs/globalTokensCompiler';

const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { default: EditorCanvas } = await import('./EditorCanvas');

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.setState({ globalTokens: null });
});

describe('EditorCanvas — canvasTree proiettato da IframeCanvas.tsx', () => {
  it('porta la classe di scope su cui IframeCanvas.tsx scopa, nel documento dell’iframe, il CSS dei Global Design Tokens', () => {
    const { container } = renderWithProviders(<EditorCanvas />);

    const root = container.querySelector(`.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`);
    expect(root).not.toBeNull();
  });

  it("un aggiornamento dei Global Design Tokens altrove non ri-monta l'albero di blocchi esistente", () => {
    useBlockEditorStore
      .getState()
      .initTree([
        { id: 'h-1', type: 'heading', props: { level: 'h2', text: 'Titolo' }, children: [] },
      ]);
    const { container } = renderWithProviders(<EditorCanvas />);
    const blockNodeBefore = container.querySelector('[data-block-id="h-1"]');

    useBlockEditorStore.getState().setGlobalTokens(DEFAULT_GLOBAL_TOKENS);

    const blockNodeAfter = container.querySelector('[data-block-id="h-1"]');
    // `EditorCanvas.tsx` non sottoscrive `globalTokens` (l'applicazione CSS è responsabilità
    // di `IframeCanvas.tsx`/dello store, non di questo componente): lo stesso nodo DOM del
    // blocco resta montato, nessun remount distruttivo.
    expect(blockNodeAfter).toBe(blockNodeBefore);
  });
});

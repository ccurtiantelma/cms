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
import { fireEvent } from '@testing-library/react';
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

describe('EditorCanvas — cornice tema e breadcrumb', () => {
  it('monta i badge THEME - HEADER/FOOTER non editabili', () => {
    const { getByTestId } = renderWithProviders(<EditorCanvas />);
    expect(getByTestId('theme-frame-header').textContent).toContain('THEME - HEADER');
    expect(getByTestId('theme-frame-footer').textContent).toContain('THEME - FOOTER');
  });

  it('la cornice tema è decorazione fuori flusso: aria-hidden, senza id di blocco e senza toccare l’albero', () => {
    useBlockEditorStore
      .getState()
      .initTree([
        { id: 'h-1', type: 'heading', props: { level: 'h2', text: 'Titolo' }, children: [] },
      ]);
    const treeBefore = useBlockEditorStore.getState().tree;
    const { container, getByTestId } = renderWithProviders(<EditorCanvas />);

    for (const area of ['header', 'footer']) {
      const frame = getByTestId(`theme-frame-${area}`);
      expect(frame.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(frame.closest('[data-block-id]')).toBeNull();
    }
    // Solo i blocchi reali portano `data-block-id`; la cornice non ne aggiunge.
    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(1);
    expect(useBlockEditorStore.getState().tree).toBe(treeBefore);
  });

  it('il breadcrumb mostra il percorso e un click su un segmento seleziona il genitore', () => {
    useBlockEditorStore.getState().initTree([
      {
        id: 'c-1',
        type: 'container',
        props: {},
        children: [{ id: 'h-1', type: 'heading', props: { level: 'h2', text: 'T' }, children: [] }],
      },
    ]);
    useBlockEditorStore.getState().selectNode('h-1');
    const { getByTestId } = renderWithProviders(<EditorCanvas />);
    const bar = getByTestId('canvas-breadcrumb');
    // Scoped all'`<ol>` del percorso: la barra ospita anche i tre trigger "Aggiungi sezione"
    // (`CanvasAddSectionZone`, T-canvas-declutter-2), che non sono segmenti del breadcrumb.
    const buttons = bar.querySelectorAll('ol button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toBe('Pagina');
    fireEvent.click(buttons[1]);
    expect(useBlockEditorStore.getState().selectedId).toBe('c-1');
    fireEvent.click(getByTestId('canvas-breadcrumb').querySelectorAll('ol button')[0]);
    expect(useBlockEditorStore.getState().selectedId).toBeNull();
  });
});

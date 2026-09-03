/**
 * F14-01 — Salva come Preset Globale (Sezione) e reinserimento da "I Miei Preset".
 *
 * La feature richiesta ("azione di salvataggio sulla toolbar di selezione di una Sezione" +
 * "tab I Miei Preset nella sidebar che inserisce il sottoalbero rigenerando gli id") esisteva
 * già in parte in questo codebase, sotto nomi diversi da quelli del task originario:
 * `AdvancedTab.tsx` (ispettore) offriva già "Salva come Preset" per `section`/`container`, e
 * `WidgetPaletteGrid.tsx` offriva già la sezione "I Miei Preset" con inserimento a click —
 * entrambi sullo stesso `usePresetStore.ts`/`BlockPresetManager.ts` (UUID v4 ricorsivo). Per
 * non biforcare "I Miei Preset" in due registri scollegati, questo round aggiunge **solo**
 * il secondo punto d'ingresso mancante — "Salva come Preset Globale" sulla toolbar di
 * selezione della Sezione nel canvas (`BlockHoverOverlay.tsx`, montato da
 * `EditorBlockWrapper.tsx`) — riusando lo stesso store. Questo file copre quel punto
 * d'ingresso e, in coppia, il reinserimento da `WidgetPaletteGrid.tsx` con rigenerazione
 * ricorsiva degli id (invariante già coperto a livello di funzione pura da
 * `BlockPresetManager.test.ts`; qui si verifica l'integrazione end-to-end via UI).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import type { BlockNode } from './block-tree.utils';

const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { usePresetStore } = await import('./usePresetStore');
const { default: EditorBlockWrapper } = await import('./EditorBlockWrapper');
const { default: WidgetPaletteGrid } = await import('./WidgetPaletteGrid');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.getState().setActiveViewport('desktop');
  useBlockEditorStore.getState().selectNode(null);
  usePresetStore.setState({ presets: [] });
});

describe('EditorBlockWrapper — "Salva come Preset Globale" sulla toolbar della Sezione (F14-01)', () => {
  it('non compare su un blocco selezionato che non sia una section', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(
      screen.queryByRole('button', { name: 'Salva il blocco Titolo come Preset Globale' }),
    ).not.toBeInTheDocument();
  });

  it('compare su una section selezionata e apre il modal "Salva come Preset Globale"', () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Salva il blocco Sezione come Preset Globale' }));

    expect(screen.getByRole('textbox', { name: 'Nome del preset' })).toBeInTheDocument();
  });

  it('confermando il nome, l\'intero sottoalbero della Sezione viene salvato in usePresetStore', () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Salva il blocco Sezione come Preset Globale' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome del preset' }), {
      target: { value: 'Hero aziendale' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    const presets = usePresetStore.getState().presets;
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Hero aziendale');
    expect(presets[0].node.type).toBe('section');
    expect(presets[0].node.children).toHaveLength(1);
    expect(presets[0].node.children[0].id).toBe('h-child');
  });

  it('"Annulla" chiude il modal senza salvare alcun preset', () => {
    const section = node('sec-1', 'section', { columns: { default: '1' } }, []);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Salva il blocco Sezione come Preset Globale' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(usePresetStore.getState().presets).toHaveLength(0);
    expect(screen.queryByRole('textbox', { name: 'Nome del preset' })).not.toBeInTheDocument();
  });
});

describe('WidgetPaletteGrid — tab "I Miei Preset" (F14-01)', () => {
  it('nessun preset salvato: mostra lo stato vuoto', () => {
    renderWithProviders(<WidgetPaletteGrid />);

    expect(screen.getByText('Nessun preset salvato')).toBeInTheDocument();
  });

  it('elenca i preset salvati con titolo e icona layout', () => {
    usePresetStore.getState().savePreset('Hero', node('sec-original', 'section', {}, []));

    renderWithProviders(<WidgetPaletteGrid />);

    expect(screen.getByRole('button', { name: 'Inserisci preset Hero' })).toBeInTheDocument();
  });

  it('click su un preset inserisce il sottoalbero nel canvas rigenerando ricorsivamente gli id (UUID v4 guard)', () => {
    const originalSubtree = node('sec-original', 'section', { title: 'x' }, [
      node('container-original', 'container', {}, [
        node('heading-original', 'heading', { level: 'h2', text: 'Ciao' }),
      ]),
    ]);
    usePresetStore.getState().savePreset('Hero', originalSubtree);
    useBlockEditorStore.getState().initTree([]);

    renderWithProviders(<WidgetPaletteGrid />);
    fireEvent.click(screen.getByRole('button', { name: 'Inserisci preset Hero' }));

    const tree = useBlockEditorStore.getState().tree;
    expect(tree).toHaveLength(1);

    const inserted = tree[0];
    expect(inserted.type).toBe('section');
    expect(inserted.id).not.toBe('sec-original');
    expect(inserted.id).toMatch(UUID_V4);

    const insertedContainer = inserted.children[0];
    expect(insertedContainer.id).not.toBe('container-original');
    expect(insertedContainer.id).toMatch(UUID_V4);

    const insertedHeading = insertedContainer.children[0];
    expect(insertedHeading.id).not.toBe('heading-original');
    expect(insertedHeading.id).toMatch(UUID_V4);

    // Il preset salvato resta invariato: l'inserimento non deve mutare il template originale.
    const storedPreset = usePresetStore.getState().presets[0];
    expect(storedPreset.node.id).toBe('sec-original');
  });

  it('due inserimenti consecutivi dello stesso preset producono alberi con id distinti (nessuna collisione nel Canvas)', () => {
    usePresetStore.getState().savePreset(
      'Hero',
      node('sec-original', 'section', {}, [node('heading-original', 'heading', { level: 'h2', text: 'Ciao' })]),
    );
    useBlockEditorStore.getState().initTree([]);

    renderWithProviders(<WidgetPaletteGrid />);
    const button = screen.getByRole('button', { name: 'Inserisci preset Hero' });
    fireEvent.click(button);
    fireEvent.click(button);

    const tree = useBlockEditorStore.getState().tree;
    expect(tree).toHaveLength(2);
    expect(tree[0].id).not.toBe(tree[1].id);
    expect(tree[0].children[0].id).not.toBe(tree[1].children[0].id);
  });
});

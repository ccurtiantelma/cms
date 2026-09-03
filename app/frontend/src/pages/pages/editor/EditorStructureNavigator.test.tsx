/**
 * Test unitari del pannello "Struttura/Navigator" (`EditorStructureNavigator.tsx`):
 * rendering dell'albero da `contentTree` (via `useBlockEditorStore`), selezione di un
 * nodo con scroll al blocco corrispondente nel canvas, e riordino su/giù via
 * `moveBlockAction`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import EditorStructureNavigator from './EditorStructureNavigator';

function initTree(tree: BlockNode[]): void {
  useBlockEditorStore.getState().initTree(tree);
}

beforeEach(() => {
  initTree([]);
  useBlockEditorStore.setState({ selectedId: null, activeSidebarTab: 'widgets', hoveredId: null });
});

describe('EditorStructureNavigator — rendering dell\'albero', () => {
  it('mostra un messaggio quando la bozza non ha blocchi', () => {
    renderWithProviders(<EditorStructureNavigator />);

    expect(screen.getByText('Nessun blocco nella bozza.')).toBeInTheDocument();
  });

  it('mappa ricorsivamente il contentTree, un nodo per blocco (radice e figli)', () => {
    initTree([
      {
        id: 'section-1',
        type: 'section',
        props: {},
        children: [{ id: 'heading-1', type: 'heading', props: { level: 'h2', text: 'Benvenuti' }, children: [] }],
      },
    ]);

    renderWithProviders(<EditorStructureNavigator />);

    // Sezione: nessun contenuto testuale breve dichiarato dal registro per il suo tipo,
    // quindi l'etichetta è quella del registro (`meta.label`, block-registry).
    expect(screen.getByText('Sezione')).toBeInTheDocument();
    // Heading: etichetta derivata dal contenuto reale del nodo (`props.text`).
    expect(screen.getByText('Benvenuti')).toBeInTheDocument();
  });
});

describe('EditorStructureNavigator — selezione', () => {
  it('il click su un nodo seleziona il blocco, apre la scheda "Proprietà" e scrolla al blocco nel canvas', () => {
    initTree([{ id: 'heading-1', type: 'heading', props: { level: 'h2', text: 'Titolo' }, children: [] }]);
    const canvasNode = document.createElement('div');
    canvasNode.setAttribute('data-block-id', 'heading-1');
    document.body.appendChild(canvasNode);
    const scrollSpy = vi.spyOn(canvasNode, 'scrollIntoView');

    renderWithProviders(<EditorStructureNavigator />);
    fireEvent.click(screen.getByText('Titolo'));

    expect(useBlockEditorStore.getState().selectedId).toBe('heading-1');
    expect(useBlockEditorStore.getState().activeSidebarTab).toBe('properties');
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });

    document.body.removeChild(canvasNode);
  });
});

describe('EditorStructureNavigator — riordino su/giù', () => {
  it('sposta un blocco in giù fra i suoi fratelli diretti col pulsante dedicato', () => {
    initTree([
      { id: 'a', type: 'heading', props: { level: 'h2', text: 'Primo' }, children: [] },
      { id: 'b', type: 'heading', props: { level: 'h2', text: 'Secondo' }, children: [] },
    ]);

    renderWithProviders(<EditorStructureNavigator />);
    fireEvent.click(screen.getByRole('button', { name: 'Sposta giù il blocco "Primo"' }));

    expect(useBlockEditorStore.getState().tree.map((node) => node.id)).toEqual(['b', 'a']);
  });

  it('sposta un blocco in su fra i suoi fratelli diretti col pulsante dedicato', () => {
    initTree([
      { id: 'a', type: 'heading', props: { level: 'h2', text: 'Primo' }, children: [] },
      { id: 'b', type: 'heading', props: { level: 'h2', text: 'Secondo' }, children: [] },
    ]);

    renderWithProviders(<EditorStructureNavigator />);
    fireEvent.click(screen.getByRole('button', { name: 'Sposta su il blocco "Secondo"' }));

    expect(useBlockEditorStore.getState().tree.map((node) => node.id)).toEqual(['b', 'a']);
  });

  it('disabilita "Sposta su" sul primo fratello e "Sposta giù" sull\'ultimo', () => {
    initTree([
      { id: 'a', type: 'heading', props: { level: 'h2', text: 'Primo' }, children: [] },
      { id: 'b', type: 'heading', props: { level: 'h2', text: 'Secondo' }, children: [] },
    ]);

    renderWithProviders(<EditorStructureNavigator />);

    expect(screen.getByRole('button', { name: 'Sposta su il blocco "Primo"' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sposta giù il blocco "Secondo"' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sposta giù il blocco "Primo"' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sposta su il blocco "Secondo"' })).not.toBeDisabled();
  });
});

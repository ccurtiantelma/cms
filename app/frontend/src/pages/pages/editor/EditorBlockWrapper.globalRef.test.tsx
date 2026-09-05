/**
 * Copertura ADR-55 (F06 esteso — `globalRef`) lato Canvas/Chrome dell'editor:
 * - badge/bordo violi `#9333ea` (RE-2) "Sezione Globale" solo su un nodo `globalRef`, mai su un
 *   altro tipo (`GlobalRefBlock.tsx`/`EditorBlockWrapper.tsx`, `BlockRenderer.tsx`);
 * - voce "Converti in Sezione Globale" (`BlockHoverOverlay.tsx`, montata da
 *   `EditorBlockWrapper.tsx`) offerta solo su un contenitore/`section` di **primo livello**
 *   (`location.parentId === null`), mai su una foglia né su un nodo annidato.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import type { BlockNode } from './block-tree.utils';

const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { default: EditorBlockWrapper } = await import('./EditorBlockWrapper');

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
});

describe('EditorBlockWrapper — badge/bordo "Sezione Globale" su un nodo globalRef (ADR-55)', () => {
  it('un nodo globalRef mostra il badge "Sezione Globale" (icona + testo), sempre visibile', () => {
    const globalRef = node('gr-1', 'globalRef', { globalSectionGuid: '0123456789abcdef' });
    useBlockEditorStore.getState().initTree([globalRef]);

    renderWithProviders(<EditorBlockWrapper id="gr-1" />);

    expect(screen.getByText('Sezione Globale', { exact: true })).toBeInTheDocument();
  });

  it('un nodo di altro tipo (heading) NON mostra il badge "Sezione Globale"', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(screen.queryByText('Sezione Globale', { exact: true })).not.toBeInTheDocument();
  });

  it('una section (non globalRef) non mostra il badge "Sezione Globale" (assente anche da selezionata)', () => {
    const section = node('sec-1', 'section', {}, []);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    expect(screen.queryByText('Sezione Globale', { exact: true })).not.toBeInTheDocument();
  });
});

describe('EditorBlockWrapper / BlockHoverOverlay — "Converti in Sezione Globale" solo su un contenitore/section di primo livello (ADR-55)', () => {
  it('compare su una section di primo livello selezionata (location.parentId === null)', () => {
    const section = node('sec-1', 'section', {}, []);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    expect(
      screen.getByRole('button', { name: 'Converti il blocco Sezione in Sezione Globale' }),
    ).toBeInTheDocument();
  });

  it('compare su un container di primo livello selezionato', () => {
    const container = node('cont-1', 'container', {}, []);
    useBlockEditorStore.getState().initTree([container]);
    useBlockEditorStore.getState().selectNode('cont-1');

    renderWithProviders(<EditorBlockWrapper id="cont-1" />);

    expect(
      screen.getByRole('button', { name: 'Converti il blocco Contenitore in Sezione Globale' }),
    ).toBeInTheDocument();
  });

  it('NON compare su una foglia di primo livello selezionata (heading): nessun sottoalbero da estrarre', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(
      screen.queryByRole('button', { name: /Converti il blocco .* in Sezione Globale/ }),
    ).not.toBeInTheDocument();
  });

  it('NON compare su una section annidata (figlia di un container): location.parentId non è null', () => {
    const nestedSection = node('sec-child', 'section', {}, []);
    const container = node('cont-1', 'container', {}, [nestedSection]);
    useBlockEditorStore.getState().initTree([container]);
    useBlockEditorStore.getState().selectNode('sec-child');

    renderWithProviders(<EditorBlockWrapper id="sec-child" />);

    expect(
      screen.queryByRole('button', { name: /Converti il blocco .* in Sezione Globale/ }),
    ).not.toBeInTheDocument();
  });

  it('NON compare su un container annidato (figlio di un altro container): location.parentId non è null', () => {
    const nestedContainer = node('cont-child', 'container', {}, []);
    const outerContainer = node('cont-outer', 'container', {}, [nestedContainer]);
    useBlockEditorStore.getState().initTree([outerContainer]);
    useBlockEditorStore.getState().selectNode('cont-child');

    renderWithProviders(<EditorBlockWrapper id="cont-child" />);

    expect(
      screen.queryByRole('button', { name: /Converti il blocco .* in Sezione Globale/ }),
    ).not.toBeInTheDocument();
  });
});

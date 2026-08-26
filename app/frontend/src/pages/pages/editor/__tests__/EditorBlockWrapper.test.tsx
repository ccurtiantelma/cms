/**
 * Component test del bug di collasso colonne (`EditorBlockWrapper.tsx`, righe ~1110-1127):
 * una `section` a più colonne senza figli deve mostrare un segnaposto `.emptyContainer`
 * per traccia della griglia, non uno solo — altrimenti la griglia CSS piazza l'unico grid
 * item nella prima traccia e le colonne successive restano vuote e invisibili,
 * indistinguibile da una sezione a colonna singola (vedi commento di testa di
 * `effectiveColumnsCount` nel componente).
 *
 * Il numero di colonne effettivo si legge da `node.props.columns`, prop responsive
 * (`{ default, tablet?, mobile? }`, ADR-29): qui si valorizza solo `default`, il
 * viewport attivo di default è `desktop` (`useActiveViewport`, store).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../../test/utils';
import type { BlockNode } from '../block-tree.utils';

const { useBlockEditorStore } = await import('../../../../hooks/useBlockEditorStore');
const { default: EditorBlockWrapper } = await import('../EditorBlockWrapper');
const styles = (await import('../EditorBlockWrapper.module.css')).default;

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/** `.childrenArea` reale del contenitore, `display: contents` — unico genitore DOM atteso dei segnaposto. */
function childrenAreaOf(container: HTMLElement): HTMLElement {
  const area = container.querySelector<HTMLElement>(`.${styles.childrenArea}`);
  if (!area) throw new Error('.childrenArea non trovato nel markup renderizzato');
  return area;
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.getState().setActiveViewport('desktop');
});

describe('EditorBlockWrapper — segnaposto colonne vuote (bug collasso griglia)', () => {
  it('section columns=2 senza figli: esattamente 2 segnaposto .emptyContainer dentro .childrenArea', () => {
    const section = node('sec-2col', 'section', { columns: { default: '2' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-2col" />);

    const area = childrenAreaOf(container);
    const placeholders = area.querySelectorAll(`:scope > .${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(2);
  });

  it('section columns=3 senza figli: esattamente 3 segnaposto .emptyContainer', () => {
    const section = node('sec-3col', 'section', { columns: { default: '3' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-3col" />);

    const area = childrenAreaOf(container);
    const placeholders = area.querySelectorAll(`:scope > .${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(3);
  });

  it('section columns=1 senza figli: un solo .emptyContainer, fuori da .childrenArea (ramo colonna singola)', () => {
    const section = node('sec-1col', 'section', { columns: { default: '1' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1col" />);

    const placeholders = container.querySelectorAll(`.${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(1);
    // A una sola colonna il ramo del componente non passa da `.childrenArea`
    // (righe 1123-1127): niente wrapper grid per un unico segnaposto.
    expect(container.querySelector(`.${styles.childrenArea}`)).not.toBeInTheDocument();
  });

  it('section con figli presenti: nessun segnaposto .emptyContainer iniettato', () => {
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-with-child', 'section', { columns: { default: '2' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-with-child" />);

    expect(container.querySelectorAll(`.${styles.emptyContainer}`)).toHaveLength(0);
    // I figli veri restano grid item diretti di `.childrenArea` (`display: contents`).
    expect(container.querySelector('[data-block-id="h-1"]')).toBeInTheDocument();
  });
});

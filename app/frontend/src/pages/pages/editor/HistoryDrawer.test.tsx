// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import HistoryDrawer from './HistoryDrawer';

const initialTree: BlockNode[] = [
  { id: 'heading-1', type: 'heading', props: { text: 'Prima' }, children: [] },
];

beforeEach(() => {
  useBlockEditorStore.getState().initTree(initialTree);
  window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
});

describe('HistoryDrawer', () => {
  it('ripristina lo stato selezionato della timeline', () => {
    useBlockEditorStore.getState().updateBlockPropsAction('heading-1', { text: 'Seconda' });
    useBlockEditorStore.getState().updateBlockPropsAction('heading-1', { text: 'Terza' });

    renderWithProviders(<HistoryDrawer opened onClose={() => undefined} />);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Ripristina: Modificate proprietà heading-1' })[0],
    );

    expect(useBlockEditorStore.getState().tree[0].props.text).toBe('Seconda');
    expect(useBlockEditorStore.getState().historyIndex).toBe(0);
  });
});

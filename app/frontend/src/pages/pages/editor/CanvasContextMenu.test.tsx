import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import CanvasContextMenu from './CanvasContextMenu';

const initialTree: BlockNode[] = [
  {
    id: 'heading-1',
    type: 'heading',
    props: { level: 'h2', text: 'Uno', styleSpaceBefore: 'sm' },
    children: [],
  },
  {
    id: 'heading-2',
    type: 'heading',
    props: { level: 'h2', text: 'Due', styleSpaceBefore: 'lg' },
    children: [],
  },
];

function openMenu(id: string): void {
  fireEvent.contextMenu(screen.getByTestId(id));
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree(initialTree);
});

describe('CanvasContextMenu', () => {
  it('duplica il blocco selezionato dal menu contestuale', async () => {
    renderWithProviders(
      <CanvasContextMenu>
        <div data-testid="heading-1" data-block-id="heading-1" />
      </CanvasContextMenu>,
    );

    openMenu('heading-1');
    fireEvent.click(await waitFor(() => screen.getByText('Duplica')));

    const tree = useBlockEditorStore.getState().tree;
    expect(tree).toHaveLength(3);
    expect(tree[1].id).not.toBe('heading-1');
    expect(tree[1].props).toEqual(initialTree[0].props);
    expect(useBlockEditorStore.getState().selectedId).toBe(tree[1].id);
  });

  it('copia e incolla soltanto i token di stile', async () => {
    renderWithProviders(
      <CanvasContextMenu>
        <>
          <div data-testid="heading-1" data-block-id="heading-1" />
          <div data-testid="heading-2" data-block-id="heading-2" />
        </>
      </CanvasContextMenu>,
    );

    openMenu('heading-1');
    fireEvent.click(await waitFor(() => screen.getByText('Copia stile')));
    openMenu('heading-2');
    fireEvent.click(await waitFor(() => screen.getByText('Incolla stile')));

    expect(useBlockEditorStore.getState().tree[1].props).toEqual({
      level: 'h2',
      text: 'Due',
      styleSpaceBefore: 'sm',
    });
    expect(useBlockEditorStore.getState().styleClipboard).toEqual({
      styleSpaceBefore: 'sm',
    });
  });
});

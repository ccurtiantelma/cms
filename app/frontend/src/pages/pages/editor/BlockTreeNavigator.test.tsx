import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import BlockTreeNavigator from './BlockTreeNavigator';

beforeEach(() => {
  useBlockEditorStore.getState().initTree([
    {
      id: 'section-1',
      type: 'section',
      props: {},
      children: [{ id: 'heading-1', type: 'heading', props: {}, children: [] }],
    } satisfies BlockNode,
  ]);
});

describe('BlockTreeNavigator', () => {
  it('renders nested block types and ids', () => {
    renderWithProviders(<BlockTreeNavigator />);

    expect(screen.getByText('section (section-1)')).toBeInTheDocument();
    expect(screen.getByText('heading (heading-1)')).toBeInTheDocument();
  });

  it('selects a block when its tree node is clicked', () => {
    renderWithProviders(<BlockTreeNavigator />);

    fireEvent.click(screen.getByText('heading (heading-1)'));

    expect(useBlockEditorStore.getState().selectedId).toBe('heading-1');
  });

  it('collapses and expands a node with children', () => {
    renderWithProviders(<BlockTreeNavigator />);
    const section = screen.getByText('section (section-1)');

    fireEvent.click(section.parentElement?.querySelector('button') ?? section);
    expect(screen.getByText('heading (heading-1)')).not.toBeVisible();
  });

  it('moves a dragged root node into a container on drop', () => {
    useBlockEditorStore.getState().initTree([
      {
        id: 'section-1',
        type: 'section',
        props: {},
        children: [],
      },
      {
        id: 'heading-1',
        type: 'heading',
        props: {},
        children: [],
      },
    ] satisfies BlockNode[]);
    renderWithProviders(<BlockTreeNavigator />);

    const section = screen.getByText('section (section-1)').closest('[data-block-id]');
    const heading = screen.getByText('heading (heading-1)').closest('[data-block-id]');
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => undefined,
      getData: () => 'heading-1',
    } as unknown as DataTransfer;

    fireEvent.dragStart(heading as HTMLElement, { dataTransfer });
    fireEvent.dragOver(section as HTMLElement, { dataTransfer });
    fireEvent.drop(section as HTMLElement, { dataTransfer });

    expect(useBlockEditorStore.getState().tree).toEqual([
      {
        id: 'section-1',
        type: 'section',
        props: {},
        children: [{ id: 'heading-1', type: 'heading', props: {}, children: [] }],
      },
    ]);
  });
});

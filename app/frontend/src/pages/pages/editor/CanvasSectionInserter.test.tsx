import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import CanvasSectionInserter from './CanvasSectionInserter';

describe('CanvasSectionInserter', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
  });

  it('mostra la CTA nel canvas vuoto e crea section con container', () => {
    renderWithProviders(<CanvasSectionInserter index={0} empty />);

    expect(screen.getByText('Aggiungi Sezione')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi Sezione' }));

    const [section] = useBlockEditorStore.getState().tree;
    expect(section.type).toBe('section');
    expect(section.children).toHaveLength(1);
    expect(section.children[0].type).toBe('container');
  });

  it('inserisce la nuova section all indice richiesto', () => {
    useBlockEditorStore
      .getState()
      .initTree([{ id: 'first', type: 'heading', props: { text: '' }, children: [] }]);
    renderWithProviders(<CanvasSectionInserter index={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi Sezione' }));

    expect(useBlockEditorStore.getState().tree[0].type).toBe('section');
    expect(useBlockEditorStore.getState().tree[1].id).toBe('first');
  });
});

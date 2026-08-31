import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import CanvasSectionInserter from './CanvasSectionInserter';

describe('CanvasSectionInserter', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
  });

  it('non mostra alcun pulsante visibile: è solo un bersaglio invisibile del drag & drop', () => {
    renderWithProviders(<CanvasSectionInserter index={0} />);

    expect(screen.queryByRole('button', { name: 'Aggiungi Sezione' })).not.toBeInTheDocument();
    expect(screen.queryByText('Aggiungi Sezione')).not.toBeInTheDocument();
  });
});

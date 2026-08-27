import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../test/utils';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import EditorSidebar from './EditorSidebar';
import WidgetPalette from './WidgetPalette';

describe('WidgetPalette', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveSidebarTab('widgets');
  });

  it('mostra le categorie Layout e Base', () => {
    renderWithProviders(<WidgetPalette />);

    expect(screen.getByRole('button', { name: /layout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /base/i })).toBeInTheDocument();
  });

  it('filtra i widget in tempo reale con la ricerca', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WidgetPalette />);

    expect(screen.getByRole('button', { name: /titolo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /immagine/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Cerca widget...'), 'image');

    expect(screen.getByRole('button', { name: /immagine/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /titolo/i })).not.toBeInTheDocument();
  });
});

describe('EditorSidebar', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveSidebarTab('widgets');
  });

  it('mostra le schede Widgets e Proprietà', () => {
    renderWithProviders(<EditorSidebar />);

    expect(screen.getByRole('tab', { name: 'Widgets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Proprietà' })).toBeInTheDocument();
  });
});

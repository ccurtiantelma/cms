import { act, screen } from '@testing-library/react';
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

  it('mostra le categorie Base, Media, Struttura e Moduli', () => {
    renderWithProviders(<WidgetPalette />);

    expect(screen.getByRole('button', { name: /base/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /media/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /struttura/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /moduli/i })).toBeInTheDocument();
  });

  it('mostra i tre blocchi Form nella categoria Moduli', () => {
    renderWithProviders(<WidgetPalette />);

    expect(screen.getByRole('button', { name: /modulo di contatto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /campo modulo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pulsante invio modulo/i })).toBeInTheDocument();
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

  it('mostra le schede Widgets, Struttura e Modifica (3ª, ADR-94)', () => {
    renderWithProviders(<EditorSidebar />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
    expect(tabs.slice(0, 3)).toEqual(['Widgets', 'Struttura', 'Modifica']);
  });

  it('selezionare un blocco nel canvas attiva la scheda Modifica', () => {
    useBlockEditorStore.getState().initTree([]);
    renderWithProviders(<EditorSidebar />);
    expect(screen.getByRole('tab', { name: 'Widgets' })).toHaveAttribute('aria-selected', 'true');

    act(() => useBlockEditorStore.getState().selectNode('node-1'));

    expect(screen.getByRole('tab', { name: 'Modifica' })).toHaveAttribute('aria-selected', 'true');
  });
});

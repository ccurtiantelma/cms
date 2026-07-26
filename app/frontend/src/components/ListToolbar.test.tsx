/**
 * Test di render per `ListToolbar`: totale risultati, indicatore pagina,
 * stato dei controlli di paginazione, ricerca e azione "Nuovo".
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListToolbar, { type ListToolbarState } from './ListToolbar';
import { renderWithProviders } from '../test/utils';

function makeState(overrides: Partial<ListToolbarState> = {}): ListToolbarState {
  return {
    page: 1,
    setPage: vi.fn(),
    totalPages: 3,
    limit: 20,
    setLimit: vi.fn(),
    total: 42,
    search: '',
    setSearch: vi.fn(),
    ...overrides,
  };
}

describe('ListToolbar', () => {
  it('mostra totale risultati e indicatore di pagina', () => {
    renderWithProviders(
      <ListToolbar state={makeState()} newLabel="Nuovo Utente" onNew={vi.fn()} />,
    );

    expect(screen.getByText('42 risultati')).toBeInTheDocument();
    expect(screen.getByText('Pagina 1 / 3')).toBeInTheDocument();
  });

  it('disabilita "precedente" alla prima pagina e abilita "successiva"', () => {
    renderWithProviders(
      <ListToolbar state={makeState({ page: 1 })} newLabel="Nuovo" onNew={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Pagina precedente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pagina successiva' })).toBeEnabled();
  });

  it('invoca onNew al click sul pulsante di creazione', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    renderWithProviders(<ListToolbar state={makeState()} newLabel="Nuovo Utente" onNew={onNew} />);

    await user.click(screen.getByRole('button', { name: 'Nuovo Utente' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('aggiorna ricerca e riporta a pagina 1 durante la digitazione', async () => {
    const user = userEvent.setup();
    const state = makeState();
    renderWithProviders(<ListToolbar state={state} newLabel="Nuovo" onNew={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Cerca...'), 'x');
    expect(state.setSearch).toHaveBeenCalledWith('x');
    expect(state.setPage).toHaveBeenCalledWith(1);
  });

  it('renderizza lo slot dei filtri', () => {
    renderWithProviders(
      <ListToolbar
        state={makeState()}
        newLabel="Nuovo"
        onNew={vi.fn()}
        filters={<div data-testid="filtro-extra">filtro</div>}
      />,
    );

    expect(screen.getByTestId('filtro-extra')).toBeInTheDocument();
  });
});

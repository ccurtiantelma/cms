/**
 * Test di `<Can>` (SPEC-RBAC-F2b S30, criterio 6).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import { useAuthStore } from '../hooks/useAuth';
import Can from './Can';

describe('<Can> (SPEC F2b S30)', () => {
  beforeEach(() => {
    useAuthStore.setState({ permissions: ['roles:read'] });
  });

  it('mostra il figlio se il permesso è presente', () => {
    renderWithProviders(
      <Can permission="roles:read">
        <span>contenuto</span>
      </Can>,
    );
    expect(screen.getByText('contenuto')).toBeInTheDocument();
  });

  it('nasconde il figlio se il permesso manca', () => {
    renderWithProviders(
      <Can permission="roles:manage">
        <span>contenuto</span>
      </Can>,
    );
    expect(screen.queryByText('contenuto')).not.toBeInTheDocument();
  });

  it('mostra il fallback se il permesso manca', () => {
    renderWithProviders(
      <Can permission="roles:manage" fallback={<span>negato</span>}>
        <span>contenuto</span>
      </Can>,
    );
    expect(screen.getByText('negato')).toBeInTheDocument();
    expect(screen.queryByText('contenuto')).not.toBeInTheDocument();
  });

  it('con permessi null nasconde il figlio', () => {
    useAuthStore.setState({ permissions: null });
    renderWithProviders(
      <Can permission="roles:read">
        <span>contenuto</span>
      </Can>,
    );
    expect(screen.queryByText('contenuto')).not.toBeInTheDocument();
  });

  it('una funzione figlia riceve true o false', () => {
    const render = vi.fn((allowed: boolean) => (
      <button type="button" disabled={!allowed}>
        Salva
      </button>
    ));
    const { unmount } = renderWithProviders(<Can permission="roles:read">{render}</Can>);
    expect(render).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Salva' })).toBeEnabled();
    unmount();

    renderWithProviders(<Can permission="roles:manage">{render}</Can>);
    expect(render).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled();
  });

  it('array di permessi in AND', () => {
    renderWithProviders(
      <Can permission={['roles:read', 'users:assign_roles']}>
        <span>contenuto</span>
      </Can>,
    );
    expect(screen.queryByText('contenuto')).not.toBeInTheDocument();
  });
});

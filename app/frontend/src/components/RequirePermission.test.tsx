/**
 * Test di `RequirePermission` (SPEC-RBAC-F2b S28, criterio 7).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { useAuthStore } from '../hooks/useAuth';
import RequirePermission from './RequirePermission';

function renderAt(path: string): void {
  renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/roles"
          element={
            <RequirePermission permission="roles:read">
              <span>pagina ruoli</span>
            </RequirePermission>
          }
        />
        <Route path="/dashboard" element={<span>dashboard</span>} />
        <Route path="/login" element={<span>login</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequirePermission (SPEC F2b S28)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, permissions: null });
  });

  it('permessi null con token presente → loader, nessun redirect', () => {
    localStorage.setItem('access_token', 'tok');
    renderAt('/roles');
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('pagina ruoli')).not.toBeInTheDocument();
    expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();
  });

  it('permessi null senza token → /login', () => {
    renderAt('/roles');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('permesso mancante → redirect a /dashboard', () => {
    localStorage.setItem('access_token', 'tok');
    useAuthStore.setState({ permissions: ['pages:read'] });
    renderAt('/roles');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('permesso presente → figli', () => {
    localStorage.setItem('access_token', 'tok');
    useAuthStore.setState({ permissions: ['roles:read'] });
    renderAt('/roles');
    expect(screen.getByText('pagina ruoli')).toBeInTheDocument();
  });
});

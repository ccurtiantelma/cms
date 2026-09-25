/**
 * Test della pagina Ruoli (SPEC-RBAC-F2b § Pagina Ruoli, S32, S35, S37; criteri 13, 14, 17 per
 * l'eliminazione, 18). Service mockati al confine di rete, store impostato via `setState`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import {
  ADMIN_PERMISSION_CODES,
  ALL_PERMISSION_CODES,
  PERMISSION_CATALOG,
} from '../../test/fixtures/permission-catalog';
import { AUDITOR_ROLE, EDITOR_ROLE, ROLES } from '../../test/fixtures/roles';

const fetchRoles = vi.fn();
const fetchPermissionCatalog = vi.fn();
const createRole = vi.fn();
const updateRole = vi.fn();
const deleteRole = vi.fn();
const show = vi.fn();
const refreshPermissions = vi.fn();

vi.mock('../../services/roles.service', () => ({
  fetchRoles: () => fetchRoles(),
  fetchPermissionCatalog: () => fetchPermissionCatalog(),
  createRole: (...args: unknown[]) => createRole(...args),
  updateRole: (...args: unknown[]) => updateRole(...args),
  deleteRole: (...args: unknown[]) => deleteRole(...args),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => show(...args) },
}));

const { default: PageRoles } = await import('./PageRoles');

function httpError(status: number, data: Record<string, unknown> = {}): unknown {
  return { isAxiosError: true, response: { status, data } };
}

function renderPage(permissions: string[]): void {
  useAuthStore.setState({ permissions, refreshPermissions });
  renderWithProviders(
    <MemoryRouter>
      <PageRoles />
    </MemoryRouter>,
  );
}

/** Riga della tabella che contiene il codice del ruolo. */
async function rowOf(code: string): Promise<HTMLElement> {
  const cell = await screen.findByText(code, { selector: 'p' });
  return cell.closest('tr') as HTMLElement;
}

function actionLabels(row: HTMLElement): string[] {
  return within(row)
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '');
}

describe('PageRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRoles.mockResolvedValue(ROLES);
    fetchPermissionCatalog.mockResolvedValue(PERMISSION_CATALOG);
    refreshPermissions.mockResolvedValue(undefined);
  });

  describe('tabella (criterio 13)', () => {
    it('righe nell\'ordine della risposta, badge "Sistema" sui 4 ruoli di sistema', async () => {
      renderPage(ALL_PERMISSION_CODES);
      await rowOf('revisore');

      const codes = screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getByText(/^[a-z_]+$/, { selector: 'p' }).textContent);
      expect(codes).toEqual(['superadmin', 'admin', 'manager', 'user', 'redattore', 'revisore']);
      expect(screen.getAllByText('Sistema')).toHaveLength(4);
      expect(screen.getAllByText('Personalizzato')).toHaveLength(2);
    });

    it('oltre 4 permessi mostra "+N"', async () => {
      renderPage(ALL_PERMISSION_CODES);
      const superadmin = await rowOf('superadmin');
      expect(within(superadmin).getByText('+16')).toBeInTheDocument();
      const editor = await rowOf('redattore');
      expect(within(editor).queryByText(/^\+\d+$/)).not.toBeInTheDocument();
      expect(within(editor).getByText('pages:publish')).toBeInTheDocument();
    });

    it('errore di caricamento → avviso in pagina con "Riprova"', async () => {
      fetchRoles.mockRejectedValueOnce(httpError(500));
      const user = userEvent.setup();
      renderPage(ALL_PERMISSION_CODES);

      expect(await screen.findByText('Ruoli non caricati')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Riprova' }));
      await rowOf('revisore');
      expect(screen.queryByText('Ruoli non caricati')).not.toBeInTheDocument();
    });
  });

  describe('azioni per permesso (criterio 14)', () => {
    it('SuperAdmin: "Nuovo ruolo" e Modifica su tutti i ruoli, Elimina solo sui personalizzati', async () => {
      renderPage(ALL_PERMISSION_CODES);
      expect(await screen.findByRole('button', { name: 'Nuovo ruolo' })).toBeInTheDocument();
      expect(actionLabels(await rowOf('admin'))).toEqual(['Modifica']);
      expect(actionLabels(await rowOf('redattore'))).toEqual(['Modifica', 'Elimina']);
    });

    it('Admin (roles:read senza roles:manage): nessun "Nuovo ruolo", solo Visualizza', async () => {
      renderPage(ADMIN_PERMISSION_CODES);
      await rowOf('revisore');
      expect(screen.queryByRole('button', { name: 'Nuovo ruolo' })).not.toBeInTheDocument();
      for (const code of ['superadmin', 'admin', 'redattore', 'revisore']) {
        expect(actionLabels(await rowOf(code))).toEqual(['Visualizza']);
      }
    });

    it('Visualizza apre il drawer in sola lettura senza roles:manage', async () => {
      const user = userEvent.setup();
      renderPage(ADMIN_PERMISSION_CODES);

      await user.click(
        within(await rowOf('redattore')).getByRole('button', { name: 'Visualizza' }),
      );
      expect(await screen.findByText('Ruolo: Redattore')).toBeInTheDocument();
      expect(
        await screen.findByRole('checkbox', { name: 'Modificare una Pagina di altri' }),
      ).toBeChecked();
      expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument();

      await user.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]);
      await user.click(within(await rowOf('revisore')).getByRole('button', { name: 'Visualizza' }));
      await screen.findByText('Ruolo: Revisore');
      expect(fetchPermissionCatalog).toHaveBeenCalledTimes(1);
    });

    it('guida sotto la tabella se non ci sono ruoli personalizzati, solo con roles:manage', async () => {
      fetchRoles.mockResolvedValue(ROLES.filter((role) => role.isSystem));
      renderPage(ALL_PERMISSION_CODES);
      expect(await screen.findByText(/Nessun ruolo personalizzato/)).toBeInTheDocument();
    });
  });

  describe('scritture (criterio 18)', () => {
    it('creazione riuscita → lista ricaricata e permessi aggiornati', async () => {
      createRole.mockResolvedValue({ guid: 'new0000000000001' });
      const user = userEvent.setup();
      renderPage(ALL_PERMISSION_CODES);

      await user.click(await screen.findByRole('button', { name: 'Nuovo ruolo' }));
      await user.type(await screen.findByRole('textbox', { name: /Codice/ }), 'grafico');
      await user.type(screen.getByRole('textbox', { name: /Nome/ }), 'Grafico');
      await screen.findByRole('checkbox', { name: 'Caricare Media' });
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(refreshPermissions).toHaveBeenCalledTimes(1));
      expect(fetchRoles).toHaveBeenCalledTimes(2);
    });

    it('eliminazione riuscita → toast verde, lista ricaricata e permessi aggiornati', async () => {
      deleteRole.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage(ALL_PERMISSION_CODES);

      await user.click(within(await rowOf('revisore')).getByRole('button', { name: 'Elimina' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Elimina' }));

      await waitFor(() => expect(deleteRole).toHaveBeenCalledWith(AUDITOR_ROLE.guid));
      await waitFor(() => expect(refreshPermissions).toHaveBeenCalledTimes(1));
      expect(fetchRoles).toHaveBeenCalledTimes(2);
      expect(show).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }));
    });
  });

  describe('eliminazione in errore (criterio 17)', () => {
    it('409 ROLE_IN_USE → toast con il messaggio del backend, riga ancora presente', async () => {
      const message = 'Il ruolo è assegnato a 3 utenti: rimuovilo prima di eliminarlo.';
      deleteRole.mockRejectedValue(httpError(409, { code: 'ROLE_IN_USE', message }));
      const user = userEvent.setup();
      renderPage(ALL_PERMISSION_CODES);

      await user.click(within(await rowOf('redattore')).getByRole('button', { name: 'Elimina' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Elimina' }));

      await waitFor(() =>
        expect(show).toHaveBeenCalledWith({
          color: 'red',
          message: expect.stringContaining(message),
        }),
      );
      expect(refreshPermissions).not.toHaveBeenCalled();
      expect(await rowOf('redattore')).toBeInTheDocument();
      expect(deleteRole).toHaveBeenCalledWith(EDITOR_ROLE.guid);
    });
  });
});

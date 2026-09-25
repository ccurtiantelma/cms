/**
 * Test dei ruoli aggiuntivi in `PageUsers` (SPEC-RBAC-F2b S38, criteri 19–25). Service mockati
 * al confine di rete; lo store di autenticazione è impostato via `setState`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { AppUserRoles, ROLE_LABELS } from '../../types/common.types';
import type { UserListItem } from '../../services/admin.service';
import { ADMIN_PERMISSION_CODES } from '../../test/fixtures/permission-catalog';
import { AUDITOR_ROLE, EDITOR_ROLE, ROLES } from '../../test/fixtures/roles';

const fetchUsers = vi.fn();
const fetchAuditLog = vi.fn();
const fetchUser = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const fetchRoles = vi.fn();
const show = vi.fn();
const refreshPermissions = vi.fn();

vi.mock('../../services/admin.service', () => ({
  fetchUsers: (...args: unknown[]) => fetchUsers(...args),
  fetchAuditLog: (...args: unknown[]) => fetchAuditLog(...args),
  fetchUser: (...args: unknown[]) => fetchUser(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
  toggleActiveUser: vi.fn(),
  resetMfaUser: vi.fn(),
}));

vi.mock('../../services/roles.service', () => ({
  fetchRoles: () => fetchRoles(),
}));

vi.mock('../../services/auth.service', () => ({
  impersonateApi: vi.fn(),
  getMeApi: vi.fn(),
  logoutApi: vi.fn(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => show(...args) },
}));

const { default: PageUsers } = await import('./PageUsers');

const ME: UserListItem = {
  guid: 'adm0000000000001',
  name: 'Anna',
  surname: 'Admin',
  email: 'anna@example.com',
  role: AppUserRoles.Admin,
  scopeId: null,
  isActive: true,
  isMfaEnabled: false,
  createdAt: '2026-09-01T10:00:00.000Z',
};

const OTHER: UserListItem = {
  ...ME,
  guid: 'usr0000000000002',
  name: 'Ugo',
  surname: 'User',
  email: 'ugo@example.com',
  role: AppUserRoles.User,
};

function page<T>(items: T[]): unknown {
  return { items, totalItems: items.length, totalPages: 1, currentPage: 1, itemsPerPage: 10 };
}

function httpError(status: number, data: Record<string, unknown> = {}): unknown {
  return { isAxiosError: true, response: { status, data } };
}

function renderPage(permissions: string[] = ADMIN_PERMISSION_CODES): void {
  useAuthStore.setState({
    user: {
      id: 1,
      guid: ME.guid,
      name: ME.name,
      surname: ME.surname,
      email: ME.email,
      role: ME.role,
      scopeId: null,
    },
    permissions,
    refreshPermissions,
  });
  renderWithProviders(
    <MemoryRouter>
      <PageUsers />
    </MemoryRouter>,
  );
}

const rolesField = (): HTMLElement => screen.getByRole('textbox', { name: 'Ruoli aggiuntivi' });

async function openCreate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /Nuovo Utente/ }));
  await screen.findByText('Nuovo Utente', { selector: 'p' });
}

async function openEdit(
  user: ReturnType<typeof userEvent.setup>,
  target: UserListItem,
): Promise<void> {
  const cell = await screen.findByText(target.email);
  const row = cell.closest('tr') as HTMLElement;
  await user.click(within(row).getByRole('button', { name: 'Modifica' }));
  await screen.findByText('Modifica Utente', { selector: 'p' });
}

/** Toglie (o aggiunge) un ruolo cliccandone l'opzione nel menu del multi-select. */
async function toggleRoleOption(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
): Promise<void> {
  await user.click(rolesField());
  await user.click(await screen.findByRole('option', { name }));
}

/** Attende che il campo sia pronto (ruoli e dettaglio caricati). */
async function waitRolesReady(): Promise<void> {
  await waitFor(() => expect(rolesField()).toBeEnabled());
}

describe('PageUsers — ruoli aggiuntivi (SPEC F2b S38)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchUsers.mockResolvedValue(page([ME, OTHER]));
    fetchAuditLog.mockResolvedValue(page([]));
    fetchRoles.mockResolvedValue(ROLES);
    fetchUser.mockImplementation((guid: string) =>
      Promise.resolve({
        ...(guid === ME.guid ? ME : OTHER),
        updatedAt: '2026-09-02T10:00:00.000Z',
        roles: [EDITOR_ROLE, AUDITOR_ROLE].map(({ guid: g, code, name }) => ({
          guid: g,
          code,
          name,
        })),
      }),
    );
    createUser.mockResolvedValue({ guid: 'new0000000000001' });
    updateUser.mockResolvedValue({ guid: OTHER.guid });
    refreshPermissions.mockResolvedValue(undefined);
  });

  it('con i due permessi: multi-select con i soli ruoli personalizzati, "Ruolo" invariato (19)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCreate(user);
    await waitRolesReady();

    await user.click(rolesField());
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Redattoreredattore', 'Revisorerevisore']);

    // Il select del livello base resta, con le stesse 3 opzioni.
    const baseRole = screen.getByRole('textbox', { name: /^Ruolo/ });
    await user.click(baseRole);
    for (const role of [AppUserRoles.Admin, AppUserRoles.Manager, AppUserRoles.User]) {
      const label = ROLE_LABELS[role];
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('senza users:assign_roles: nessun multi-select e nessuna chiamata a fetchRoles (20)', async () => {
    const user = userEvent.setup();
    renderPage(ADMIN_PERMISSION_CODES.filter((code) => code !== 'users:assign_roles'));
    await openCreate(user);

    expect(screen.queryByRole('textbox', { name: 'Ruoli aggiuntivi' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Ruolo/ })).toBeInTheDocument();
    expect(fetchRoles).not.toHaveBeenCalled();
  });

  it('senza roles:read: nessun multi-select, nessun fetchUser in modifica (20)', async () => {
    const user = userEvent.setup();
    renderPage(ADMIN_PERMISSION_CODES.filter((code) => code !== 'roles:read'));
    await openEdit(user, OTHER);

    expect(screen.queryByRole('textbox', { name: 'Ruoli aggiuntivi' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.lastCall?.[1]).not.toHaveProperty('roleGuids');
    expect(fetchRoles).not.toHaveBeenCalled();
    expect(fetchUser).not.toHaveBeenCalled();
  });

  describe('modifica (21)', () => {
    it('precompila i ruoli dal dettaglio e, senza toccarli, non invia roleGuids', async () => {
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, OTHER);
      await waitRolesReady();

      expect(fetchUser).toHaveBeenCalledTimes(1);
      expect(fetchUser).toHaveBeenCalledWith(OTHER.guid);
      const drawer = screen.getByRole('dialog');
      expect(within(drawer).getByText('Redattore')).toBeInTheDocument();
      expect(within(drawer).getByText('Revisore')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Salva' }));
      await waitFor(() => expect(updateUser).toHaveBeenCalled());
      expect(updateUser.mock.lastCall?.[1]).not.toHaveProperty('roleGuids');
    });

    it('con un ruolo tolto invia il nuovo insieme', async () => {
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, OTHER);
      await waitRolesReady();

      // Un clic su un'opzione già scelta la toglie.
      await toggleRoleOption(user, /Revisore/);
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(updateUser).toHaveBeenCalled());
      expect(updateUser.mock.lastCall?.[1]).toMatchObject({ roleGuids: [EDITOR_ROLE.guid] });
      // Il dettaglio si carica una volta sola, non a ogni modifica del campo.
      expect(fetchUser).toHaveBeenCalledTimes(1);
    });

    it('svuotato invia roleGuids: []', async () => {
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, OTHER);
      await waitRolesReady();

      await toggleRoleOption(user, /Redattore/);
      await toggleRoleOption(user, /Revisore/);
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(updateUser).toHaveBeenCalled());
      expect(updateUser.mock.lastCall?.[1]).toMatchObject({ roleGuids: [] });
    });
  });

  it('creazione con il campo vuoto: payload senza roleGuids (22)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCreate(user);
    await waitRolesReady();

    await user.type(screen.getByRole('textbox', { name: /^Nome/ }), 'Nuovo');
    await user.type(screen.getByRole('textbox', { name: /^Email/ }), 'nuovo@example.com');
    await user.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(createUser.mock.lastCall?.[0]).not.toHaveProperty('roleGuids');
  });

  it('creazione con un ruolo scelto: roleGuids inviato', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCreate(user);
    await waitRolesReady();

    await user.type(screen.getByRole('textbox', { name: /^Nome/ }), 'Nuovo');
    await user.type(screen.getByRole('textbox', { name: /^Email/ }), 'nuovo@example.com');
    await toggleRoleOption(user, /Redattore/);
    await user.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(createUser.mock.lastCall?.[0]).toMatchObject({ roleGuids: [EDITOR_ROLE.guid] });
  });

  it('ruolo con un permesso che il chiamante non ha: opzione disabilitata (23)', async () => {
    const user = userEvent.setup();
    // Il chiamante non ha audit:read, che il ruolo Revisore contiene.
    renderPage(ADMIN_PERMISSION_CODES.filter((code) => code !== 'audit:read'));
    await openCreate(user);
    await waitRolesReady();

    await user.click(rolesField());
    expect(await screen.findByRole('option', { name: /Revisore/ })).toHaveAttribute(
      'data-combobox-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: /Redattore/ })).not.toHaveAttribute(
      'data-combobox-disabled',
    );
  });

  describe('refresh dei permessi (24)', () => {
    it("salvataggio dell'utente corrente → refreshPermissions", async () => {
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, ME);
      await waitRolesReady();
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(updateUser).toHaveBeenCalled());
      await waitFor(() => expect(refreshPermissions).toHaveBeenCalledTimes(1));
    });

    it('salvataggio di un altro utente → nessun refresh', async () => {
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, OTHER);
      await waitRolesReady();
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(updateUser).toHaveBeenCalled());
      expect(refreshPermissions).not.toHaveBeenCalled();
    });
  });

  describe('errori di dominio (25)', () => {
    it.each([
      [httpError(400, { code: 'SYSTEM_ROLE_NOT_ASSIGNABLE' }), /campo "Ruolo"/],
      [
        httpError(403, {
          code: 'PERMISSION_ESCALATION',
          message: 'Non puoi concedere permessi che non possiedi: audit:read.',
        }),
        /Non puoi concedere permessi che non possiedi: audit:read/,
      ],
    ])('toast dedicato e drawer aperto (%#)', async (error, expected) => {
      updateUser.mockRejectedValue(error);
      const user = userEvent.setup();
      renderPage();
      await openEdit(user, OTHER);
      await waitRolesReady();
      await toggleRoleOption(user, /Redattore/);
      await user.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(show).toHaveBeenCalledWith({
          color: 'red',
          message: expect.stringMatching(expected),
        }),
      );
      expect(screen.getByText('Modifica Utente', { selector: 'p' })).toBeInTheDocument();
    });
  });
});

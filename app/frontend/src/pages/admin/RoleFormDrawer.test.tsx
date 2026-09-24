/**
 * Test del drawer ruolo (SPEC-RBAC-F2b S35, S37; criteri 15–17 lato drawer).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import { ALL_PERMISSION_CODES, PERMISSION_CATALOG } from '../../test/fixtures/permission-catalog';
import { EDITOR_ROLE, SYSTEM_ROLES } from '../../test/fixtures/roles';
import type { RoleRecord } from '../../types/roles.types';
import type { RoleDrawerMode } from './RoleFormDrawer';

const createRole = vi.fn();
const updateRole = vi.fn();
const show = vi.fn();

vi.mock('../../services/roles.service', () => ({
  createRole: (...args: unknown[]) => createRole(...args),
  updateRole: (...args: unknown[]) => updateRole(...args),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => show(...args) },
}));

const { default: RoleFormDrawer } = await import('./RoleFormDrawer');

function httpError(status: number, data: Record<string, unknown> = {}): unknown {
  return { isAxiosError: true, response: { status, data } };
}

const callbacks = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onRoleMissing: vi.fn(),
  onReloadCatalog: vi.fn(),
};

function renderDrawer(mode: RoleDrawerMode, role: RoleRecord | null = null): void {
  renderWithProviders(
    <RoleFormDrawer
      opened
      mode={mode}
      role={role}
      catalog={PERMISSION_CATALOG}
      catalogError={false}
      callerPermissions={ALL_PERMISSION_CODES}
      {...callbacks}
    />,
  );
}

const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Salva' });

describe('RoleFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRole.mockResolvedValue({ guid: 'new0000000000001' });
    updateRole.mockResolvedValue({ guid: EDITOR_ROLE.guid });
  });

  describe('creazione (criterio 15)', () => {
    it('invia code, name, description null e i codici selezionati', async () => {
      const user = userEvent.setup();
      renderDrawer('create');

      await user.type(screen.getByRole('textbox', { name: /Codice/ }), 'redattore_senior');
      await user.type(screen.getByRole('textbox', { name: /Nome/ }), '  Redattore senior ');
      await user.click(screen.getByRole('checkbox', { name: 'Creare una Pagina' }));
      await user.click(screen.getByRole('checkbox', { name: 'Caricare Media' }));
      await user.click(saveButton());

      await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalled());
      expect(createRole).toHaveBeenCalledWith({
        code: 'redattore_senior',
        name: 'Redattore senior',
        description: null,
        permissionCodes: ['pages:create', 'media:upload'],
      });
      expect(show).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }));
    });

    it('con codice "Bad-Code" mostra l\'errore di campo e blocca l\'invio', async () => {
      const user = userEvent.setup();
      renderDrawer('create');

      await user.type(screen.getByRole('textbox', { name: /Codice/ }), 'Bad-Code');
      await user.type(screen.getByRole('textbox', { name: /Nome/ }), 'Qualsiasi');

      expect(await screen.findByText(/Minuscole, cifre e underscore/)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      await user.click(saveButton());
      expect(createRole).not.toHaveBeenCalled();
    });
  });

  describe('modifica (criterio 16)', () => {
    it('il PATCH contiene solo il nome cambiato, mai code', async () => {
      const user = userEvent.setup();
      renderDrawer('edit', EDITOR_ROLE);

      const name = screen.getByRole('textbox', { name: /Nome/ });
      await user.clear(name);
      await user.type(name, 'Caporedattore');
      await user.click(saveButton());

      await waitFor(() => expect(updateRole).toHaveBeenCalledTimes(1));
      expect(updateRole).toHaveBeenCalledWith(EDITOR_ROLE.guid, { name: 'Caporedattore' });
      expect(callbacks.onSaved).toHaveBeenCalled();
    });

    it('il PATCH contiene solo i permessi se cambiano solo quelli', async () => {
      const user = userEvent.setup();
      renderDrawer('edit', EDITOR_ROLE);

      await user.click(
        screen.getByRole('checkbox', { name: 'Pubblicare, programmare e archiviare una Pagina' }),
      );
      await user.click(saveButton());

      await waitFor(() => expect(updateRole).toHaveBeenCalledTimes(1));
      expect(updateRole).toHaveBeenCalledWith(EDITOR_ROLE.guid, {
        permissionCodes: ['pages:edit_any'],
      });
    });

    it('senza modifiche nessuna chiamata e il drawer si chiude', async () => {
      const user = userEvent.setup();
      renderDrawer('edit', EDITOR_ROLE);

      await user.click(saveButton());

      expect(updateRole).not.toHaveBeenCalled();
      expect(callbacks.onClose).toHaveBeenCalled();
    });

    it('il codice è in sola lettura', () => {
      renderDrawer('edit', EDITOR_ROLE);
      expect(screen.queryByRole('textbox', { name: /Codice/ })).not.toBeInTheDocument();
      expect(screen.getByTestId('role-code')).toHaveTextContent('redattore');
    });
  });

  describe('sola lettura', () => {
    it('ruolo di sistema: campi e matrice disabilitati, nessun "Salva"', () => {
      renderDrawer('view', SYSTEM_ROLES[1]);
      expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument();
      // La "X" dell'intestazione e il pulsante della barra azioni: entrambi chiudono.
      expect(screen.getAllByRole('button', { name: 'Chiudi' })).toHaveLength(2);
      expect(screen.getByRole('textbox', { name: /Nome/ })).toBeDisabled();
      screen.getAllByRole('checkbox').forEach((box) => expect(box).toBeDisabled());
      expect(screen.getByRole('checkbox', { name: "Consultare l'audit log" })).toBeChecked();
    });
  });

  describe('errori (criterio 17)', () => {
    async function submitEdit(): Promise<void> {
      const user = userEvent.setup();
      renderDrawer('edit', EDITOR_ROLE);
      await user.click(screen.getByRole('checkbox', { name: 'Caricare Media' }));
      await user.click(saveButton());
      await waitFor(() => expect(updateRole).toHaveBeenCalled());
    }

    it('400 RESERVED_PERMISSION → toast dedicato, drawer aperto', async () => {
      updateRole.mockRejectedValue(httpError(400, { code: 'RESERVED_PERMISSION' }));
      await submitEdit();
      await waitFor(() =>
        expect(show).toHaveBeenCalledWith({
          color: 'red',
          message: expect.stringContaining('roles:manage'),
        }),
      );
      expect(callbacks.onSaved).not.toHaveBeenCalled();
    });

    it('409 ROLE_CODE_DUPLICATE → errore sul campo Codice', async () => {
      createRole.mockRejectedValue(httpError(409, { code: 'ROLE_CODE_DUPLICATE' }));
      const user = userEvent.setup();
      renderDrawer('create');
      await user.type(screen.getByRole('textbox', { name: /Codice/ }), 'admin_bis');
      await user.type(screen.getByRole('textbox', { name: /Nome/ }), 'Admin bis');
      await user.click(saveButton());

      expect(await screen.findByText('Esiste già un ruolo con questo codice.')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /Codice/ })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('400 INVALID_PERMISSION_CODE → catalogo da ricaricare', async () => {
      updateRole.mockRejectedValue(httpError(400, { code: 'INVALID_PERMISSION_CODE' }));
      await submitEdit();
      await waitFor(() => expect(callbacks.onReloadCatalog).toHaveBeenCalled());
    });

    it('403 senza codice di dominio → nessun toast della pagina', async () => {
      updateRole.mockRejectedValue(httpError(403, { code: 'ForbiddenException' }));
      await submitEdit();
      await waitFor(() => expect(saveButton()).not.toHaveAttribute('data-loading'));
      expect(show).not.toHaveBeenCalled();
    });

    it('404 → ruolo mancante segnalato alla pagina', async () => {
      updateRole.mockRejectedValue(httpError(404, { code: 'NotFoundException' }));
      await submitEdit();
      await waitFor(() => expect(callbacks.onRoleMissing).toHaveBeenCalled());
      expect(show).not.toHaveBeenCalled();
    });
  });
});

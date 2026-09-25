/**
 * Test del componente `PermissionMatrix` (SPEC-RBAC-F2b S33–S34, criterio 12).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithProviders } from '../../test/utils';
import PermissionMatrix from './PermissionMatrix';
import { ALL_PERMISSION_CODES, PERMISSION_CATALOG } from '../../test/fixtures/permission-catalog';
import type { PermissionGroup } from '../../types/roles.types';

function Controlled({
  groups = PERMISSION_CATALOG,
  initial = [],
  caller = ALL_PERMISSION_CODES,
  readOnly = false,
  onChange,
}: {
  groups?: PermissionGroup[];
  initial?: string[];
  caller?: string[];
  readOnly?: boolean;
  onChange?: (value: string[]) => void;
}): JSX.Element {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <PermissionMatrix
      groups={groups}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      callerPermissions={caller}
      readOnly={readOnly}
    />
  );
}

const ROLES_MANAGE = /Creare, modificare ed eliminare ruoli personalizzati/;

describe('PermissionMatrix (criterio 12)', () => {
  it('mostra le 6 categorie con le etichette italiane', () => {
    renderWithProviders(<Controlled />);
    for (const label of ['Pagine', 'Struttura', 'Media', 'Moduli', 'Impostazioni', 'Utenti']) {
      expect(screen.getByRole('checkbox', { name: `Seleziona tutti: ${label}` })).toBeVisible();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(6 + 20);
  });

  it('una categoria sconosciuta mostra il codice grezzo', () => {
    renderWithProviders(
      <Controlled
        groups={[
          { category: 'analytics', permissions: [{ code: 'analytics:read', description: null }] },
        ]}
        caller={['analytics:read']}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Seleziona tutti: analytics' })).toBeVisible();
    // Senza descrizione, l'etichetta è il codice.
    expect(screen.getByRole('checkbox', { name: 'analytics:read' })).toBeEnabled();
  });

  it('roles:manage è disabilitata con un tooltip che ne spiega il motivo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Controlled />);
    expect(screen.getByRole('checkbox', { name: ROLES_MANAGE })).toBeDisabled();

    await user.hover(screen.getByTestId('locked-roles:manage'));
    expect(await screen.findByText(/Riservato ai ruoli di sistema/)).toBeInTheDocument();
  });

  it('un permesso non posseduto dal chiamante è disabilitato', () => {
    renderWithProviders(<Controlled caller={['pages:create']} />);
    expect(screen.getByRole('checkbox', { name: 'Creare una Pagina' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Caricare Media' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Seleziona tutti: Media' })).toBeDisabled();
  });

  it('"Seleziona tutti: Utenti" seleziona 5 codici e aggiorna il contatore', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Seleziona tutti: Utenti' }));

    const selected = onChange.mock.lastCall?.[0] as string[];
    expect(selected).toHaveLength(5);
    expect(selected).not.toContain('roles:manage');
    expect(screen.getByTestId('permission-count')).toHaveTextContent('5 permessi selezionati');
    expect(screen.getByRole('checkbox', { name: ROLES_MANAGE })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seleziona tutti: Utenti' })).toBeChecked();
  });

  it('un clic su un permesso lo seleziona e rende indeterminata la categoria', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'Caricare Media' }));

    expect(screen.getByRole('checkbox', { name: 'Caricare Media' })).toBeChecked();
    const media = screen.getByRole('checkbox', { name: 'Seleziona tutti: Media' });
    expect(media).not.toBeChecked();
    expect(media).toHaveAttribute('data-indeterminate', 'true');
  });

  it('in sola lettura tutte le checkbox sono disabilitate e riflettono il valore', () => {
    renderWithProviders(<Controlled readOnly initial={['pages:create']} />);
    const boxes = screen.getAllByRole('checkbox');
    boxes.forEach((box) => expect(box).toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'Creare una Pagina' })).toBeChecked();
    expect(within(document.body).queryByTestId('locked-roles:manage')).not.toBeInTheDocument();
  });
});

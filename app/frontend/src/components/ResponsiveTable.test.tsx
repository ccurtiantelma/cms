/**
 * Test unitari di `ResponsiveTable`: rendering tabella desktop, invocazione
 * delle azioni, fallback "card mode" su viewport ridotte e gestione del caso
 * dati vuoti con placeholder. Il breakpoint è pilotato sovrascrivendo
 * `window.matchMedia` (di default lo stub di setup riporta `matches: false`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconTrash } from '@tabler/icons-react';
import ResponsiveTable, { type ResponsiveTableColumn } from './ResponsiveTable';
import { renderWithProviders } from '../test/utils';

interface Row {
  guid: string;
  name: string;
  city: string | null;
}

const COLUMNS: ResponsiveTableColumn<Row>[] = [
  { key: 'name', label: 'Nome' },
  { key: 'city', label: 'Comune' },
];

const DATA: Row[] = [
  { guid: 'g1', name: 'Rossi', city: 'Varese' },
  { guid: 'g2', name: 'Bianchi', city: null },
];

/** Forza il risultato di `matchMedia` per simulare desktop/mobile. */
function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  setMatchMedia(false); // default: desktop
});

describe('ResponsiveTable', () => {
  it('rende header e righe in modalità tabella (desktop)', () => {
    renderWithProviders(<ResponsiveTable<Row> columns={COLUMNS} data={DATA} />);

    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument();
    expect(screen.getByText('Rossi')).toBeInTheDocument();
    expect(screen.getByText('Bianchi')).toBeInTheDocument();
    // Valore nullo → fallback "—".
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('mostra il placeholder quando non ci sono dati', () => {
    renderWithProviders(<ResponsiveTable<Row> columns={COLUMNS} data={[]} />);

    expect(screen.getByText('Nessun dato disponibile')).toBeInTheDocument();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });

  it('rispetta un placeholder personalizzato', () => {
    renderWithProviders(<ResponsiveTable<Row> columns={COLUMNS} data={[]} emptyText="Vuoto" />);

    expect(screen.getByText('Vuoto')).toBeInTheDocument();
  });

  it('mostra il loader e nasconde i dati quando loading è true', () => {
    renderWithProviders(<ResponsiveTable<Row> columns={COLUMNS} data={DATA} loading />);

    expect(screen.queryByText('Rossi')).not.toBeInTheDocument();
    expect(screen.queryByText('Nessun dato disponibile')).not.toBeInTheDocument();
  });

  it('invoca onClick dell azione con la riga corrispondente', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <ResponsiveTable<Row>
        columns={COLUMNS}
        data={DATA}
        rowKey={(row) => row.guid}
        actions={[{ label: 'Elimina', color: 'red', icon: <IconTrash size={16} />, onClick }]}
      />,
    );

    await user.click(screen.getAllByLabelText('Elimina')[1]);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(DATA[1]);
  });

  it('header ordinabile: notifica onSortChange e NON riordina i dati (sort controllato)', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderWithProviders(
      <ResponsiveTable<Row>
        columns={COLUMNS}
        data={DATA}
        sortable={['name']}
        onSortChange={onSortChange}
      />,
    );

    // L'ordine reso rispecchia `data` così com'è (il riordino è server-side).
    const rows = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(rows[0]).toContain('Rossi');
    expect(rows[1]).toContain('Bianchi');

    await user.click(screen.getByRole('button', { name: /Nome/ }));
    expect(onSortChange).toHaveBeenCalledWith('name');
  });

  it('header non cliccabile senza onSortChange anche se la colonna è sortable', () => {
    renderWithProviders(<ResponsiveTable<Row> columns={COLUMNS} data={DATA} sortable={['name']} />);

    expect(screen.queryByRole('button', { name: /Nome/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument();
  });

  it('rende una card per riga in modalità mobile', () => {
    setMatchMedia(true);
    renderWithProviders(
      <ResponsiveTable<Row>
        columns={COLUMNS}
        data={DATA}
        rowKey={(row) => row.guid}
        actions={[{ label: 'Elimina', icon: <IconTrash size={16} />, onClick: vi.fn() }]}
      />,
    );

    // Nessuna tabella in card mode.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Le label di colonna compaiono come etichette ripetute per ogni card.
    expect(screen.getAllByText('Nome')).toHaveLength(2);
    expect(screen.getByText('Rossi')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Elimina')).toHaveLength(2);
  });
});

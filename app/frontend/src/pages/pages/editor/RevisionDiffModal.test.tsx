/**
 * Component test della modal di confronto Revisioni (F07-02). Service mockato al confine
 * di rete (`services/pages.service`), stesso pattern di `CreateTranslationModal.test.tsx`.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import type { PageRevisionDiff, PageRevisionSummary } from '../../../types/pages.types';

const fetchPageRevisionDiff = vi.fn();
const notificationsShow = vi.fn();

vi.mock('../../../services/pages.service', () => ({
  fetchPageRevisionDiff: (guid: string, revA: string, revB: string) =>
    fetchPageRevisionDiff(guid, revA, revB),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (payload: unknown) => notificationsShow(payload) },
}));

const { default: RevisionDiffModal } = await import('./RevisionDiffModal');

const REVISIONS: PageRevisionSummary[] = [
  {
    guid: 'rev1guid00000001',
    revisionNumber: 1,
    title: 'Prima versione',
    slug: 'chi-siamo',
    createdAt: '2026-08-20T10:00:00.000Z',
    authorName: 'Mario Rossi',
  },
  {
    guid: 'rev2guid00000002',
    revisionNumber: 2,
    title: 'Seconda versione',
    slug: 'chi-siamo',
    createdAt: '2026-08-25T10:00:00.000Z',
    authorName: 'Mario Rossi',
  },
];

function renderModal(overrides: Partial<{ opened: boolean }> = {}) {
  return renderWithProviders(
    <RevisionDiffModal
      opened={overrides.opened ?? true}
      onClose={vi.fn()}
      pageGuid="pageguid00000001"
      revisions={REVISIONS}
    />,
  );
}

/** Seleziona Revisione A e B tramite i due `Select` Mantine, per label. */
async function selectRevisions(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const selectA = screen.getByRole('textbox', { name: 'Revisione A' });
  await user.click(selectA);
  const listboxA = await screen.findByRole('listbox');
  await user.click(within(listboxA).getByText(/Prima versione/));

  const selectB = screen.getByRole('textbox', { name: 'Revisione B' });
  await user.click(selectB);
  const listboxB = await screen.findByRole('listbox');
  await user.click(within(listboxB).getByText(/Seconda versione/));
}

describe('RevisionDiffModal — richiesta di confronto', () => {
  it('chiama il service con pageGuid, revA e revB esatti', async () => {
    fetchPageRevisionDiff.mockResolvedValue({
      added: [],
      removed: [],
      modified: {},
      unchanged: [],
    } satisfies PageRevisionDiff);
    renderModal();
    const user = userEvent.setup();

    await selectRevisions(user);
    await user.click(screen.getByRole('button', { name: 'Confronta' }));

    await waitFor(() =>
      expect(fetchPageRevisionDiff).toHaveBeenCalledWith(
        'pageguid00000001',
        'rev1guid00000001',
        'rev2guid00000002',
      ),
    );
  });
});

describe('RevisionDiffModal — risultato popolato', () => {
  it('mostra badge aggiunti/rimossi e tabella proprietà per i nodi modificati', async () => {
    fetchPageRevisionDiff.mockResolvedValue({
      added: ['node-added-1'],
      removed: ['node-removed-1'],
      modified: {
        'node-modified-1': [
          {
            field: 'props.styleTextColor',
            // `before`/`after` sono `unknown` a runtime (vedi `PropertyDiff`, backend);
            // lo schema generato li tipizza come `Record<string, unknown>` per un limite
            // di `@nestjs/swagger` — qui si simula il caso reale (valore scalare).
            before: '#000000' as unknown as Record<string, unknown>,
            after: '#ffffff' as unknown as Record<string, unknown>,
          },
        ],
      },
      unchanged: ['node-unchanged-1'],
    } satisfies PageRevisionDiff);
    renderModal();
    const user = userEvent.setup();

    await selectRevisions(user);
    await user.click(screen.getByRole('button', { name: 'Confronta' }));

    const addedBadge = (await screen.findByTitle('node-added-1')) as HTMLElement;
    expect(addedBadge).toHaveStyle({ borderColor: '#2e7d32' });

    const removedBadge = screen.getByTitle('node-removed-1') as HTMLElement;
    expect(removedBadge).toHaveStyle({ borderColor: '#c62828' });

    expect(screen.getByText('node-modified-1')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Proprietà')).toBeInTheDocument();
    expect(within(table).getByText('Valore Precedente')).toBeInTheDocument();
    expect(within(table).getByText('Nuovo Valore')).toBeInTheDocument();
    expect(within(table).getByText('props.styleTextColor')).toBeInTheDocument();
    expect(within(table).getByText('#000000')).toBeInTheDocument();
    expect(within(table).getByText('#ffffff')).toBeInTheDocument();
  });
});

describe('RevisionDiffModal — ripristino diretto', () => {
  it('disabilita i pulsanti di ripristino finché non c\'è selezione', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Ripristina Revisione A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ripristina Revisione B' })).toBeDisabled();
  });

  it('invoca onRestore con la PageRevisionSummary corrispondente alla selezione', async () => {
    const onRestore = vi.fn();
    renderWithProviders(
      <RevisionDiffModal
        opened
        onClose={vi.fn()}
        pageGuid="pageguid00000001"
        revisions={REVISIONS}
        onRestore={onRestore}
      />,
    );
    const user = userEvent.setup();

    await selectRevisions(user);

    const buttonA = screen.getByRole('button', { name: 'Ripristina Revisione A' });
    expect(buttonA).toBeEnabled();
    await user.click(buttonA);
    expect(onRestore).toHaveBeenCalledWith(REVISIONS[0]);

    const buttonB = screen.getByRole('button', { name: 'Ripristina Revisione B' });
    expect(buttonB).toBeEnabled();
    await user.click(buttonB);
    expect(onRestore).toHaveBeenCalledWith(REVISIONS[1]);
  });
});

describe('RevisionDiffModal — nessuna differenza', () => {
  it('mostra un messaggio di nessuna differenza invece delle sezioni', async () => {
    fetchPageRevisionDiff.mockResolvedValue({
      added: [],
      removed: [],
      modified: {},
      unchanged: ['node-1', 'node-2'],
    } satisfies PageRevisionDiff);
    renderModal();
    const user = userEvent.setup();

    await selectRevisions(user);
    await user.click(screen.getByRole('button', { name: 'Confronta' }));

    expect(await screen.findByText(/Nessuna differenza/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

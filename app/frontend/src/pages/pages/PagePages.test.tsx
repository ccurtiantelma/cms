/**
 * Test della tabella Pagine (F01/T7). Il filtro e la colonna "Lingua" sono stati rimossi
 * (multilingua non ancora gestito in questa vista — richiesta esplicita del task): questo
 * file copre solo quanto resta, il badge HOME sulla colonna Titolo. Service mockati al
 * confine di rete (`services/pages.service`); `usePaginatedList` non è mockato — chiama
 * direttamente `fetchPages` mockato.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import type { PageRecord } from '../../types/pages.types';
import { useAuthStore } from '../../hooks/useAuth';
import { AppUserRoles, type AuthUser } from '../../types/common.types';

const fetchPages = vi.fn();

vi.mock('../../services/pages.service', () => ({
  fetchPages: (...args: unknown[]) => fetchPages(...args),
  fetchPageTranslations: vi.fn(),
  fetchPage: vi.fn(),
  createPage: vi.fn(),
  deletePage: vi.fn(),
  issuePagePreviewToken: vi.fn(),
}));

const rebuildStaticSite = vi.fn();

vi.mock('../../services/admin.service', () => ({
  rebuildStaticSite: () => rebuildStaticSite(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

const { default: PagePages } = await import('./PagePages');

function page(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    guid: 'a1b2c3d4e5f6a7b8',
    title: 'Chi siamo',
    slug: 'chi-siamo',
    locale: 'it-IT',
    parentGuid: null,
    translationGroupId: 'group0000000001',
    status: 'draft',
    publishedAt: null,
    scheduledAt: null,
    draftContent: { version: 1, blocks: [] },
    draftSeo: {},
    version: 1,
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}

function renderPagePages() {
  return renderWithProviders(
    <MemoryRouter>
      <PagePages />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PagePages — badge HOME sulla colonna Titolo', () => {
  it('una riga con slug "home" mostra il badge HOME accanto al titolo', async () => {
    fetchPages.mockResolvedValue({
      items: [page({ title: 'Home', slug: 'home' })],
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    renderPagePages();

    const titleCell = await screen.findByText('Home');
    const row = titleCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('HOME')).toBeInTheDocument();
  });

  it('una riga con slug diverso da "home" non mostra il badge HOME', async () => {
    fetchPages.mockResolvedValue({
      items: [page()],
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    renderPagePages();

    const titleCell = await screen.findByText('Chi siamo');
    const row = titleCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText('HOME')).not.toBeInTheDocument();
  });

  it('non mostra il filtro né la colonna "Lingua"', async () => {
    fetchPages.mockResolvedValue({
      items: [page()],
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    renderPagePages();

    await screen.findByText('Chi siamo');
    expect(screen.queryByRole('textbox', { name: 'Filtra per lingua' })).not.toBeInTheDocument();
    expect(screen.queryByText('Lingua')).not.toBeInTheDocument();
  });
});

describe('PagePages — rigenerazione del sito pubblico (funzione di sistema)', () => {
  function signInAs(role: AppUserRoles): void {
    useAuthStore.setState({
      user: {
        id: 1,
        guid: 'u000000000000001',
        name: 'Test',
        email: 'test@cms.test',
        role,
        scopeId: null,
      } satisfies AuthUser,
    });
  }

  beforeEach(() => {
    fetchPages.mockResolvedValue({
      items: [],
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      itemsPerPage: 20,
    });
  });

  it('il SuperAdmin vede il pulsante e avvia la rigenerazione', async () => {
    signInAs(AppUserRoles.SuperAdmin);
    rebuildStaticSite.mockResolvedValue(undefined);
    renderPagePages();

    fireEvent.click(await screen.findByRole('button', { name: 'Rigenera sito pubblico' }));

    await waitFor(() => expect(rebuildStaticSite).toHaveBeenCalledTimes(1));
  });

  it('un Admin non vede il pulsante', async () => {
    signInAs(AppUserRoles.Admin);
    renderPagePages();

    await screen.findByText('Nessuna Pagina trovata');
    expect(
      screen.queryByRole('button', { name: 'Rigenera sito pubblico' }),
    ).not.toBeInTheDocument();
  });
});

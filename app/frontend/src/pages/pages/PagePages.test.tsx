/**
 * Test del filtro lingua e dei badge di traduzione nella tabella Pagine (F05-02).
 * Service mockati al confine di rete (`services/pages.service`,
 * `services/settings.service`); `usePaginatedList` non è mockato — chiama
 * direttamente `fetchPages` mockato, stesso pattern di `CreateTranslationModal.test.tsx`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import type { PageRecord } from '../../types/pages.types';

const fetchPages = vi.fn();
const fetchPageTranslations = vi.fn();
const getMultilingualConfigApi = vi.fn();

vi.mock('../../services/pages.service', () => ({
  fetchPages: (...args: unknown[]) => fetchPages(...args),
  fetchPageTranslations: (...args: unknown[]) => fetchPageTranslations(...args),
  fetchPage: vi.fn(),
  createPage: vi.fn(),
  deletePage: vi.fn(),
  issuePagePreviewToken: vi.fn(),
}));

vi.mock('../../services/settings.service', () => ({
  getMultilingualConfigApi: (...args: unknown[]) => getMultilingualConfigApi(...args),
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
  getMultilingualConfigApi.mockResolvedValue({ active: ['it-IT', 'en-GB'], default: 'it-IT' });
  fetchPageTranslations.mockResolvedValue([]);
});

describe('PagePages — filtro lingua', () => {
  it('propone i Locale attivi letti da app/settings/multilingual, non un elenco statico', async () => {
    fetchPages.mockResolvedValue({
      items: [page()],
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    renderPagePages();

    await waitFor(() => expect(getMultilingualConfigApi).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Filtra per lingua' }));
    expect(await screen.findByRole('option', { name: /en-GB/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tutte le lingue' })).toBeInTheDocument();
  });

  it("selezionare una lingua richiama fetchPages con il filtro 'locale' e riparte da pagina 1", async () => {
    fetchPages.mockResolvedValue({
      items: [page()],
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    renderPagePages();
    await waitFor(() => expect(getMultilingualConfigApi).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox', { name: 'Filtra per lingua' }));
    await user.click(await screen.findByRole('option', { name: /en-GB/ }));

    await waitFor(() =>
      expect(fetchPages).toHaveBeenLastCalledWith(
        expect.objectContaining({ locale: 'en-GB', p: 1 }),
      ),
    );
  });
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
});

describe('PagePages — badge lingua per translationGroupId', () => {
  it('una Pagina senza traduzioni sorelle mostra solo il proprio locale', async () => {
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
    expect(within(row as HTMLElement).getByText(/it-IT/)).toBeInTheDocument();
    expect(fetchPageTranslations).not.toHaveBeenCalled();
  });

  it('un gruppo con più righe visibili mostra un badge per ciascuna lingua sorella', async () => {
    const it = page({ guid: 'it0000000000001', locale: 'it-IT' });
    const en = page({ guid: 'en0000000000001', locale: 'en-GB', title: 'About us', slug: 'about-us' });
    fetchPages.mockResolvedValue({
      items: [it, en],
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      itemsPerPage: 20,
    });
    fetchPageTranslations.mockImplementation((guid: string) =>
      Promise.resolve(
        guid === it.guid
          ? [{ guid: en.guid, locale: 'en-GB', title: 'About us', status: 'draft' }]
          : [{ guid: it.guid, locale: 'it-IT', title: 'Chi siamo', status: 'draft' }],
      ),
    );
    renderPagePages();

    const row = (await screen.findByText('Chi siamo')).closest('tr');
    expect(row).not.toBeNull();
    await waitFor(() => {
      expect(within(row as HTMLElement).getByText(/it-IT/)).toBeInTheDocument();
      expect(within(row as HTMLElement).getByText(/en-GB/)).toBeInTheDocument();
    });
  });
});

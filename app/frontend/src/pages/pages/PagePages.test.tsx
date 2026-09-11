/**
 * Test della tabella Pagine (F01/T7). Il filtro e la colonna "Lingua" sono stati rimossi
 * (multilingua non ancora gestito in questa vista — richiesta esplicita del task): questo
 * file copre solo quanto resta, il badge HOME sulla colonna Titolo. Service mockati al
 * confine di rete (`services/pages.service`); `usePaginatedList` non è mockato — chiama
 * direttamente `fetchPages` mockato.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import type { PageRecord } from '../../types/pages.types';

const fetchPages = vi.fn();

vi.mock('../../services/pages.service', () => ({
  fetchPages: (...args: unknown[]) => fetchPages(...args),
  fetchPageTranslations: vi.fn(),
  fetchPage: vi.fn(),
  createPage: vi.fn(),
  deletePage: vi.fn(),
  issuePagePreviewToken: vi.fn(),
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

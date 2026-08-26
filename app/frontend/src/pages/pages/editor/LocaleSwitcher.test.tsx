/**
 * Component test del Locale Switcher (F05/T6). Service mockati al confine di rete
 * (`services/pages.service`, `services/settings.service`), come `MediaLibraryModal.test.tsx`:
 * questi test difendono cosa lo switcher chiede al server e cosa mostra, non `api.ts`.
 *
 * Tre invarianti hanno un test dedicato:
 * 1. il locale corrente compare disabilitato, mai come link o azione;
 * 2. un locale attivo con già una traduzione nel gruppo diventa un link (`<a href>`, mai un
 *    `onClick` imperativo — la guardia sulle modifiche non salvate intercetta solo gli `<a>`,
 *    vedi commento di testa di `LocaleSwitcher.tsx`);
 * 3. un locale attivo senza traduzione propone "Crea traduzione", mai un link.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../../test/utils';
import type { MultilingualConfig } from '../../../services/settings.service';
import type { PageRecord, PageTranslationSummary } from '../../../types/pages.types';

const fetchPageTranslations = vi.fn<(guid: string) => Promise<PageTranslationSummary[]>>();
const createPageTranslation = vi.fn();
const getMultilingualConfigApi = vi.fn<() => Promise<MultilingualConfig>>();
const notificationsShow = vi.fn();

vi.mock('../../../services/pages.service', () => ({
  fetchPageTranslations: (guid: string) => fetchPageTranslations(guid),
  createPageTranslation: (guid: string, payload: unknown) => createPageTranslation(guid, payload),
}));

vi.mock('../../../services/settings.service', () => ({
  getMultilingualConfigApi: () => getMultilingualConfigApi(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (payload: unknown) => notificationsShow(payload) },
}));

const { default: LocaleSwitcher } = await import('./LocaleSwitcher');

/** `PageRecord` di comodo, con i campi obbligatori valorizzati salvo indicazione contraria. */
function pageRecord(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    guid: 'a1b2c3d4e5f6a7b8',
    title: 'Chi siamo',
    slug: 'chi-siamo',
    locale: 'it-IT',
    parentGuid: null,
    translationGroupId: 'f6a7b8a1b2c3d4e5',
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

function renderSwitcher(page: PageRecord = pageRecord()) {
  return renderWithProviders(
    <MemoryRouter>
      <LocaleSwitcher page={page} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMultilingualConfigApi.mockResolvedValue({
    active: ['it-IT', 'en-GB', 'fr-FR'],
    default: 'it-IT',
  });
  fetchPageTranslations.mockResolvedValue([
    { guid: 'a1b2c3d4e5f6a7b8', locale: 'it-IT', title: 'Chi siamo', status: 'draft' },
  ]);
});

async function openMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /it-IT/ }));
}

describe('LocaleSwitcher — elenco', () => {
  it('non chiama il server finché il locale attivo non è ancora noto, poi mostra il locale corrente disabilitato', async () => {
    renderSwitcher();
    await waitFor(() => expect(getMultilingualConfigApi).toHaveBeenCalled());
    expect(fetchPageTranslations).toHaveBeenCalledWith('a1b2c3d4e5f6a7b8');

    await openMenu();
    const currentItem = await screen.findByText(/it-IT · pagina corrente/);
    expect(currentItem.closest('[role="menuitem"]')).toBeDisabled();
  });

  it('mostra un link verso la traduzione già esistente in un locale attivo', async () => {
    fetchPageTranslations.mockResolvedValue([
      { guid: 'a1b2c3d4e5f6a7b8', locale: 'it-IT', title: 'Chi siamo', status: 'draft' },
      { guid: 'b2b2c3d4e5f6a7b8', locale: 'en-GB', title: 'About us', status: 'published' },
    ]);
    renderSwitcher();

    await openMenu();
    const link = await screen.findByRole('menuitem', { name: /en-GB — About us/ });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/pages/b2b2c3d4e5f6a7b8');
    expect(within(link).getByText('Pubblicata')).toBeInTheDocument();
  });

  it('propone "Crea traduzione" per un locale attivo senza traduzione nel gruppo', async () => {
    renderSwitcher();

    await openMenu();
    const createItem = await screen.findByRole('menuitem', { name: /fr-FR/ });
    expect(createItem.tagName).not.toBe('A');
    expect(within(createItem).getByText('Crea traduzione')).toBeInTheDocument();
  });

  it('segnala con una notifica rossa un errore nel caricamento dei Locale attivi', async () => {
    getMultilingualConfigApi.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Errore registro Locale' } },
    });
    renderSwitcher();

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red', message: 'Errore registro Locale' }),
      ),
    );
  });
});

describe('LocaleSwitcher — creazione traduzione', () => {
  it('apre la modale di creazione al click su un locale senza traduzione e invia il payload atteso', async () => {
    createPageTranslation.mockResolvedValue({
      ...pageRecord({ guid: 'c3c3c3c3c3c3c3c3', locale: 'fr-FR', title: 'Chi siamo' }),
    });
    renderSwitcher();
    const user = userEvent.setup();

    await openMenu();
    const createItem = await screen.findByRole('menuitem', { name: /fr-FR/ });
    await user.click(createItem);

    expect(await screen.findByRole('dialog', { name: 'Crea traduzione' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(createPageTranslation).toHaveBeenCalledWith('a1b2c3d4e5f6a7b8', {
        locale: 'fr-FR',
        title: 'Chi siamo',
      }),
    );
  });
});

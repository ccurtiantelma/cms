/**
 * Test dei controlli di cambio stato (F12-02 — Workflow Editoriale & RBAC UI):
 * visibilità delle transizioni nella tendina di stato in base al ruolo
 * (`visibleTransitionsForRole`) e invocazione di `changePageStatus`.
 *
 * I componenti pesanti montati sempre (`Tabs` di Mantine tiene tutti i pannelli montati,
 * non solo quello attivo — vedi commento in `PagePageDetail.tsx`) sono sostituiti da stub:
 * `BlockEditorPanel`/`RevisionDiffModal`/`SeoSerpPreview`/`SeoSocialPreview`/
 * `SeoJsonLdInspector` non sono nello scope di questo test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/utils';
import type { AuthUser } from '../../types/common.types';
import { AppUserRoles } from '../../types/common.types';
import type { PageRecord } from '../../types/pages.types';

const fetchPage = vi.fn();
const changePageStatus = vi.fn();
const updatePage = vi.fn();
const fetchPageRevisions = vi.fn();
const getPageRevision = vi.fn();
const restorePageRevision = vi.fn();
const issuePagePreviewToken = vi.fn();

vi.mock('../../services/pages.service', () => ({
  fetchPage: (...args: unknown[]) => fetchPage(...args),
  changePageStatus: (...args: unknown[]) => changePageStatus(...args),
  updatePage: (...args: unknown[]) => updatePage(...args),
  fetchPageRevisions: (...args: unknown[]) => fetchPageRevisions(...args),
  getPageRevision: (...args: unknown[]) => getPageRevision(...args),
  restorePageRevision: (...args: unknown[]) => restorePageRevision(...args),
  issuePagePreviewToken: (...args: unknown[]) => issuePagePreviewToken(...args),
  fetchPageTranslations: vi.fn().mockResolvedValue([]),
  createPage: vi.fn(),
  deletePage: vi.fn(),
}));

let mockAuthUser: AuthUser | null = null;
vi.mock('../../hooks/useAuth', () => ({
  useAuthStore: (selector: (state: { user: AuthUser | null }) => unknown) =>
    selector({ user: mockAuthUser }),
}));

vi.mock('./editor/BlockEditorPanel', () => ({ default: () => null }));
vi.mock('./editor/RevisionDiffModal', () => ({ default: () => null }));
vi.mock('./editor/SeoSerpPreview', () => ({ default: () => null }));
vi.mock('./editor/SeoSocialPreview', () => ({ default: () => null }));
vi.mock('./editor/SeoJsonLdInspector', () => ({ default: () => null }));

const notificationsShow = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => notificationsShow(...args) },
}));

const { default: PagePageDetail } = await import('./PagePageDetail');

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

function authUser(role: AppUserRoles): AuthUser {
  return {
    id: 1,
    guid: 'u1b2c3d4e5f6a7b8',
    name: 'Test',
    email: 'test@example.com',
    role,
    scopeId: null,
  };
}

function renderDetail() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/pages/a1b2c3d4e5f6a7b8']}>
      <Routes>
        <Route path="/pages/:guid" element={<PagePageDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Apre la tendina di stato nell'intestazione e ne restituisce il menu. */
async function openStatusMenu(statusLabel: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: statusLabel }));
  return screen.findByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = null;
  fetchPageRevisions.mockResolvedValue({
    items: [],
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 20,
  });
});

describe('PagePageDetail — visibilità delle transizioni di stato per ruolo', () => {
  it('uno User su una bozza vede solo "Invia in revisione", non pubblicazione/programmazione', async () => {
    mockAuthUser = authUser(AppUserRoles.User);
    fetchPage.mockResolvedValue(page({ status: 'draft' }));
    renderDetail();

    const menu = await openStatusMenu('Bozza');
    expect(within(menu).getByRole('menuitem', { name: 'Invia in revisione' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Pubblica' })).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Programma pubblicazione' }),
    ).not.toBeInTheDocument();
  });

  it('un Manager sulla stessa bozza vede tutte le transizioni ammesse', async () => {
    mockAuthUser = authUser(AppUserRoles.Manager);
    fetchPage.mockResolvedValue(page({ status: 'draft' }));
    renderDetail();

    const menu = await openStatusMenu('Bozza');
    expect(within(menu).getByRole('menuitem', { name: 'Invia in revisione' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Pubblica' })).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Programma pubblicazione' }),
    ).toBeInTheDocument();
  });

  it('uno User su una Pagina archiviata (nessuna transizione consentita) trova la tendina disabilitata', async () => {
    mockAuthUser = authUser(AppUserRoles.User);
    fetchPage.mockResolvedValue(page({ status: 'archived' }));
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Archiviata' })).toBeDisabled();
  });
});

describe('PagePageDetail — invocazione del cambio di stato', () => {
  it('invia in revisione richiama changePageStatus con lo stato di destinazione', async () => {
    mockAuthUser = authUser(AppUserRoles.User);
    fetchPage.mockResolvedValue(page({ status: 'draft' }));
    changePageStatus.mockResolvedValue(page({ status: 'review' }));
    renderDetail();

    const menu = await openStatusMenu('Bozza');
    const user = userEvent.setup();
    await user.click(within(menu).getByRole('menuitem', { name: 'Invia in revisione' }));

    const dialog = await screen.findByRole('dialog', { name: 'Conferma cambio di stato' });
    await user.click(within(dialog).getByRole('button', { name: 'Invia in revisione' }));

    await waitFor(() =>
      expect(changePageStatus).toHaveBeenCalledWith('a1b2c3d4e5f6a7b8', {
        status: 'review',
        scheduledAt: undefined,
      }),
    );
  });

  it('un 403 dal server mostra una notifica chiara e ricarica la Pagina', async () => {
    mockAuthUser = authUser(AppUserRoles.Manager);
    fetchPage.mockResolvedValue(page({ status: 'draft' }));
    changePageStatus.mockRejectedValue({ response: { status: 403, data: {} } });
    renderDetail();

    const menu = await openStatusMenu('Bozza');
    const user = userEvent.setup();
    await user.click(within(menu).getByRole('menuitem', { name: 'Pubblica' }));

    const dialog = await screen.findByRole('dialog', { name: 'Conferma cambio di stato' });
    await user.click(within(dialog).getByRole('button', { name: 'Pubblica' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          title: 'Operazione non consentita',
        }),
      ),
    );
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
  });
});

describe('PagePageDetail — scheda Metadati, slug "home" (ADR-24 § 7)', () => {
  it('su una Pagina con slug diverso da "home" mostra il pulsante "Imposta come Home Page", che al click imposta lo slug e disabilita l\'input', async () => {
    mockAuthUser = authUser(AppUserRoles.Manager);
    fetchPage.mockResolvedValue(page({ slug: 'chi-siamo', parentGuid: 'p1b2c3d4e5f6a7b8' }));
    renderDetail();

    await screen.findByRole('button', { name: 'Bozza' });

    const slugInput = await screen.findByLabelText('Slug', { exact: false });
    expect(slugInput).toHaveValue('chi-siamo');
    expect(slugInput).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Imposta come Home Page' })).toBeInTheDocument();
    expect(screen.queryByText('Home Page (Radice)')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Imposta come Home Page' }));

    const updatedSlugInput = await screen.findByLabelText('Slug', { exact: false });
    expect(updatedSlugInput).toHaveValue('/');
    expect(updatedSlugInput).toBeDisabled();
    expect(screen.getByText('Home Page (Radice)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Imposta come Home Page' }),
    ).not.toBeInTheDocument();
  });

  it('su una Pagina con slug "home" mostra l\'input disabilitato con "/" e il badge, senza il pulsante', async () => {
    mockAuthUser = authUser(AppUserRoles.Manager);
    fetchPage.mockResolvedValue(page({ slug: 'home', parentGuid: null }));
    renderDetail();

    await screen.findByRole('button', { name: 'Bozza' });

    const slugInput = await screen.findByLabelText('Slug', { exact: false });
    expect(slugInput).toHaveValue('/');
    expect(slugInput).toBeDisabled();
    expect(screen.getByText('Home Page (Radice)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Imposta come Home Page' }),
    ).not.toBeInTheDocument();
  });
});

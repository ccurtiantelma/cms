/**
 * Component test della modal di creazione traduzione (F05/T6). Service mockato al confine di
 * rete (`services/pages.service`), notifiche mockate per ispezionarne il contenuto.
 *
 * Tre comportamenti non ovvi hanno un test dedicato:
 * 1. redirect automatico (`navigate`) solo quando l'albero dell'editor è pulito — con
 *    modifiche non salvate si resta sulla pagina corrente (mai overwrite silenzioso);
 * 2. un `409` (corsa fra due editor) produce un messaggio esplicito, non generico;
 * 3. il titolo riparte sempre da quello della Pagina sorgente ad ogni apertura.
 */
import type { ComponentProps } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../../test/utils';
import type { PageRecord } from '../../../types/pages.types';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';

const createPageTranslation = vi.fn();
const notificationsShow = vi.fn();

vi.mock('../../../services/pages.service', () => ({
  createPageTranslation: (guid: string, payload: unknown) => createPageTranslation(guid, payload),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (payload: unknown) => notificationsShow(payload) },
}));

const { default: CreateTranslationModal } = await import('./CreateTranslationModal');

function sourcePage(overrides: Partial<PageRecord> = {}): PageRecord {
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

/** Echeggia il pathname corrente, per verificare un redirect senza montare le rotte vere. */
function LocationEcho(): JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderModal(props: Partial<ComponentProps<typeof CreateTranslationModal>> = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/pages/a1b2c3d4e5f6a7b8?tab=content']}>
      <CreateTranslationModal
        opened
        onClose={vi.fn()}
        sourcePage={sourcePage()}
        locale="en-GB"
        onCreated={vi.fn()}
        {...props}
      />
      <Routes>
        <Route path="*" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CLEAN_SAVE_POINT = { depth: 0, top: null };

beforeEach(() => {
  vi.clearAllMocks();
  // Store pulito ad ogni test: nessuna modifica non salvata residua da un test precedente.
  useBlockEditorStore.setState({ undoStack: [], redoStack: [], savePoint: CLEAN_SAVE_POINT });
});

describe('CreateTranslationModal — form', () => {
  it('precompila il titolo con quello della Pagina sorgente', () => {
    renderModal();
    expect(screen.getByLabelText(/Titolo della traduzione/)).toHaveValue('Chi siamo');
  });

  it('disabilita la conferma se il titolo viene svuotato', async () => {
    renderModal();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Titolo della traduzione/);
    await user.clear(input);
    expect(screen.getByRole('button', { name: 'Crea traduzione' })).toBeDisabled();
  });
});

describe('CreateTranslationModal — creazione riuscita', () => {
  it('reindirizza subito alla nuova traduzione quando non ci sono modifiche non salvate', async () => {
    createPageTranslation.mockResolvedValue(
      sourcePage({ guid: 'newguid00000001', locale: 'en-GB' }),
    );
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderModal({ onCreated, onClose });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(createPageTranslation).toHaveBeenCalledWith('a1b2c3d4e5f6a7b8', {
        locale: 'en-GB',
        title: 'Chi siamo',
      }),
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/pages/newguid00000001?tab=content',
      ),
    );
    expect(notificationsShow).not.toHaveBeenCalled();
  });

  it("non reindirizza e mostra una notifica persistente quando l'editor ha modifiche non salvate", async () => {
    useBlockEditorStore.setState({
      undoStack: [{ kind: 'tree', apply: (tree: BlockNode[]) => tree, invert: (tree: BlockNode[]) => tree }],
      savePoint: CLEAN_SAVE_POINT,
    });
    createPageTranslation.mockResolvedValue(
      sourcePage({ guid: 'newguid00000002', locale: 'en-GB' }),
    );
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'green', autoClose: false }),
      ),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/pages/a1b2c3d4e5f6a7b8');
  });
});

describe('CreateTranslationModal — errori', () => {
  it('mostra un messaggio esplicito su 409 (traduzione già esistente) e resta aperta', async () => {
    createPageTranslation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: 'conflict' } },
    });
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'orange',
          message: expect.stringContaining('Esiste già una traduzione'),
        }),
      ),
    );
    expect(screen.getByLabelText(/Titolo della traduzione/)).toBeInTheDocument();
  });

  it('mostra un messaggio generico sugli altri errori', async () => {
    createPageTranslation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: 'Locale non attivo' } },
    });
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red', message: 'Locale non attivo' }),
      ),
    );
  });
});

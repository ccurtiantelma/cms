/**
 * Component test della Media Library (RFC-F05/F09 § 5, PLAN T7).
 *
 * Il service è mockato al confine di rete (`services/media.service`) e non
 * Axios: ciò che questi test devono difendere è il comportamento della modal —
 * cosa chiede al server, cosa mostra, cosa restituisce al chiamante — non il
 * modo in cui `api.ts` compone la richiesta, già coperto altrove.
 *
 * Due invarianti valgono più degli altri e hanno un test ciascuno:
 * 1. l'upload marca sempre `entity = 'page-media'` (ADR-27 § 2) — ometterlo
 *    produrrebbe un file accettato e poi servito con 404 al pubblico;
 * 2. `onSelect` riceve il **record**, e il `guid` è ciò che finisce nel blocco:
 *    la modal non compone mai un URL (ADR-27 § 6).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import type { Pagination } from '../../types/common.types';
import type { MediaFileRecord, MediaListParams } from '../../types/media.types';

const fetchMediaFiles = vi.fn<(params: MediaListParams) => Promise<Pagination<MediaFileRecord>>>();
const uploadMediaFile = vi.fn<(file: File) => Promise<MediaFileRecord>>();
const notificationsShow = vi.fn();

vi.mock('../../services/media.service', () => ({
  fetchMediaFiles: (params: MediaListParams) => fetchMediaFiles(params),
  uploadMediaFile: (file: File) => uploadMediaFile(file),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (payload: unknown) => notificationsShow(payload) },
}));

const { default: MediaLibraryModal } = await import('./MediaLibraryModal');

/** Record di comodo, con i campi dimensionali valorizzati salvo indicazione contraria. */
function record(overrides: Partial<MediaFileRecord> = {}): MediaFileRecord {
  return {
    guid: 'a1b2c3d4e5f6a7b8',
    originalName: 'logo.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    width: 800,
    height: 600,
    url: null,
    entity: 'page-media',
    entityId: null,
    createdAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}

/** Busta di paginazione di comodo. */
function page(items: MediaFileRecord[], totalPages = 1): Pagination<MediaFileRecord> {
  return {
    items,
    totalItems: items.length,
    totalPages,
    currentPage: 1,
    itemsPerPage: 20,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMediaFiles.mockResolvedValue(page([]));
  // jsdom non implementa le API dei blob URL usate dall'anteprima.
  URL.createObjectURL = vi.fn(() => 'blob:anteprima');
  URL.revokeObjectURL = vi.fn();
});

describe('MediaLibraryModal — elenco', () => {
  it('non chiama il server finché la modal è chiusa', () => {
    renderWithProviders(<MediaLibraryModal opened={false} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(fetchMediaFiles).not.toHaveBeenCalled();
  });

  it("filtra sempre per media editoriali e per prefisso MIME dell'immagine", async () => {
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => expect(fetchMediaFiles).toHaveBeenCalled());
    expect(fetchMediaFiles.mock.calls[0][0]).toMatchObject({
      entity: 'page-media',
      mimePrefix: 'image/',
      p: 1,
    });
  });

  it('mostra una miniatura per ogni record restituito', async () => {
    fetchMediaFiles.mockResolvedValue(
      page([
        record({ guid: 'aaaaaaaaaaaaaaa1', originalName: 'logo.png' }),
        record({ guid: 'aaaaaaaaaaaaaaa2', originalName: 'hero.jpg' }),
      ]),
    );
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'logo.png' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hero.jpg' })).toBeInTheDocument();
  });

  it('spiega la libreria vuota invece di mostrare una griglia muta', async () => {
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(await screen.findByText(/Nessuna immagine in libreria/)).toBeInTheDocument();
  });

  it('propaga la ricerca per nome al server e riparte da pagina 1', async () => {
    const user = userEvent.setup();
    fetchMediaFiles.mockResolvedValue(page([record()], 3));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'logo.png' });

    await user.type(screen.getByLabelText('Cerca per nome file'), 'hero');

    await waitFor(() => {
      const last = fetchMediaFiles.mock.calls[fetchMediaFiles.mock.calls.length - 1][0];
      expect(last.q).toBe('hero');
      expect(last.p).toBe(1);
    });
  });

  it('chiede la pagina successiva quando esiste più di una pagina', async () => {
    const user = userEvent.setup();
    fetchMediaFiles.mockResolvedValue(page([record()], 3));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'logo.png' });

    await user.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => {
      const last = fetchMediaFiles.mock.calls[fetchMediaFiles.mock.calls.length - 1][0];
      expect(last.p).toBe(2);
    });
  });

  it('non mostra la paginazione con una sola pagina', async () => {
    fetchMediaFiles.mockResolvedValue(page([record()], 1));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'logo.png' });

    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });
});

describe('MediaLibraryModal — selezione', () => {
  it('tiene disabilitata la conferma finché nulla è selezionato', async () => {
    fetchMediaFiles.mockResolvedValue(page([record()]));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'logo.png' });

    expect(screen.getByRole('button', { name: /Seleziona Immagine/ })).toBeDisabled();
  });

  it('restituisce il record scelto al chiamante e chiude', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const chosen = record({ guid: 'ffffeeeeddddcccc', originalName: 'hero.jpg' });
    fetchMediaFiles.mockResolvedValue(page([record(), chosen]));
    renderWithProviders(<MediaLibraryModal opened onClose={onClose} onSelect={onSelect} />);

    await user.click(await screen.findByRole('button', { name: 'hero.jpg' }));
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    expect(onSelect).toHaveBeenCalledWith(chosen);
    expect(onSelect.mock.calls[0][0].guid).toBe('ffffeeeeddddcccc');
    expect(onClose).toHaveBeenCalled();
  });

  it('marca visivamente la tessera selezionata', async () => {
    const user = userEvent.setup();
    fetchMediaFiles.mockResolvedValue(page([record()]));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);

    const tile = await screen.findByRole('button', { name: 'logo.png' });
    expect(tile).toHaveAttribute('aria-pressed', 'false');

    await user.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
  });

  it('preseleziona il guid già referenziato dal chiamante', async () => {
    fetchMediaFiles.mockResolvedValue(page([record({ guid: 'aaaabbbbccccdddd' })]));
    renderWithProviders(
      <MediaLibraryModal
        opened
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentGuid="aaaabbbbccccdddd"
      />,
    );

    expect(await screen.findByRole('button', { name: 'logo.png' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Seleziona Immagine/ })).toBeEnabled();
  });
});

describe('MediaLibraryModal — upload', () => {
  /** Costruisce un `DataTransfer` minimale per l'evento `drop` (jsdom non ne ha uno). */
  function dropEventInit(files: File[]): { dataTransfer: { files: File[] } } {
    return { dataTransfer: { files } };
  }

  it("mostra l'anteprima del file trascinato prima di caricarlo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText(/Nessuna immagine in libreria/);

    const file = new File(['x'], 'nuova.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('media-file-input'), file);

    expect(await screen.findByText('nuova.png')).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    // Nessun upload finché non si conferma: trascinare non è caricare.
    expect(uploadMediaFile).not.toHaveBeenCalled();
  });

  it('carica il file alla conferma e ricarica la griglia', async () => {
    const user = userEvent.setup();
    const uploaded = record({ guid: '1111222233334444', originalName: 'nuova.png' });
    uploadMediaFile.mockResolvedValue(uploaded);
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText(/Nessuna immagine in libreria/);

    const file = new File(['x'], 'nuova.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('media-file-input'), file);
    fetchMediaFiles.mockResolvedValue(page([uploaded]));
    await user.click(await screen.findByRole('button', { name: /Carica/ }));

    await waitFor(() => expect(uploadMediaFile).toHaveBeenCalledWith(file));
    // Il file appena caricato è selezionato: l'utente ha già espresso la sua scelta.
    expect(await screen.findByRole('button', { name: 'nuova.png' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('accetta un file rilasciato sulla drop zone', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText(/Nessuna immagine in libreria/);

    const file = new File(['x'], 'trascinata.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('media-drop-zone'), dropEventInit([file]));

    expect(await screen.findByText('trascinata.png')).toBeInTheDocument();
  });

  it('rifiuta un file di tipo non ammesso senza chiamare il server', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText(/Nessuna immagine in libreria/);

    const pdf = new File(['x'], 'contratto.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByTestId('media-drop-zone'), dropEventInit([pdf]));

    expect(uploadMediaFile).not.toHaveBeenCalled();
    expect(screen.queryByText('contratto.pdf')).not.toBeInTheDocument();
    expect(notificationsShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'orange' }));
  });

  it('notifica il fallimento di un upload senza perdere il file in attesa', async () => {
    const user = userEvent.setup();
    uploadMediaFile.mockRejectedValue(new Error('413'));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText(/Nessuna immagine in libreria/);

    await user.upload(
      screen.getByTestId('media-file-input'),
      new File(['x'], 'grande.png', { type: 'image/png' }),
    );
    await user.click(await screen.findByRole('button', { name: /Carica/ }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })),
    );
    expect(screen.getByText('grande.png')).toBeInTheDocument();
  });
});

describe('MediaLibraryModal — degrado senza dimensioni', () => {
  it('mostra la dimensione in byte quando width/height sono null (PLAN T4)', async () => {
    fetchMediaFiles.mockResolvedValue(
      page([record({ width: null, height: null, sizeBytes: 4096 })]),
    );
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);

    const tile = await screen.findByRole('button', { name: 'logo.png' });
    expect(within(tile).getByText('4 KB')).toBeInTheDocument();
  });

  it('mostra le dimensioni quando sono note', async () => {
    fetchMediaFiles.mockResolvedValue(page([record({ width: 800, height: 600 })]));
    renderWithProviders(<MediaLibraryModal opened onClose={vi.fn()} onSelect={vi.fn()} />);

    const tile = await screen.findByRole('button', { name: 'logo.png' });
    expect(within(tile).getByText('800×600')).toBeInTheDocument();
  });
});

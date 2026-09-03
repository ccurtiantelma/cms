/**
 * Component test di `MediaCropperModal` (ADR-49). Il service è mockato al confine di rete
 * (`services/media.service`), stesso principio di `MediaLibraryModal.test.tsx`: questi test
 * difendono cosa la modal chiede al server — non come `api.ts` compone la richiesta.
 *
 * Il punto che conta di più è il payload esatto inviato a `requestImageTransform` alla
 * scelta di un preset: deve portare il preset scelto e il punto focale corrente, mai un
 * crop esplicito (fuori scope di questa UI, RFC-F09-media-transform-pipeline.md § M6).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import type { MediaFileRecord, MediaTransformRequest } from '../../types/media.types';

const fetchMediaMetadata = vi.fn<(guid: string) => Promise<MediaFileRecord>>();
const updateFocalPoint =
  vi.fn<(guid: string, focalX: number, focalY: number) => Promise<MediaFileRecord>>();
const requestImageTransform =
  vi.fn<(guid: string, transform: MediaTransformRequest) => Promise<{ jobId: string }>>();
const notificationsShow = vi.fn();

vi.mock('../../services/media.service', () => ({
  fetchMediaMetadata: (guid: string) => fetchMediaMetadata(guid),
  updateFocalPoint: (guid: string, focalX: number, focalY: number) =>
    updateFocalPoint(guid, focalX, focalY),
  requestImageTransform: (guid: string, transform: MediaTransformRequest) =>
    requestImageTransform(guid, transform),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (payload: unknown) => notificationsShow(payload) },
}));

const { default: MediaCropperModal } = await import('./MediaCropperModal');

const GUID = 'a1b2c3d4e5f6a7b8';

/** Record di comodo, con punto focale non centrato per verificare che venga letto e mostrato. */
function record(overrides: Partial<MediaFileRecord> = {}): MediaFileRecord {
  return {
    guid: GUID,
    originalName: 'banner.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 4096,
    width: 1600,
    height: 900,
    url: null,
    entity: 'page-media',
    entityId: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    focalX: 30,
    focalY: 70,
    ...overrides,
  };
}

beforeEach(() => {
  fetchMediaMetadata.mockReset();
  updateFocalPoint.mockReset();
  requestImageTransform.mockReset();
  notificationsShow.mockReset();
  fetchMediaMetadata.mockResolvedValue(record());
  updateFocalPoint.mockResolvedValue(record());
  requestImageTransform.mockResolvedValue({ jobId: '42' });
});

describe('MediaCropperModal — caricamento metadati', () => {
  it('alla apertura carica i metadati e riflette il punto focale persistito nel picker', async () => {
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    expect(fetchMediaMetadata).toHaveBeenCalledWith(GUID);
    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
  });

  it('un fallimento della fetch mostra un errore, non un crash', async () => {
    fetchMediaMetadata.mockRejectedValueOnce(new Error('rete assente'));
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/Impossibile caricare i metadati/i)).toBeInTheDocument(),
    );
  });
});

describe('MediaCropperModal — generazione variante (ADR-49 § M6)', () => {
  it('il pulsante "Genera Variante" resta disabilitato finché nessun preset è scelto', async () => {
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Genera Variante' })).toBeDisabled();
  });

  it('scegliendo il preset "Card" invia a requestImageTransform il payload con preset e punto focale correnti', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'Card' }));
    await user.click(screen.getByRole('button', { name: 'Genera Variante' }));

    await waitFor(() =>
      expect(requestImageTransform).toHaveBeenCalledWith(GUID, {
        focalX: 30,
        focalY: 70,
        preset: 'card',
      }),
    );
  });

  it('prima di accodare la trasformazione persiste il punto focale corrente', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'Thumbnail' }));
    await user.click(screen.getByRole('button', { name: 'Genera Variante' }));

    await waitFor(() => expect(updateFocalPoint).toHaveBeenCalledWith(GUID, 30, 70));
    expect(requestImageTransform).toHaveBeenCalledWith(GUID, {
      focalX: 30,
      focalY: 70,
      preset: 'thumbnail',
    });
  });

  it("conferma con successo mostra una notifica con l'id del job accodato", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'Hero' }));
    await user.click(screen.getByRole('button', { name: 'Genera Variante' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'green', message: expect.stringContaining('#42') }),
      ),
    );
  });

  it('un fallimento della richiesta mostra una notifica di errore, non un crash silenzioso', async () => {
    requestImageTransform.mockRejectedValueOnce(new Error('500'));
    const user = userEvent.setup();
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'Social OG' }));
    await user.click(screen.getByRole('button', { name: 'Genera Variante' }));

    await waitFor(() =>
      expect(notificationsShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })),
    );
  });
});

describe('MediaCropperModal — chiusura', () => {
  it('"Chiudi" richiama onClose senza inviare alcuna richiesta di trasformazione', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<MediaCropperModal opened guid={GUID} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText('Punto focale: 30% / 70%')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));

    expect(onClose).toHaveBeenCalled();
    expect(requestImageTransform).not.toHaveBeenCalled();
  });
});

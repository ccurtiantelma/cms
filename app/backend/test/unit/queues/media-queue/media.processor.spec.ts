import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import type { Job } from 'bullmq';
import { MediaProcessor } from '../../../../src/queues/media-queue/media.processor';
import { DbService } from '../../../../src/db/db.service';
import { StorageDriver } from '../../../../src/files/storage/storage-driver.interface';
import { MediaTransformPreset } from '../../../../src/files/dto/media-transform.dto';
import type { MediaTransformJobData } from '../../../../src/queues/media-queue/media-queue.service';

jest.mock('sharp', () => jest.fn());
// Stesso `require` diretto usato da `media.processor.ts` (vedi commento lì):
// bypassa l'emit del default-import ESM di TS, altrimenti disallineato dal
// mock Jest sopra.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: jest.Mock = require('sharp');

/** Buffer sentinella restituito da ogni `.toBuffer()` della pipeline mockata. */
const outputBuffer = Buffer.from('output-bytes');

/** Costruisce una pipeline `sharp` chainabile fittizia che risolve sempre `metadata` a `dimensions`. */
function buildChain(dimensions: { width?: number; height?: number }) {
  const chain: Record<string, jest.Mock> = {};
  chain.metadata = jest.fn().mockResolvedValue(dimensions);
  chain.extract = jest.fn().mockReturnValue(chain);
  chain.resize = jest.fn().mockReturnValue(chain);
  chain.webp = jest.fn().mockReturnValue(chain);
  chain.avif = jest.fn().mockReturnValue(chain);
  chain.toBuffer = jest.fn().mockResolvedValue(outputBuffer);
  return chain;
}

describe('MediaProcessor (unit)', () => {
  const sourceBuffer = Buffer.from('source-bytes');
  const sourceRow = {
    id: 1,
    guid: 'source-guid-16ch',
    originalName: 'foto.jpg',
    storageKey: 'source-key',
    entity: 'page-media',
    entityId: null,
    focalX: 50,
    focalY: 50,
  };

  let findFirstMock: jest.Mock;
  let insertValuesMock: jest.Mock;
  let storageDriver: jest.Mocked<StorageDriver>;
  let sourceChain: ReturnType<typeof buildChain>;
  let outputChain: ReturnType<typeof buildChain>;
  let processor: MediaProcessor;

  const buildJob = (transform: Partial<MediaTransformJobData['transform']>) =>
    ({ data: { fileGuid: sourceRow.guid, transform } }) as unknown as Job<MediaTransformJobData>;

  beforeEach(() => {
    findFirstMock = jest.fn().mockResolvedValue(sourceRow);
    insertValuesMock = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([{ guid: 'derived-guid-16ch' }]) });

    const dbService = {
      db: {
        query: { fileEntity: { findFirst: findFirstMock } },
        insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
      },
    } as unknown as DbService;

    storageDriver = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue(Readable.from([sourceBuffer])),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    sourceChain = buildChain({ width: 1000, height: 500 });
    outputChain = buildChain({ width: 800, height: 450 });
    sharp.mockImplementation((buf: Buffer) => (buf === outputBuffer ? outputChain : sourceChain));

    processor = new MediaProcessor(dbService, storageDriver);
  });

  it('applica extract su un crop esplicito entro i limiti e salva la variante webp con parentFileId', async () => {
    const job = buildJob({ cropX: 10, cropY: 20, cropW: 300, cropH: 200 });

    await processor.process(job);

    expect(sourceChain.extract).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    });
    expect(sourceChain.resize).not.toHaveBeenCalled();
    expect(sourceChain.webp).toHaveBeenCalledWith({ quality: 80 });
    expect(sourceChain.avif).toHaveBeenCalledWith({ quality: 60 });
    expect(storageDriver.upload).toHaveBeenCalledWith(
      expect.any(String),
      outputBuffer,
      'image/webp',
    );
    expect(storageDriver.upload).toHaveBeenCalledWith(
      expect.any(String),
      outputBuffer,
      'image/avif',
    );
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/webp',
        parentFileId: sourceRow.id,
        entity: sourceRow.entity,
        entityId: sourceRow.entityId,
        sizeBytes: outputBuffer.length,
      }),
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/avif',
        parentFileId: sourceRow.id,
      }),
    );
  });

  it("rigetta un crop fuori dai limiti dell'immagine sorgente senza scrivere nulla", async () => {
    const job = buildJob({ cropX: 900, cropY: 0, cropW: 300, cropH: 200 });

    await expect(processor.process(job)).rejects.toThrow(BadRequestException);
    expect(storageDriver.upload).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it('rigetta un crop parziale (non tutte e quattro le coordinate)', async () => {
    const job = buildJob({ cropX: 10, cropY: 20 });

    await expect(processor.process(job)).rejects.toThrow(BadRequestException);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it('senza crop, applica un resize centrato sul focal point verso le dimensioni del preset', async () => {
    const job = buildJob({ preset: MediaTransformPreset.Card, focalX: 50, focalY: 50 });

    await processor.process(job);

    expect(sourceChain.extract).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
    expect(sourceChain.resize).toHaveBeenCalledWith(800, 450);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentFileId: sourceRow.id, mimeType: 'image/webp' }),
    );
  });

  it('usa il focal point persistito sulla riga sorgente quando la richiesta non lo specifica', async () => {
    const job = buildJob({ preset: MediaTransformPreset.Thumbnail });

    await processor.process(job);

    // Fonte 1000x500, focal point sorgente 50/50 -> crop centrato, nessun errore.
    expect(sourceChain.extract).toHaveBeenCalled();
    expect(sourceChain.resize).toHaveBeenCalledWith(400, 400);
  });

  it('senza crop e senza preset, rigetta con BadRequestException', async () => {
    const job = buildJob({});

    await expect(processor.process(job)).rejects.toThrow(BadRequestException);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it('lancia un errore se il file sorgente non esiste o non è attivo', async () => {
    findFirstMock.mockResolvedValue(undefined);
    const job = buildJob({ preset: MediaTransformPreset.Card });

    await expect(processor.process(job)).rejects.toThrow(/non trovato/);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

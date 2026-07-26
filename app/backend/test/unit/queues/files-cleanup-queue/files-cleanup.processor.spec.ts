import { FilesCleanupProcessor } from '../../../../src/queues/files-cleanup-queue/files-cleanup.processor';
import { DbService } from '../../../../src/db/db.service';
import { StorageDriver } from '../../../../src/files/storage/storage-driver.interface';

describe('FilesCleanupProcessor (unit)', () => {
  let findManyMock: jest.Mock;
  let storageDriver: jest.Mocked<StorageDriver>;
  let processor: FilesCleanupProcessor;

  const buildRow = (guid: string, storageKey: string) => ({
    guid,
    storageKey,
    isActive: false,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeEach(() => {
    findManyMock = jest.fn();
    storageDriver = {
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const dbService = {
      db: { query: { fileEntity: { findMany: findManyMock } } },
    } as unknown as DbService;

    processor = new FilesCleanupProcessor(dbService, storageDriver);
  });

  it('non chiama il driver se non ci sono blob candidati', async () => {
    findManyMock.mockResolvedValue([]);

    await processor.process();

    expect(storageDriver.delete).not.toHaveBeenCalled();
  });

  it('rimuove il blob fisico per ogni file candidato, senza toccare la riga DB', async () => {
    const rows = [buildRow('guid-1', 'key-1'), buildRow('guid-2', 'key-2')];
    findManyMock.mockResolvedValue(rows);

    await processor.process();

    expect(storageDriver.delete).toHaveBeenCalledWith('key-1');
    expect(storageDriver.delete).toHaveBeenCalledWith('key-2');
    expect(storageDriver.delete).toHaveBeenCalledTimes(2);
  });

  it('continua con i restanti candidati se la rimozione di un blob fallisce', async () => {
    const rows = [buildRow('guid-1', 'key-1'), buildRow('guid-2', 'key-2')];
    findManyMock.mockResolvedValue(rows);
    storageDriver.delete
      .mockRejectedValueOnce(new Error('driver non raggiungibile'))
      .mockResolvedValueOnce(undefined);

    await expect(processor.process()).resolves.toBeUndefined();

    expect(storageDriver.delete).toHaveBeenCalledTimes(2);
  });
});

import * as os from 'os';
import * as path from 'path';
import { readFile, rm } from 'fs/promises';

const mockStorageDir = path.join(os.tmpdir(), `starter-kit-test-storage-${Date.now()}`);

jest.mock('../../../src/common/app-constants', () => ({
  AppConstants: { storageLocalPath: mockStorageDir },
}));

// Import dopo il mock: AppConstants è letta a import-time dal driver.
import { LocalDiskDriver } from '../../../src/files/storage/local-disk.driver';

describe('LocalDiskDriver (unit, filesystem reale su cartella temporanea)', () => {
  let driver: LocalDiskDriver;

  beforeEach(() => {
    driver = new LocalDiskDriver();
  });

  afterAll(async () => {
    await rm(mockStorageDir, { recursive: true, force: true });
  });

  it('scrive e rilegge lo stesso contenuto sotto la key indicata', async () => {
    const key = 'test-key-1';
    const content = Buffer.from('contenuto di prova');

    await driver.upload(key, content);

    const written = await readFile(path.join(mockStorageDir, key));
    expect(written).toEqual(content);

    const stream = await driver.download(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('contenuto di prova');
  });

  it('elimina il file scritto sotto la key indicata', async () => {
    const key = 'test-key-2';
    await driver.upload(key, Buffer.from('da eliminare'));

    await driver.delete(key);

    await expect(readFile(path.join(mockStorageDir, key))).rejects.toThrow();
  });

  it('è idempotente: non lancia se la key non esiste già (ADR-11, retry del job di cleanup)', async () => {
    await expect(driver.delete('key-mai-esistita')).resolves.toBeUndefined();
  });
});

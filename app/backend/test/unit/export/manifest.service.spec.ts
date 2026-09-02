jest.mock('../../../src/common/app-constants', () => ({
  AppConstants: { staticExportPath: '/fake/static-export' },
}));

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  rename: jest.fn(),
  mkdir: jest.fn(),
}));

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { ManifestService, StaticExportManifest } from '../../../src/export/manifest.service';

const mockedReadFile = readFile as jest.Mock;
const mockedWriteFile = writeFile as jest.Mock;
const mockedRename = rename as jest.Mock;
const mockedMkdir = mkdir as jest.Mock;

function existingManifest(): StaticExportManifest {
  return {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    pages: {
      'it-IT:/chi-siamo': {
        pageId: 'existing-guid',
        locale: 'it-IT',
        path: '/chi-siamo',
        contentHash: 'old-hash',
        exportedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };
}

describe('ManifestService (unit, fs mockato)', () => {
  let service: ManifestService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ManifestService();
  });

  it('read() ritorna un manifest vuoto se il file non esiste (ENOENT)', async () => {
    mockedReadFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const manifest = await service.read();

    expect(manifest.pages).toEqual({});
    expect(manifest.version).toBe(1);
  });

  it('read() ritorna un manifest vuoto anche su JSON corrotto (mai un errore che ferma il worker)', async () => {
    mockedReadFile.mockResolvedValueOnce('{ non è json valido');

    const manifest = await service.read();

    expect(manifest.pages).toEqual({});
  });

  it('read() ritorna il manifest parsato quando il file esiste', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingManifest()));

    const manifest = await service.read();

    expect(manifest.pages['it-IT:/chi-siamo'].pageId).toBe('existing-guid');
  });

  it('upsertEntry() scrive su file temporaneo e poi rinomina (scrittura atomica)', async () => {
    mockedReadFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    await service.upsertEntry({
      pageId: 'guid-1',
      locale: 'it-IT',
      path: '/nuova-pagina',
      contentHash: 'hash-abc',
      exportedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(mockedMkdir).toHaveBeenCalledWith('/fake/static-export', { recursive: true });

    const [tmpPath, content] = mockedWriteFile.mock.calls[0];
    expect(tmpPath).toMatch(/^\/fake\/static-export\/manifest\.json\.tmp-/);
    const written = JSON.parse(content) as StaticExportManifest;
    expect(written.pages['it-IT:/nuova-pagina'].pageId).toBe('guid-1');

    const [renameFrom, renameTo] = mockedRename.mock.calls[0];
    expect(renameFrom).toBe(tmpPath);
    expect(renameTo).toBe('/fake/static-export/manifest.json');
  });

  it('upsertEntry() preserva le righe esistenti non toccate', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingManifest()));

    await service.upsertEntry({
      pageId: 'guid-2',
      locale: 'en-US',
      path: '/about',
      contentHash: 'hash-xyz',
      exportedAt: '2026-02-01T00:00:00.000Z',
    });

    const written = JSON.parse(mockedWriteFile.mock.calls[0][1]) as StaticExportManifest;
    expect(written.pages['it-IT:/chi-siamo'].pageId).toBe('existing-guid');
    expect(written.pages['en-US:/about'].pageId).toBe('guid-2');
  });

  it('removeEntry() elimina solo la riga indicata', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingManifest()));

    await service.removeEntry('it-IT', '/chi-siamo');

    const written = JSON.parse(mockedWriteFile.mock.calls[0][1]) as StaticExportManifest;
    expect(written.pages['it-IT:/chi-siamo']).toBeUndefined();
  });

  it('removeEntry() su una chiave inesistente è un no-op che non lancia', async () => {
    mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingManifest()));

    await expect(service.removeEntry('fr-FR', '/inesistente')).resolves.toBeUndefined();
  });

  it('serializza due mutazioni concorrenti invece di correre in race (write-queue interna)', async () => {
    // Simula un disco reale: ogni scrittura aggiorna lo stato che la lettura
    // successiva vedrà. Senza la write-queue interna di ManifestService, le
    // due `upsertEntry` in Promise.all leggerebbero entrambe lo stato
    // iniziale e la seconda scrittura perderebbe la riga della prima
    // (lost update) — questo test fallirebbe se `mutate()` non accodasse.
    let disk = JSON.stringify(existingManifest());
    mockedReadFile.mockImplementation(() => Promise.resolve(disk));
    mockedWriteFile.mockImplementation((_tmpPath: unknown, content: unknown) => {
      disk = content as string;
      return Promise.resolve(undefined);
    });

    await Promise.all([
      service.upsertEntry({
        pageId: 'guid-a',
        locale: 'it-IT',
        path: '/a',
        contentHash: 'hash-a',
        exportedAt: '2026-03-01T00:00:00.000Z',
      }),
      service.upsertEntry({
        pageId: 'guid-b',
        locale: 'it-IT',
        path: '/b',
        contentHash: 'hash-b',
        exportedAt: '2026-03-01T00:00:01.000Z',
      }),
    ]);

    expect(mockedWriteFile).toHaveBeenCalledTimes(2);
    const finalManifest = JSON.parse(disk) as StaticExportManifest;
    expect(finalManifest.pages['it-IT:/a']).toBeDefined();
    expect(finalManifest.pages['it-IT:/b']).toBeDefined();
    expect(finalManifest.pages['it-IT:/chi-siamo']).toBeDefined();
  });
});

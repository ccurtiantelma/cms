jest.mock('../../../src/common/app-constants', () => ({
  AppConstants: {
    publicSiteUrl: 'http://public-site.internal:4000',
    staticExportPath: '/fake/static-export',
    staticExportFullSiteBatchSize: 2,
  },
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { ExportProcessor } from '../../../src/export/export.processor';
import type { ManifestService } from '../../../src/export/manifest.service';
import type { ExportService } from '../../../src/export/export.service';
import type { DbService } from '../../../src/db/db.service';
import type { PublicMediaService } from '../../../src/files/public-media/public-media.service';
import type { StaticExportJobData } from '../../../src/export/export.types';

const mockedMkdir = mkdir as jest.Mock;
const mockedWriteFile = writeFile as jest.Mock;
const mockedRename = rename as jest.Mock;
const mockedRm = rm as jest.Mock;

function buildJob(data: StaticExportJobData): Job<StaticExportJobData> {
  return { data } as Job<StaticExportJobData>;
}

describe('ExportProcessor (unit, HTTP e filesystem mockati)', () => {
  let manifestService: jest.Mocked<Pick<ManifestService, 'upsertEntry' | 'removeEntry'>>;
  let exportService: jest.Mocked<Pick<ExportService, 'enqueuePageExport'>>;
  let db: { db: { query: { pageEntity: { findMany: jest.Mock; findFirst: jest.Mock } } } };
  let publicMediaService: jest.Mocked<Pick<PublicMediaService, 'serve'>>;
  let processor: ExportProcessor;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    manifestService = {
      upsertEntry: jest.fn().mockResolvedValue(undefined),
      removeEntry: jest.fn().mockResolvedValue(undefined),
    };
    exportService = {
      enqueuePageExport: jest.fn().mockResolvedValue(undefined),
    };
    db = { db: { query: { pageEntity: { findMany: jest.fn(), findFirst: jest.fn() } } } };
    publicMediaService = {
      serve: jest.fn().mockRejectedValue(new Error('non chiamato in questo test')),
    };

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    processor = new ExportProcessor(
      manifestService as unknown as ManifestService,
      exportService as unknown as ExportService,
      db as unknown as DbService,
      publicMediaService as unknown as PublicMediaService,
    );
  });

  describe('kind: page', () => {
    it("scarica l'HTML da public-site, lo scrive su disco e aggiorna il manifest", async () => {
      const html = '<html><body>Chi siamo</body></html>';
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/chi-siamo' }),
      );

      expect(fetchMock).toHaveBeenCalledWith('http://public-site.internal:4000/chi-siamo');
      expect(mockedMkdir).toHaveBeenCalledWith('/fake/static-export/it-IT/chi-siamo', {
        recursive: true,
      });

      const [tmpPath, content] = mockedWriteFile.mock.calls[0];
      expect(tmpPath).toMatch(/^\/fake\/static-export\/it-IT\/chi-siamo\/index\.html\.tmp-/);
      expect(content).toBe(html);
      expect(mockedRename).toHaveBeenCalledWith(
        tmpPath,
        '/fake/static-export/it-IT/chi-siamo/index.html',
      );

      expect(manifestService.upsertEntry).toHaveBeenCalledWith({
        pageId: 'guid-1',
        locale: 'it-IT',
        path: '/chi-siamo',
        contentHash: createHash('sha256').update(html).digest('hex'),
        exportedAt: expect.any(String),
      });
    });

    it('risolve la home (/) sotto <root>/<locale>/index.html', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('home') });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-home', locale: 'it-IT', path: '/' }),
      );

      expect(mockedMkdir).toHaveBeenCalledWith('/fake/static-export/it-IT', { recursive: true });
      expect(mockedRename).toHaveBeenCalledWith(
        expect.any(String),
        '/fake/static-export/it-IT/index.html',
      );
    });

    it('rilancia se public-site risponde con uno status non-ok (fa fallire il job, BullMQ ritenta)', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') });

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/x' }),
        ),
      ).rejects.toThrow('500');

      expect(mockedWriteFile).not.toHaveBeenCalled();
      expect(manifestService.upsertEntry).not.toHaveBeenCalled();
    });

    it('rilancia se la chiamata HTTP a public-site fallisce (rete assente)', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/x' }),
        ),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('kind: page — sincronizzazione media (RFC-44 Decisione 6)', () => {
    const guid = 'aaaaaaaaaaaaaaaa';

    it('copia il media referenziato sotto assets/media/<guid>.<ext> e riscrive il src su percorso relativo', async () => {
      const html =
        `<html><body><img src="http://cdn.example/api/v1/public/media/${guid}" alt="x" ` +
        `data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      publicMediaService.serve.mockResolvedValueOnce({
        buffer: Buffer.from('finto-blob-png'),
        mimeType: 'image/png',
      });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/pagina' }),
      );

      expect(publicMediaService.serve).toHaveBeenCalledWith(guid);

      const mediaCall = mockedWriteFile.mock.calls.find(([tmpPath]) =>
        (tmpPath as string).startsWith(`/fake/static-export/assets/media/${guid}.png.tmp-`),
      );
      expect(mediaCall).toBeDefined();
      expect(mediaCall?.[1]).toEqual(Buffer.from('finto-blob-png'));
      expect(mockedRename).toHaveBeenCalledWith(
        mediaCall?.[0],
        `/fake/static-export/assets/media/${guid}.png`,
      );

      const rewrittenHtml =
        `<html><body><img src="/assets/media/${guid}.png" alt="x" ` +
        `data-media-ref="${guid}"></body></html>`;
      const pageCall = mockedWriteFile.mock.calls.find(([tmpPath]) =>
        (tmpPath as string).startsWith('/fake/static-export/it-IT/pagina/index.html.tmp-'),
      );
      expect(pageCall?.[1]).toBe(rewrittenHtml);
      expect(manifestService.upsertEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHash: createHash('sha256').update(rewrittenHtml).digest('hex'),
        }),
      );
    });

    it('lascia il src invariato se il media non è servibile (soft-eliminato/non raster/inesistente)', async () => {
      const html = `<html><body><img src="http://cdn/x" alt="x" data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      publicMediaService.serve.mockRejectedValueOnce(new Error('Media non trovato.'));

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-2', locale: 'it-IT', path: '/pagina-2' }),
      );

      const pageCall = mockedWriteFile.mock.calls.find(([tmpPath]) =>
        (tmpPath as string).startsWith('/fake/static-export/it-IT/pagina-2/index.html.tmp-'),
      );
      expect(pageCall?.[1]).toBe(html);
    });

    it('risolve un guid ripetuto una sola volta (dedupe per pagina)', async () => {
      const html =
        `<html><body>` +
        `<img src="http://cdn/x" alt="a" data-media-ref="${guid}">` +
        `<img src="http://cdn/x" alt="b" data-media-ref="${guid}">` +
        `</body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      publicMediaService.serve.mockResolvedValueOnce({
        buffer: Buffer.from('finto-blob-png'),
        mimeType: 'image/png',
      });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-3', locale: 'it-IT', path: '/pagina-3' }),
      );

      expect(publicMediaService.serve).toHaveBeenCalledTimes(1);
      const pageCall = mockedWriteFile.mock.calls.find(([tmpPath]) =>
        (tmpPath as string).startsWith('/fake/static-export/it-IT/pagina-3/index.html.tmp-'),
      );
      expect(pageCall?.[1]).toBe(
        `<html><body>` +
          `<img src="/assets/media/${guid}.png" alt="a" data-media-ref="${guid}">` +
          `<img src="/assets/media/${guid}.png" alt="b" data-media-ref="${guid}">` +
          `</body></html>`,
      );
    });
  });

  describe('kind: tombstone', () => {
    it('rimuove il file statico e la riga di manifest corrispondente', async () => {
      await processor.process(
        buildJob({ kind: 'tombstone', pageId: 'guid-1', locale: 'it-IT', path: '/chi-siamo' }),
      );

      expect(mockedRm).toHaveBeenCalledWith('/fake/static-export/it-IT/chi-siamo/index.html', {
        force: true,
      });
      expect(manifestService.removeEntry).toHaveBeenCalledWith('it-IT', '/chi-siamo');
    });

    it('è innocuo (no-op) se il file non era mai stato esportato: rm({force:true}) non lancia mai qui', async () => {
      mockedRm.mockResolvedValueOnce(undefined);

      await expect(
        processor.process(
          buildJob({
            kind: 'tombstone',
            pageId: 'guid-mai-esportata',
            locale: 'it-IT',
            path: '/mai',
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('kind: full-site', () => {
    it('enumera le pagine pubblicate/attive e fa il fan-out di job export-page con il percorso canonico', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([
        { id: 1, guid: 'guid-root', slug: 'chi-siamo', parentId: null, locale: 'it-IT' },
        { id: 2, guid: 'guid-child', slug: 'team', parentId: 1, locale: 'it-IT' },
      ]);

      await processor.process(buildJob({ kind: 'full-site' }));

      expect(exportService.enqueuePageExport).toHaveBeenCalledWith(
        'guid-root',
        'it-IT',
        '/chi-siamo',
      );
      expect(exportService.enqueuePageExport).toHaveBeenCalledWith(
        'guid-child',
        'it-IT',
        '/chi-siamo/team',
      );
      expect(exportService.enqueuePageExport).toHaveBeenCalledTimes(2);
    });

    it('interroga solo le pagine status=published e isActive=true', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([]);

      await processor.process(buildJob({ kind: 'full-site' }));

      expect(db.db.query.pageEntity.findMany).toHaveBeenCalledTimes(1);
      expect(exportService.enqueuePageExport).not.toHaveBeenCalled();
    });
  });
});

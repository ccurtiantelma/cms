jest.mock('../../../src/common/app-constants', () => ({
  AppConstants: {
    publicSiteUrl: 'http://public-site.internal:4000',
    staticExportFullSiteBatchSize: 2,
    staticSiteBaseUrl: 'https://www.example.test',
  },
}));

jest.mock('sharp', () => jest.fn());
// Stesso `require` diretto usato da `export.processor.ts` (vedi commento lì):
// bypassa l'emit del default-import ESM di TS, altrimenti disallineato dal
// mock Jest sopra.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: jest.Mock = require('sharp');

import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { ExportProcessor } from '../../../src/export/export.processor';
import type { ManifestService } from '../../../src/export/manifest.service';
import type { ExportService } from '../../../src/export/export.service';
import type { DbService } from '../../../src/db/db.service';
import type { PublicMediaService } from '../../../src/files/public-media/public-media.service';
import type { StaticSiteDeployer } from '../../../src/export/deploy/static-site-deployer.interface';
import type { StaticExportJobData } from '../../../src/export/export.types';
import { buildDerivedFileName } from '../../../src/files/media-variant-naming';
import { MediaTransformPreset } from '../../../src/files/dto/media-transform.dto';

function buildJob(data: StaticExportJobData): Job<StaticExportJobData> {
  return { data } as Job<StaticExportJobData>;
}

describe('ExportProcessor (unit, HTTP e StaticSiteDeployer mockati)', () => {
  let manifestService: jest.Mocked<Pick<ManifestService, 'upsertEntry' | 'removeEntry'>>;
  let exportService: jest.Mocked<Pick<ExportService, 'enqueuePageExport'>>;
  let deployer: jest.Mocked<StaticSiteDeployer>;
  let fileEntityFindFirst: jest.Mock;
  let fileEntityFindMany: jest.Mock;
  let db: {
    db: {
      query: {
        pageEntity: { findMany: jest.Mock; findFirst: jest.Mock };
        fileEntity: { findFirst: jest.Mock; findMany: jest.Mock };
        pageRevisionEntity: { findMany: jest.Mock };
      };
    };
  };
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
    deployer = {
      write: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    fileEntityFindFirst = jest.fn().mockResolvedValue(undefined);
    fileEntityFindMany = jest.fn().mockResolvedValue([]);
    db = {
      db: {
        query: {
          // Default vuoto: la maggior parte dei test `kind: page`/`tombstone`
          // non ha interesse per la rigenerazione di sitemap.xml innescata
          // dal singolo evento (T4 per-page freshness) e non vuole doverla
          // mockare esplicitamente — i test dedicati sotto la sovrascrivono.
          pageEntity: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn(),
          },
          fileEntity: { findFirst: fileEntityFindFirst, findMany: fileEntityFindMany },
          pageRevisionEntity: { findMany: jest.fn().mockResolvedValue([]) },
        },
      },
    };
    publicMediaService = {
      serve: jest.fn().mockRejectedValue(new Error('non chiamato in questo test')),
    };
    sharp.mockReturnValue({ metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }) });

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    processor = new ExportProcessor(
      manifestService as unknown as ManifestService,
      exportService as unknown as ExportService,
      db as unknown as DbService,
      publicMediaService as unknown as PublicMediaService,
      deployer,
    );
  });

  /** Trova il contenuto scritto tramite `deployer.write` per un percorso relativo esatto. */
  function writtenContent(relativePath: string): Buffer | string | undefined {
    return deployer.write.mock.calls.find(([path]) => path === relativePath)?.[1];
  }

  describe('kind: page', () => {
    /**
     * Ogni test di questo describe che non verifica esplicitamente il bundle
     * CSS mocka comunque una seconda risposta `fetch` di successo per
     * l'`href` del `<link>`, così l'asserzione su `deployer.write` dell'HTML
     * di pagina non viene mai raggiunta a causa del fallimento (per design,
     * bloccante) della sincronizzazione CSS.
     */
    function mockCssFetchOk(cssContent = '.a{color:red}'): void {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(cssContent),
      });
    }

    it("scarica l'HTML da public-site, lo scrive tramite il deployer, copia il bundle CSS e aggiorna il manifest", async () => {
      const html =
        '<html><head><link rel="stylesheet" href="/assets/style.abc123.css"/></head>' +
        '<body>Chi siamo</body></html>';
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      mockCssFetchOk('.body{margin:0}');

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/chi-siamo' }),
      );

      expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://public-site.internal:4000/chi-siamo');
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://public-site.internal:4000/assets/style.abc123.css',
      );
      expect(deployer.write).toHaveBeenCalledWith('assets/style.abc123.css', '.body{margin:0}');
      expect(deployer.write).toHaveBeenCalledWith('it-IT/chi-siamo/index.html', html);

      expect(manifestService.upsertEntry).toHaveBeenCalledWith({
        pageId: 'guid-1',
        locale: 'it-IT',
        path: '/chi-siamo',
        contentHash: createHash('sha256').update(html).digest('hex'),
        exportedAt: expect.any(String),
      });
    });

    it('risolve la home (/) sotto <locale>/index.html', async () => {
      const html = '<link rel="stylesheet" href="/assets/style.abc123.css"/>home';
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      mockCssFetchOk();

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-home', locale: 'it-IT', path: '/' }),
      );

      expect(deployer.write).toHaveBeenCalledWith('it-IT/index.html', html);
    });

    it('rilancia se public-site risponde con uno status non-ok (fa fallire il job, BullMQ ritenta)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('') });

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/x' }),
        ),
      ).rejects.toThrow('500');

      expect(deployer.write).not.toHaveBeenCalled();
      expect(manifestService.upsertEntry).not.toHaveBeenCalled();
    });

    it('rilancia se la chiamata HTTP a public-site fallisce (rete assente)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/x' }),
        ),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('kind: page — sincronizzazione del bundle CSS esterno (gap colmato in T5)', () => {
    const html =
      '<html><head><link rel="stylesheet" href="/assets/style.deadbeef.css"/></head><body></body></html>';

    it("rilancia (fa fallire il job) se il fetch del bundle CSS fallisce, come per il fetch dell'HTML", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED-css'));

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-css-1', locale: 'it-IT', path: '/pagina-css-1' }),
        ),
      ).rejects.toThrow('ECONNREFUSED-css');

      expect(deployer.write).not.toHaveBeenCalled();
      expect(manifestService.upsertEntry).not.toHaveBeenCalled();
    });

    it('rilancia (fa fallire il job) se public-site risponde con uno status non-ok per il bundle CSS', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('') });

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-css-2', locale: 'it-IT', path: '/pagina-css-2' }),
        ),
      ).rejects.toThrow('404');

      expect(deployer.write).not.toHaveBeenCalled();
    });

    it('rilancia se l\'HTML non contiene alcun <link rel="stylesheet">: render corrotto a monte', async () => {
      const htmlSenzaLink = '<html><head></head><body>senza css</body></html>';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(htmlSenzaLink),
      });

      await expect(
        processor.process(
          buildJob({ kind: 'page', pageId: 'guid-css-3', locale: 'it-IT', path: '/pagina-css-3' }),
        ),
      ).rejects.toThrow('stylesheet');

      expect(deployer.write).not.toHaveBeenCalled();
    });

    it('non ripete il fetch del bundle CSS per pagine successive con lo stesso href (dedupe in-memory)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('.x{color:blue}'),
      });
      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-css-4a', locale: 'it-IT', path: '/pagina-css-4a' }),
      );

      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-css-4b', locale: 'it-IT', path: '/pagina-css-4b' }),
      );

      const cssFetchCalls = fetchMock.mock.calls.filter(
        ([calledUrl]) => calledUrl === 'http://public-site.internal:4000/assets/style.deadbeef.css',
      );
      expect(cssFetchCalls).toHaveLength(1);
      expect(deployer.write).toHaveBeenCalledWith('assets/style.deadbeef.css', '.x{color:blue}');
    });
  });

  describe('kind: page — sincronizzazione media (RFC-44 Decisione 6, SPEC-F03 § 3.3)', () => {
    const guid = 'aaaaaaaaaaaaaaaa';
    /** Riga `files` senza prefisso di preset noto: trattata come originale, dimensioni lette da `sharp` (mockato a 640x480). */
    const originalRow = {
      id: 10,
      guid,
      parentFileId: null,
      originalName: 'immagine.png',
      mimeType: 'image/png',
      entity: 'page-media',
      isActive: true,
    };

    it('copia il media referenziato, riscrive il src su percorso relativo e inietta width/height/aspect-ratio', async () => {
      const html =
        `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body><img src="http://cdn.example/api/v1/public/media/${guid}" alt="x" ` +
        `data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fileEntityFindFirst.mockResolvedValueOnce(originalRow);
      fileEntityFindMany.mockResolvedValueOnce([originalRow]);
      publicMediaService.serve.mockResolvedValueOnce({
        buffer: Buffer.from('finto-blob-png'),
        mimeType: 'image/png',
      });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/pagina' }),
      );

      expect(publicMediaService.serve).toHaveBeenCalledWith(guid);
      expect(writtenContent(`assets/media/${guid}.png`)).toEqual(Buffer.from('finto-blob-png'));

      const rewrittenHtml =
        `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body><img src="/assets/media/${guid}.png" alt="x" ` +
        `data-media-ref="${guid}" width="640" height="480" style="aspect-ratio:640/480">` +
        `</body></html>`;
      expect(writtenContent('it-IT/pagina/index.html')).toBe(rewrittenHtml);
      expect(writtenContent('assets/style.test.css')).toBe(html);
      expect(manifestService.upsertEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHash: createHash('sha256').update(rewrittenHtml).digest('hex'),
        }),
      );
    });

    it('lascia il tag invariato se il guid referenziato non esiste come riga `files`', async () => {
      const html = `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body><img src="http://cdn/x" alt="x" data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fileEntityFindFirst.mockResolvedValueOnce(undefined);

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-2', locale: 'it-IT', path: '/pagina-2' }),
      );

      expect(publicMediaService.serve).not.toHaveBeenCalled();
      expect(writtenContent('it-IT/pagina-2/index.html')).toBe(html);
    });

    it('lascia il tag invariato se il blob non è servibile (soft-eliminato/non raster)', async () => {
      const html = `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body><img src="http://cdn/x" alt="x" data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fileEntityFindFirst.mockResolvedValueOnce(originalRow);
      publicMediaService.serve.mockRejectedValueOnce(new Error('Media non trovato.'));

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-2b', locale: 'it-IT', path: '/pagina-2b' }),
      );

      expect(writtenContent('it-IT/pagina-2b/index.html')).toBe(html);
    });

    it('risolve un guid ripetuto una sola volta (dedupe per pagina)', async () => {
      const html =
        `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body>` +
        `<img src="http://cdn/x" alt="a" data-media-ref="${guid}">` +
        `<img src="http://cdn/x" alt="b" data-media-ref="${guid}">` +
        `</body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fileEntityFindFirst.mockResolvedValueOnce(originalRow);
      fileEntityFindMany.mockResolvedValueOnce([originalRow]);
      publicMediaService.serve.mockResolvedValueOnce({
        buffer: Buffer.from('finto-blob-png'),
        mimeType: 'image/png',
      });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-3', locale: 'it-IT', path: '/pagina-3' }),
      );

      expect(publicMediaService.serve).toHaveBeenCalledTimes(1);
      expect(fileEntityFindFirst).toHaveBeenCalledTimes(1);
      const expectedImg =
        `<img src="/assets/media/${guid}.png" alt="__ALT__" ` +
        `data-media-ref="${guid}" width="640" height="480" style="aspect-ratio:640/480">`;
      expect(writtenContent('it-IT/pagina-3/index.html')).toBe(
        `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body>` +
          `${expectedImg.replace('__ALT__', 'a')}` +
          `${expectedImg.replace('__ALT__', 'b')}` +
          `</body></html>`,
      );
    });

    it('con varianti a preset nominato in AVIF/WebP, compone un <picture> con srcset multi-risoluzione', async () => {
      const originalName = 'foto-originale.jpg';
      const heroWebpGuid = 'bbbbbbbbbbbbbbbb';
      const heroAvifGuid = 'cccccccccccccccc';
      const cardWebpGuid = 'dddddddddddddddd';
      const cardAvifGuid = 'eeeeeeeeeeeeeeee';

      const jpegOriginalRow = {
        id: 20,
        guid,
        parentFileId: null,
        originalName,
        mimeType: 'image/jpeg',
        entity: 'page-media',
        isActive: true,
      };
      const heroWebpRow = {
        id: 21,
        guid: heroWebpGuid,
        parentFileId: 20,
        originalName: buildDerivedFileName(MediaTransformPreset.Hero, originalName, 'webp'),
        mimeType: 'image/webp',
        entity: 'page-media',
        isActive: true,
      };
      const heroAvifRow = {
        id: 22,
        guid: heroAvifGuid,
        parentFileId: 20,
        originalName: buildDerivedFileName(MediaTransformPreset.Hero, originalName, 'avif'),
        mimeType: 'image/avif',
        entity: 'page-media',
        isActive: true,
      };
      const cardWebpRow = {
        id: 23,
        guid: cardWebpGuid,
        parentFileId: 20,
        originalName: buildDerivedFileName(MediaTransformPreset.Card, originalName, 'webp'),
        mimeType: 'image/webp',
        entity: 'page-media',
        isActive: true,
      };
      const cardAvifRow = {
        id: 24,
        guid: cardAvifGuid,
        parentFileId: 20,
        originalName: buildDerivedFileName(MediaTransformPreset.Card, originalName, 'avif'),
        mimeType: 'image/avif',
        entity: 'page-media',
        isActive: true,
      };

      const html = `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body><img src="http://cdn/x" alt="hero" data-media-ref="${guid}"></body></html>`;
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fileEntityFindFirst.mockResolvedValueOnce(jpegOriginalRow);
      fileEntityFindMany.mockResolvedValueOnce([
        jpegOriginalRow,
        heroWebpRow,
        heroAvifRow,
        cardWebpRow,
        cardAvifRow,
      ]);

      const blobByGuid: Record<string, { buffer: Buffer; mimeType: string }> = {
        [guid]: { buffer: Buffer.from('originale'), mimeType: 'image/jpeg' },
        [heroWebpGuid]: { buffer: Buffer.from('hero-webp'), mimeType: 'image/webp' },
        [heroAvifGuid]: { buffer: Buffer.from('hero-avif'), mimeType: 'image/avif' },
        [cardWebpGuid]: { buffer: Buffer.from('card-webp'), mimeType: 'image/webp' },
        [cardAvifGuid]: { buffer: Buffer.from('card-avif'), mimeType: 'image/avif' },
      };
      publicMediaService.serve.mockImplementation((requestedGuid: string) =>
        Promise.resolve(blobByGuid[requestedGuid]),
      );
      sharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue({ width: 2000, height: 1000 }),
      });

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-4', locale: 'it-IT', path: '/pagina-4' }),
      );

      expect(publicMediaService.serve).toHaveBeenCalledWith(guid);
      expect(publicMediaService.serve).toHaveBeenCalledWith(heroWebpGuid);
      expect(publicMediaService.serve).toHaveBeenCalledWith(heroAvifGuid);
      expect(publicMediaService.serve).toHaveBeenCalledWith(cardWebpGuid);
      expect(publicMediaService.serve).toHaveBeenCalledWith(cardAvifGuid);

      const expectedAvifSrcset =
        `/assets/media/${cardAvifGuid}.avif 800w, ` + `/assets/media/${heroAvifGuid}.avif 1600w`;
      const expectedWebpSrcset =
        `/assets/media/${cardWebpGuid}.webp 800w, ` + `/assets/media/${heroWebpGuid}.webp 1600w`;
      const expectedImg =
        `<img src="/assets/media/${guid}.jpg" alt="hero" data-media-ref="${guid}" ` +
        `width="2000" height="1000" style="aspect-ratio:2000/1000">`;
      const expectedPicture =
        `<picture><source type="image/avif" srcset="${expectedAvifSrcset}">` +
        `<source type="image/webp" srcset="${expectedWebpSrcset}">${expectedImg}</picture>`;

      expect(writtenContent('it-IT/pagina-4/index.html')).toBe(
        `<html><head><link rel="stylesheet" href="/assets/style.test.css"/></head><body>${expectedPicture}</body></html>`,
      );
    });
  });

  describe('kind: tombstone', () => {
    it('rimuove il file statico tramite il deployer e la riga di manifest corrispondente', async () => {
      await processor.process(
        buildJob({ kind: 'tombstone', pageId: 'guid-1', locale: 'it-IT', path: '/chi-siamo' }),
      );

      expect(deployer.remove).toHaveBeenCalledWith('it-IT/chi-siamo/index.html');
      expect(manifestService.removeEntry).toHaveBeenCalledWith('it-IT', '/chi-siamo');
    });

    it('è innocuo (no-op) se il file non era mai stato esportato: il deployer non lancia mai qui', async () => {
      deployer.remove.mockResolvedValueOnce(undefined);

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

      // `skipSitemapRegeneration: true` — il fan-out di un full-site rebuild
      // rigenera sitemap.xml/robots.txt una sola volta a fine batch
      // (asserito sotto), non per ogni job individuale.
      expect(exportService.enqueuePageExport).toHaveBeenCalledWith(
        'guid-root',
        'it-IT',
        '/chi-siamo',
        true,
      );
      expect(exportService.enqueuePageExport).toHaveBeenCalledWith(
        'guid-child',
        'it-IT',
        '/chi-siamo/team',
        true,
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

  describe('kind: full-site — sitemap.xml/robots.txt (SPEC-F03 § 4.2, T4)', () => {
    it('scrive sitemap.xml con una <url> per pagina pubblicata e robots.txt con Allow: / e Sitemap:', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([
        {
          id: 1,
          guid: 'guid-root',
          slug: 'chi-siamo',
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: 101,
        },
        {
          id: 2,
          guid: 'guid-child',
          slug: 'team',
          parentId: 1,
          locale: 'it-IT',
          publishedRevisionId: 102,
        },
      ]);
      db.db.query.pageRevisionEntity.findMany.mockResolvedValueOnce([
        { id: 101, seo: {} },
        { id: 102, seo: {} },
      ]);

      await processor.process(buildJob({ kind: 'full-site' }));

      expect(db.db.query.pageRevisionEntity.findMany).toHaveBeenCalledTimes(1);
      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<loc>https://www.example.test/chi-siamo</loc>');
      expect(sitemap).toContain('<loc>https://www.example.test/chi-siamo/team</loc>');
      expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');

      const robots = writtenContent('robots.txt') as string;
      expect(robots).toContain('Allow: /');
      expect(robots).toContain('Sitemap: https://www.example.test/sitemap.xml');
    });

    it('esclude dalla sitemap le Pagine la cui Revisione pubblicata porta seo.robotsIndex "noindex"', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([
        {
          id: 1,
          guid: 'guid-visible',
          slug: 'visibile',
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: 201,
        },
        {
          id: 2,
          guid: 'guid-hidden',
          slug: 'nascosta',
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: 202,
        },
      ]);
      db.db.query.pageRevisionEntity.findMany.mockResolvedValueOnce([
        { id: 201, seo: { robotsIndex: 'index' } },
        { id: 202, seo: { robotsIndex: 'noindex' } },
      ]);

      await processor.process(buildJob({ kind: 'full-site' }));

      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<loc>https://www.example.test/visibile</loc>');
      expect(sitemap).not.toContain('nascosta');
    });

    it('scrive una sitemap vuota (nessuna query di Revisioni) quando non ci sono Pagine pubblicate', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([]);

      await processor.process(buildJob({ kind: 'full-site' }));

      expect(db.db.query.pageRevisionEntity.findMany).not.toHaveBeenCalled();
      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(sitemap).not.toContain('<url>');
    });

    it("esegue l'escaping XML dei caratteri riservati nel percorso", async () => {
      db.db.query.pageEntity.findMany.mockResolvedValue([
        {
          id: 1,
          guid: 'guid-amp',
          slug: "a&b's",
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: null,
        },
      ]);

      await processor.process(buildJob({ kind: 'full-site' }));

      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<loc>https://www.example.test/a&amp;b&apos;s</loc>');
    });
  });

  describe('kind: page/tombstone — rigenerazione sitemap.xml per-evento (SPEC-F03 § 4.2 emendata, T4)', () => {
    const html =
      '<html><head><link rel="stylesheet" href="/assets/style.t4.css"/></head><body>x</body></html>';

    function mockPageFetchOk(): void {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(html) });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('.a{color:red}'),
      });
    }

    it('exportPage rigenera sitemap.xml/robots.txt riflettendo lo stato pubblicato corrente', async () => {
      mockPageFetchOk();
      db.db.query.pageEntity.findMany.mockResolvedValueOnce([
        {
          id: 1,
          guid: 'guid-1',
          slug: 'nuova-pagina',
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: null,
        },
      ]);

      await processor.process(
        buildJob({ kind: 'page', pageId: 'guid-1', locale: 'it-IT', path: '/nuova-pagina' }),
      );

      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<loc>https://www.example.test/nuova-pagina</loc>');
      expect(writtenContent('robots.txt')).toBeDefined();
    });

    it('un job export-page fanned-out da un full-site rebuild (skipSitemapRegeneration) non rigenera la sitemap', async () => {
      mockPageFetchOk();

      await processor.process(
        buildJob({
          kind: 'page',
          pageId: 'guid-1',
          locale: 'it-IT',
          path: '/x',
          skipSitemapRegeneration: true,
        }),
      );

      expect(db.db.query.pageEntity.findMany).not.toHaveBeenCalled();
      expect(writtenContent('sitemap.xml')).toBeUndefined();
    });

    it('tombstonePage rigenera sitemap.xml/robots.txt escludendo la pagina appena depubblicata', async () => {
      db.db.query.pageEntity.findMany.mockResolvedValueOnce([
        {
          id: 2,
          guid: 'guid-2',
          slug: 'restante',
          parentId: null,
          locale: 'it-IT',
          publishedRevisionId: null,
        },
      ]);

      await processor.process(
        buildJob({ kind: 'tombstone', pageId: 'guid-1', locale: 'it-IT', path: '/depubblicata' }),
      );

      const sitemap = writtenContent('sitemap.xml') as string;
      expect(sitemap).toContain('<loc>https://www.example.test/restante</loc>');
      expect(sitemap).not.toContain('depubblicata');
    });
  });
});

/**
 * Gap T6 (PLAN-F03): ogni altro test su `ExportProcessor` mocka o l'HTTP
 * verso `app/public-site`, o lo `StaticSiteDeployer`, o entrambi
 * (`export.processor.spec.ts`, header "HTTP e StaticSiteDeployer mockati").
 * Nessuno di essi verifica che il file *realmente scritto su disco* dal
 * `LocalFolderDeployer` reale soddisfi insieme tutti i "Criteri di verifica"
 * di SPEC-F03 — questo file colma esattamente quel varco.
 *
 * Confine mockato: **solo** i due servizi esterni legittimi (fetch verso
 * `app/public-site`, query DB per le righe `files`/`page`/`page_revisions` e
 * blob binari da `PublicMediaService`) — mai il filesystem: `LocalFolderDeployer`
 * è importato reale e scrive su una directory temporanea reale
 * (`fs.mkdtempSync`), letta a sua volta con `fs.readFileSync`, non da
 * argomenti di mock.
 */
jest.mock('sharp', () => jest.fn());
// Stesso require diretto usato da `export.processor.ts`/`export.processor.spec.ts`:
// bypassa l'emit del default-import ESM di TS, altrimenti disallineato dal mock sopra.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: jest.Mock = require('sharp');

// Prefisso "mock" richiesto da babel-plugin-jest-hoist per referenziare una
// variabile esterna dentro la factory di `jest.mock` (hoisted sopra gli
// import): l'oggetto resta lo stesso riferimento per tutta la suite, la sola
// `staticExportPath` viene mutata per-test con la directory temporanea reale.
const mockAppConstants: {
  staticExportPath: string;
  publicSiteUrl: string;
  staticSiteBaseUrl: string;
  staticExportFullSiteBatchSize: number;
} = {
  staticExportPath: '',
  publicSiteUrl: 'http://public-site.internal:4000',
  staticSiteBaseUrl: 'https://www.example.test',
  staticExportFullSiteBatchSize: 2,
};
jest.mock('../../../src/common/app-constants', () => ({ AppConstants: mockAppConstants }));

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import { ExportProcessor } from '../../../src/export/export.processor';
import { LocalFolderDeployer } from '../../../src/export/deploy/local-folder.deployer';
import type { ManifestService } from '../../../src/export/manifest.service';
import type { ExportService } from '../../../src/export/export.service';
import type { DbService } from '../../../src/db/db.service';
import type { PublicMediaService } from '../../../src/files/public-media/public-media.service';
import type { StaticExportJobData } from '../../../src/export/export.types';
import { buildDerivedFileName } from '../../../src/files/media-variant-naming';
import { MediaTransformPreset } from '../../../src/files/dto/media-transform.dto';

function buildJob(data: StaticExportJobData): Job<StaticExportJobData> {
  return { data } as Job<StaticExportJobData>;
}

/** Testo `plainText` non sanitizzato (ADR-21 § 4): già come lo persisterebbe l'editor, verbatim. */
const PLAIN_TEXT_RAW = 'Ricerca & Sviluppo <R&D>';
/**
 * Stessa stringa dopo l'escaping che `renderToStaticMarkup` applica sempre in
 * uscita (ADR-21/ADR-22 § 7): `&` prima, poi `<`/`>` — è la forma che
 * `app/public-site` produce davvero oggi (vedi `escaping.spec.ts`). Il
 * fixture HTML sotto la usa già così: il punto di questo test non è
 * verificare *che* React escapi (già coperto altrove), ma che nessuna
 * trasformazione del job di export (riscrittura media/CSS via regex) la
 * corrompa o la sblocchi prima di toccare il disco.
 */
const PLAIN_TEXT_ESCAPED = 'Ricerca &amp; Sviluppo &lt;R&amp;D&gt;';

describe('ExportProcessor (integration — LocalFolderDeployer reale su filesystem reale, solo fetch/DB mockati)', () => {
  let tmpDir: string;
  let deployer: LocalFolderDeployer;
  let processor: ExportProcessor;
  let manifestService: jest.Mocked<Pick<ManifestService, 'upsertEntry' | 'removeEntry'>>;
  let exportService: jest.Mocked<Pick<ExportService, 'enqueuePageExport'>>;
  let fileEntityFindFirst: jest.Mock;
  let fileEntityFindMany: jest.Mock;
  let pageEntityFindMany: jest.Mock;
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
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Directory reale, isolata per test: nessuna scrittura tocca mai il
    // repository o un percorso condiviso fra run paralleli.
    tmpDir = mkdtempSync(join(tmpdir(), 'export-processor-integration-'));
    mockAppConstants.staticExportPath = tmpDir;
    // Costruito DOPO aver impostato `staticExportPath`: il costruttore di
    // `LocalFolderDeployer` cattura `rootDir` una sola volta.
    deployer = new LocalFolderDeployer();

    manifestService = {
      upsertEntry: jest.fn().mockResolvedValue(undefined),
      removeEntry: jest.fn().mockResolvedValue(undefined),
    };
    exportService = { enqueuePageExport: jest.fn().mockResolvedValue(undefined) };

    fileEntityFindFirst = jest.fn().mockResolvedValue(undefined);
    fileEntityFindMany = jest.fn().mockResolvedValue([]);
    pageEntityFindMany = jest.fn().mockResolvedValue([]);
    db = {
      db: {
        query: {
          pageEntity: { findMany: pageEntityFindMany, findFirst: jest.fn() },
          fileEntity: { findFirst: fileEntityFindFirst, findMany: fileEntityFindMany },
          pageRevisionEntity: { findMany: jest.fn().mockResolvedValue([]) },
        },
      },
    };

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
      deployer,
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    'scrive su disco reale un file che porta insieme CSS critico inline, <picture> AVIF/WebP con dimensioni, ' +
      'SEO/JSON-LD e plainText escapato (SPEC-F03 § Criteri di verifica), poi il tombstone lo rimuove fisicamente ' +
      'e aggiorna sitemap.xml/robots.txt (non-regressione ADR-45 § Decisione 5 sul deployer reale)',
    async () => {
      const guid = 'a1a1a1a1a1a1a1a1';
      const cardWebpGuid = 'b2b2b2b2b2b2b2b2';
      const cardAvifGuid = 'c3c3c3c3c3c3c3c3';
      const cssHref = '/assets/style.integration.css';
      const cssContent = '.hero{color:#111}.card{color:#222}';

      const structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Chi siamo' },
          { '@type': 'Organization', name: 'Azienda Demo' },
        ],
      };
      const ldJsonScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

      const originalImgTag =
        `<img src="http://cdn.example/api/v1/public/media/${guid}" ` +
        `alt="${PLAIN_TEXT_ESCAPED}" data-media-ref="${guid}">`;

      // Fixture realistico: riproduce la forma esatta prodotta oggi da
      // `App.tsx` (ordine dei tag nel <head> letto dal sorgente reale) — meta
      // OG, canonical, ld+json, poi `<style data-critical-css>` **prima** del
      // `<link rel="stylesheet">` esterno, coerente con ADR-53 § 2.
      const rawHtml =
        '<html lang="it-IT"><head>' +
        '<meta charset="utf-8"/>' +
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
        '<title>Chi siamo</title>' +
        '<meta property="og:title" content="Chi siamo | Azienda Demo"/>' +
        '<meta property="og:description" content="Descrizione aziendale per i motori di ricerca."/>' +
        '<meta property="og:image" content="https://cdn.example.test/assets/og-cover.jpg"/>' +
        '<link rel="canonical" href="/chi-siamo"/>' +
        ldJsonScript +
        '<style data-critical-css="true">.hero{color:#111;font-size:2rem}</style>' +
        `<link rel="stylesheet" href="${cssHref}"/>` +
        '</head><body>' +
        `<h2>${PLAIN_TEXT_ESCAPED}</h2>` +
        originalImgTag +
        '</body></html>';

      // --- Confine mockato 1: fetch verso app/public-site (HTML di pagina, poi bundle CSS) ---
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(rawHtml),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(cssContent),
      });

      // --- Confine mockato 2: query DB per la famiglia di righe `files` del media referenziato ---
      const originalRow = {
        id: 30,
        guid,
        parentFileId: null,
        originalName: 'foto-hero.jpg',
        mimeType: 'image/jpeg',
        entity: 'page-media',
        isActive: true,
      };
      const cardWebpRow = {
        id: 31,
        guid: cardWebpGuid,
        parentFileId: 30,
        originalName: buildDerivedFileName(MediaTransformPreset.Card, 'foto-hero.jpg', 'webp'),
        mimeType: 'image/webp',
        entity: 'page-media',
        isActive: true,
      };
      const cardAvifRow = {
        id: 32,
        guid: cardAvifGuid,
        parentFileId: 30,
        originalName: buildDerivedFileName(MediaTransformPreset.Card, 'foto-hero.jpg', 'avif'),
        mimeType: 'image/avif',
        entity: 'page-media',
        isActive: true,
      };
      fileEntityFindFirst.mockResolvedValueOnce(originalRow);
      fileEntityFindMany.mockResolvedValueOnce([originalRow, cardWebpRow, cardAvifRow]);

      const blobByGuid: Record<string, { buffer: Buffer; mimeType: string }> = {
        [guid]: { buffer: Buffer.from('bytes-jpeg-originale'), mimeType: 'image/jpeg' },
        [cardWebpGuid]: { buffer: Buffer.from('bytes-card-webp'), mimeType: 'image/webp' },
        [cardAvifGuid]: { buffer: Buffer.from('bytes-card-avif'), mimeType: 'image/avif' },
      };
      publicMediaService.serve.mockImplementation((requestedGuid: string) =>
        Promise.resolve(blobByGuid[requestedGuid]),
      );
      // Dimensioni intrinseche dell'originale (nessun preset nominato su
      // `foto-hero.jpg`): lette da `sharp` (mockato), MAI da PRESET_DIMENSIONS
      // per la variante base. Le due varianti Card usano invece
      // PRESET_DIMENSIONS[Card] reale (800x450), senza invocare `sharp`.
      sharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue({ width: 1600, height: 900 }),
      });

      // --- Confine mockato 3: enumerazione Pagine pubblicate per sitemap.xml/robots.txt ---
      // Prima chiamata (dentro exportPage -> regenerateSitemapAndRobots): la
      // pagina è pubblicata. Seconda chiamata (dentro tombstonePage, dopo la
      // depubblicazione simulata): la pagina non compare più.
      pageEntityFindMany
        .mockResolvedValueOnce([
          {
            id: 1,
            guid: 'page-guid-integration',
            slug: 'chi-siamo',
            parentId: null,
            locale: 'it-IT',
            publishedRevisionId: null,
          },
        ])
        .mockResolvedValueOnce([]);

      // ==================== FASE 1: export (kind: page) ====================
      await processor.process(
        buildJob({
          kind: 'page',
          pageId: 'page-guid-integration',
          locale: 'it-IT',
          path: '/chi-siamo',
        }),
      );

      const pageFilePath = join(tmpDir, 'it-IT', 'chi-siamo', 'index.html');
      const cssFilePath = join(tmpDir, 'assets', 'style.integration.css');
      const sitemapPath = join(tmpDir, 'sitemap.xml');
      const robotsPath = join(tmpDir, 'robots.txt');

      // Il file è realmente su disco (non un argomento di mock).
      expect(existsSync(pageFilePath)).toBe(true);
      const writtenHtml = readFileSync(pageFilePath, 'utf-8');

      // Requisito 1 — Output statico/zero-JS: <style data-critical-css> presente
      // PRIMA del <link rel="stylesheet"> esterno; nessuno script di
      // hydration — l'unico <script> ammesso in questo fixture è il ld+json
      // SEO (requisito 3), mai un bundle client per i blocchi.
      const criticalStyleIndex = writtenHtml.indexOf('<style data-critical-css');
      const stylesheetLinkIndex = writtenHtml.indexOf(`<link rel="stylesheet" href="${cssHref}"`);
      expect(criticalStyleIndex).toBeGreaterThanOrEqual(0);
      expect(stylesheetLinkIndex).toBeGreaterThan(criticalStyleIndex);
      const scriptTags = writtenHtml.match(/<script\b[^>]*>/g) ?? [];
      expect(scriptTags).toHaveLength(1);
      expect(scriptTags[0]).toContain('type="application/ld+json"');
      expect(existsSync(cssFilePath)).toBe(true);
      expect(readFileSync(cssFilePath, 'utf-8')).toBe(cssContent);

      // Requisito 2 — Media/CLS=0: <picture> con <source> AVIF+WebP e <img>
      // con width/height/aspect-ratio, riscritto su un percorso relativo
      // reale che esiste davvero sotto assets/media/.
      expect(writtenHtml).toContain(
        `<source type="image/avif" srcset="/assets/media/${cardAvifGuid}.avif 800w">`,
      );
      expect(writtenHtml).toContain(
        `<source type="image/webp" srcset="/assets/media/${cardWebpGuid}.webp 800w">`,
      );
      expect(writtenHtml).toContain(
        `<img src="/assets/media/${guid}.jpg" alt="${PLAIN_TEXT_ESCAPED}" data-media-ref="${guid}" ` +
          `width="1600" height="900" style="aspect-ratio:1600/900">`,
      );
      expect(existsSync(join(tmpDir, 'assets', 'media', `${guid}.jpg`))).toBe(true);
      expect(existsSync(join(tmpDir, 'assets', 'media', `${cardWebpGuid}.webp`))).toBe(true);
      expect(existsSync(join(tmpDir, 'assets', 'media', `${cardAvifGuid}.avif`))).toBe(true);

      // Requisito 3 — SEO/sitemap: meta OpenGraph e ld+json presenti nel file
      // scritto, JSON valido, coerente col dato originale.
      expect(writtenHtml).toContain(
        '<meta property="og:title" content="Chi siamo | Azienda Demo"/>',
      );
      expect(writtenHtml).toContain(
        '<meta property="og:description" content="Descrizione aziendale per i motori di ricerca."/>',
      );
      expect(writtenHtml).toContain(
        '<meta property="og:image" content="https://cdn.example.test/assets/og-cover.jpg"/>',
      );
      const ldJsonStart =
        writtenHtml.indexOf('<script type="application/ld+json">') +
        '<script type="application/ld+json">'.length;
      const ldJsonEnd = writtenHtml.indexOf('</script>', ldJsonStart);
      const embeddedLdJson = writtenHtml.slice(ldJsonStart, ldJsonEnd);
      expect(() => JSON.parse(embeddedLdJson)).not.toThrow();
      expect(JSON.parse(embeddedLdJson)).toEqual(structuredData);

      // Invariante di escaping (ADR-21 § 4/ADR-53 § 7), verificata sul FILE
      // scritto, non sulla risposta HTTP: la forma già escapata sopravvive
      // intatta alle riscritture regex di CSS/media, e la forma grezza non
      // compare mai (né nel testo né nell'attributo `alt`).
      expect(writtenHtml).toContain(PLAIN_TEXT_ESCAPED);
      expect(writtenHtml).not.toContain(PLAIN_TEXT_RAW);

      // Requisito "sitemap.xml elenca esattamente le Pagine published al
      // momento dell'ultima rigenerazione" (SPEC-F03 § Criteri di verifica):
      // scritta come file reale nella radice dell'export, con la pagina appena
      // pubblicata presente.
      expect(existsSync(sitemapPath)).toBe(true);
      const sitemapBeforeTombstone = readFileSync(sitemapPath, 'utf-8');
      expect(sitemapBeforeTombstone).toContain('<loc>https://www.example.test/chi-siamo</loc>');
      expect(existsSync(robotsPath)).toBe(true);
      expect(readFileSync(robotsPath, 'utf-8')).toContain('Allow: /');

      // ==================== FASE 2: tombstone (kind: tombstone) ====================
      await processor.process(
        buildJob({
          kind: 'tombstone',
          pageId: 'page-guid-integration',
          locale: 'it-IT',
          path: '/chi-siamo',
        }),
      );

      // Requisito 4a (non-regressione ADR-45 § Decisione 5, ora sul deployer
      // reale): il file è rimosso FISICAMENTE dal filesystem, non è un
      // argomento passato a un mock di `remove`.
      expect(existsSync(pageFilePath)).toBe(false);

      // Cache/archiviazione (CLAUDE.md § Test Engineer, "cache invalidata dopo
      // archiviazione"): in un'architettura SSG air-gapped (ADR-53) non esiste
      // più una cache Redis da invalidare — l'equivalente esatto è "il
      // contenuto non è più il file servito dall'edge" più "non è più elencato
      // in sitemap.xml", entrambi verificati qui sul filesystem reale.
      const sitemapAfterTombstone = readFileSync(sitemapPath, 'utf-8');
      expect(sitemapAfterTombstone).not.toContain('chi-siamo');
      expect(existsSync(robotsPath)).toBe(true);
    },
  );
});

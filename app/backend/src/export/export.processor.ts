import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { AppConstants } from '../common/app-constants';
import { DbService } from '../db/db.service';
import { pageEntity } from '../db/schema';
import { canonicalizePublicPath } from '../pages/public-path.util';
import { PublicMediaService } from '../files/public-media/public-media.service';
import { ManifestService } from './manifest.service';
import { ExportService } from './export.service';
import { StaticExportJobData } from './export.types';

/** Estensione file dei cinque formati raster ammessi (stessa tabella chiusa di `raster-mime-sniffer.ts`). */
const MEDIA_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Cattura un tag `<img>` intero, da riscrivere sul `src` se porta un `data-media-ref` valido. */
const IMG_TAG_PATTERN = /<img\b[^>]*>/g;
/** `guid` a 16 esadecimali (CLAUDE.md: mai `id` numerico in URL), stesso formato validato da `Utils.randomString(16)`. */
const MEDIA_REF_PATTERN = /data-media-ref="([0-9a-f]{16})"/;

/** Coordinate di una Pagina pubblicata risolte per l'export (stesso concetto di `CacheableLocation` di ADR-23, duplicato qui per non introdurre una dipendenza circolare fra `ExportModule` e `PagesModule`). */
interface PublishedPageLocation {
  pageId: string;
  locale: string;
  path: string;
}

/**
 * Worker della coda `static-export` (RFC-44). Non importa mai `react`/
 * `react-dom/server` (Decisione 1, divieto assoluto "rendering HTML
 * nell'API"): l'HTML arriva da una richiesta HTTP interna verso
 * `app/public-site`, già renderizzato. Qui si scrive solo su disco.
 */
@Injectable()
@Processor('static-export')
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);

  /**
   * Inietta il manifest, il produttore dei job (per il fan-out del
   * full-site), l'accesso al DB (solo per l'enumerazione del full-site) e la
   * risoluzione pubblica dei media (Decisione 6, riuso di `PublicMediaService`
   * invece di duplicare la risoluzione guid -> blob).
   */
  constructor(
    private readonly manifestService: ManifestService,
    private readonly exportService: ExportService,
    private readonly db: DbService,
    private readonly publicMediaService: PublicMediaService,
  ) {
    super();
  }

  /** Smista il job in base a `kind`: export/tombstone di una singola pagina, o fan-out full-site. */
  async process(job: Job<StaticExportJobData>): Promise<void> {
    switch (job.data.kind) {
      case 'page':
        return this.exportPage(job.data.pageId, job.data.locale, job.data.path);
      case 'tombstone':
        return this.tombstonePage(job.data.pageId, job.data.locale, job.data.path);
      case 'full-site':
        return this.exportFullSite();
    }
  }

  /** Percorso del file statico su disco per `locale`+`path` (RFC-44, Decisione 2: `<root>/<locale>/<segmenti>/index.html`). */
  private resolveFilePath(locale: string, path: string): string {
    const segments = path.split('/').filter((segment) => segment.length > 0);
    return join(AppConstants.staticExportPath, locale, ...segments, 'index.html');
  }

  private async writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmpPath, content);
    await rename(tmpPath, filePath);
  }

  /** Percorso stabile su disco del media esportato (RFC-44, Decisione 6: `<root>/assets/media/<guid>.<ext>`). */
  private resolveMediaFilePath(guid: string, extension: string): string {
    return join(AppConstants.staticExportPath, 'assets', 'media', `${guid}.${extension}`);
  }

  /**
   * Copia sull'export statico ogni media referenziato nell'HTML (nodi
   * `<img data-media-ref="guid">`, marcatore già emesso dal componente
   * `Image` condiviso frontend/public-site) e riscrive il relativo `src` su
   * un percorso relativo stabile, così il file esportato non dipende più da
   * `PUBLIC_MEDIA_BASE_URL`/dal backend a runtime (RFC-44, Decisione 6: stessa
   * risoluzione guid -> blob di ADR-27 via `PublicMediaService`, copia bytes
   * invece di riferimento). Un `guid` non risolvibile (media soft-eliminato,
   * non raster) lascia l'`<img>` invariato: la pagina resta esportabile, solo
   * quell'immagine punta ancora al backend per quel media.
   */
  private async syncMediaAndRewriteHtml(html: string): Promise<string> {
    const tags = html.match(IMG_TAG_PATTERN);
    if (!tags) {
      return html;
    }

    const resolvedExtensionByGuid = new Map<string, string | null>();
    let result = html;

    for (const tag of tags) {
      const guidMatch = tag.match(MEDIA_REF_PATTERN);
      if (!guidMatch) {
        continue;
      }
      const guid = guidMatch[1];

      if (!resolvedExtensionByGuid.has(guid)) {
        resolvedExtensionByGuid.set(guid, await this.copyMediaAsset(guid));
      }
      const extension = resolvedExtensionByGuid.get(guid);
      if (!extension) {
        continue;
      }

      const rewrittenTag = tag.replace(
        /\ssrc="[^"]*"/,
        ` src="/assets/media/${guid}.${extension}"`,
      );
      result = result.replace(tag, rewrittenTag);
    }

    return result;
  }

  /** Risolve e copia un singolo media sull'export statico. Restituisce l'estensione scritta, o `null` se il media non è servibile. */
  private async copyMediaAsset(guid: string): Promise<string | null> {
    let blob: { buffer: Buffer; mimeType: string };
    try {
      blob = await this.publicMediaService.serve(guid);
    } catch {
      this.logger.warn(
        `Media non servibile durante l'export, src lasciato invariato (guid=${guid}).`,
      );
      return null;
    }

    const extension = MEDIA_EXTENSION_BY_MIME_TYPE[blob.mimeType];
    if (!extension) {
      this.logger.warn(
        `Media con MIME non mappato durante l'export (guid=${guid}, mimeType=${blob.mimeType}).`,
      );
      return null;
    }

    await this.writeFileAtomic(this.resolveMediaFilePath(guid, extension), blob.buffer);
    return extension;
  }

  private async exportPage(pageId: string, locale: string, path: string): Promise<void> {
    const url = `${AppConstants.publicSiteUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(`Chiamata a public-site fallita per ${path}: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new Error(`public-site ha risposto ${response.status} per ${path}`);
    }
    const html = await this.syncMediaAndRewriteHtml(await response.text());

    const filePath = this.resolveFilePath(locale, path);
    await this.writeFileAtomic(filePath, html);

    await this.manifestService.upsertEntry({
      pageId,
      locale,
      path,
      contentHash: createHash('sha256').update(html).digest('hex'),
      exportedAt: new Date().toISOString(),
    });

    this.logger.log(
      `Pagina esportata: pageId=${pageId} locale=${locale} path=${path} -> ${filePath}`,
    );
  }

  /**
   * Rimozione fisica del file statico (RFC-44, Decisione 5): un file rimasto
   * su disco resterebbe raggiungibile da Nginx anche a backend spento,
   * violando "pagina non pubblicata mai raggiungibile" in modo più grave del
   * `404` dinamico. `force: true` rende l'operazione un no-op innocuo se il
   * file non era mai stato esportato.
   */
  private async tombstonePage(pageId: string, locale: string, path: string): Promise<void> {
    const filePath = this.resolveFilePath(locale, path);
    try {
      await rm(filePath, { force: true });
    } catch (err) {
      throw new Error(`Rimozione file statico fallita per ${path}: ${(err as Error).message}`);
    }
    await this.manifestService.removeEntry(locale, path);
    this.logger.log(
      `Tombstone applicato: pageId=${pageId} locale=${locale} path=${path} (file rimosso).`,
    );
  }

  /**
   * Enumera le Pagine pubblicate e fa il fan-out di job `export-page`
   * individuali (RFC-44, Decisione 3/4): il full-site rebuild non
   * renderizza/scrive nulla direttamente, si limita a riusare la stessa
   * pipeline a singola pagina, a lotti con backpressure (mai 10.000+ job
   * accodati in un colpo solo).
   */
  private async exportFullSite(): Promise<void> {
    const locations = await this.resolvePublishedPageLocations();
    const batchSize = AppConstants.staticExportFullSiteBatchSize;

    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize);
      await Promise.all(
        batch.map((location) =>
          this.exportService.enqueuePageExport(location.pageId, location.locale, location.path),
        ),
      );
    }

    this.logger.log(`Full-site export: ${locations.length} pagina/e accodata/e per il rebuild.`);
  }

  /**
   * Cammina l'intero albero delle Pagine attive/pubblicate calcolando il
   * percorso canonico di ognuna (stesso algoritmo di
   * `PublicPageCacheService.collectSubtreeLocations`, duplicato qui — vive
   * in un modulo diverso e importarlo introdurrebbe un ciclo
   * `ExportModule` ↔ `PagesModule`, dato che `PagesModule` importa già
   * `ExportModule` per accodare i job di export/tombstone).
   */
  private async resolvePublishedPageLocations(): Promise<PublishedPageLocation[]> {
    const rows = await this.db.db.query.pageEntity.findMany({
      where: and(eq(pageEntity.status, 'published'), eq(pageEntity.isActive, true)),
      columns: { id: true, guid: true, slug: true, parentId: true, locale: true },
    });

    const slugById = new Map(rows.map((row) => [row.id, row]));
    const ancestorCache = new Map<number | null, string[]>();

    const loadAncestorSlugs = async (parentId: number | null): Promise<string[]> => {
      if (ancestorCache.has(parentId)) {
        return ancestorCache.get(parentId) as string[];
      }
      const slugs: string[] = [];
      let currentId = parentId;
      while (currentId !== null) {
        const cached = slugById.get(currentId);
        const current =
          cached ??
          (await this.db.db.query.pageEntity.findFirst({
            where: eq(pageEntity.id, currentId),
            columns: { id: true, guid: true, slug: true, parentId: true, locale: true },
          }));
        if (!current) break;
        slugs.unshift(current.slug);
        currentId = current.parentId;
      }
      ancestorCache.set(parentId, slugs);
      return slugs;
    };

    const locations: PublishedPageLocation[] = [];
    for (const row of rows) {
      const ancestorSlugs = await loadAncestorSlugs(row.parentId);
      locations.push({
        pageId: row.guid,
        locale: row.locale,
        path: canonicalizePublicPath('/' + [...ancestorSlugs, row.slug].join('/')),
      });
    }
    return locations;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { and, eq, inArray, or } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { fileEntity, pageEntity, pageRevisionEntity } from '../db/schema';
import { canonicalizePublicPath } from '../pages/public-path.util';
import { PublicMediaService } from '../files/public-media/public-media.service';
import {
  CROP_VARIANT_LABEL,
  PRESET_DIMENSIONS,
  parseVariantLabel,
} from '../files/media-variant-naming';
import { ManifestService } from './manifest.service';
import { ExportService } from './export.service';
import { StaticExportJobData } from './export.types';
import { AppConstants } from '../common/app-constants';
import { STATIC_SITE_DEPLOYER, StaticSiteDeployer } from './deploy/static-site-deployer.interface';

interface SharpMetadataOnly {
  metadata(): Promise<{ width?: number; height?: number }>;
}

/**
 * Stesso require CJS isolato di `media.processor.ts` (i `.d.mts` di `sharp`
 * non riflettono il build a runtime). Usato qui **solo** per leggere le
 * dimensioni intrinseche di un'immagine priva di preset nominato (originale
 * o variante da crop esplicito): per le varianti a preset nominato le
 * dimensioni sono note staticamente da `PRESET_DIMENSIONS`, senza invocare
 * `sharp` (SPEC-F03 § 3.3, "esposte, non ricalcolate").
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input: Buffer) => SharpMetadataOnly = require('sharp');

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

/** Cattura l'intero tag `<link rel="stylesheet">` del foglio CSS esterno dei blocchi (`App.tsx`, servito da `server.ts::loadCss`), stesso approccio a due fasi già usato per `IMG_TAG_PATTERN`/`MEDIA_REF_PATTERN`. */
const STYLESHEET_LINK_TAG_PATTERN = /<link\b[^>]*\brel="stylesheet"[^>]*>/;
/** `href` del foglio CSS esterno, dentro il tag catturato da `STYLESHEET_LINK_TAG_PATTERN`. */
const STYLESHEET_HREF_PATTERN = /\bhref="([^"]+)"/;

/** Escaping XML minimo per un nodo di testo (`sitemap.xml`): mai un `<loc>` malformato da uno slug con caratteri riservati XML. */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Coordinate di una Pagina pubblicata risolte per l'export (stesso concetto di `CacheableLocation` di ADR-23, duplicato qui per non introdurre una dipendenza circolare fra `ExportModule` e `PagesModule`). */
interface PublishedPageLocation {
  pageId: string;
  locale: string;
  path: string;
  /** `null` solo in teoria (una Pagina `status=published` ha sempre una Revisione pubblicata): mai forzato non-null per non assumere un invariante non garantito dal tipo di colonna. */
  publishedRevisionId: number | null;
}

/** Risorse copiate sull'export per un `guid` di media referenziato (SPEC-F03 § 3.3): l'asset di base e, per formato, le varianti a preset nominato disponibili in `srcset` già composto. */
interface ResolvedMediaResources {
  baseUrl: string;
  width: number;
  height: number;
  sources: { extension: 'avif' | 'webp'; srcset: string }[];
}

/**
 * Worker della coda `static-export` (RFC-44). Non importa mai `react`/
 * `react-dom/server` (Decisione 1, divieto assoluto "rendering HTML
 * nell'API"): l'HTML arriva da una richiesta HTTP interna verso
 * `app/public-site`, già renderizzato. Qui si passa solo il risultato allo
 * `StaticSiteDeployer` iniettato (Decisione 8) — mai `node:fs` direttamente.
 */
@Injectable()
@Processor('static-export')
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);

  /**
   * `href` del bundle CSS già copiati sull'export in questo ciclo di vita del
   * processor (SPEC-F03 § 4.3): l'`href` è content-addressed (fingerprint
   * immutabile del bundle, ADR-53 § 2), quindi la stessa build produce sempre
   * lo stesso `href` per ogni pagina esportata — riscrivere due volte gli
   * stessi bytes sullo stesso path è innocuo, ma un `Set` in-memory evita
   * fetch ridondanti verso `app/public-site` durante il fan-out di un
   * full-site rebuild. Non è uno stato che richiede persistenza: si
   * ricostruisce da solo al primo export di ogni nuovo processo.
   */
  private readonly exportedCssHrefs = new Set<string>();

  /**
   * Inietta il manifest, il produttore dei job (per il fan-out del
   * full-site), l'accesso al DB (solo per l'enumerazione del full-site), la
   * risoluzione pubblica dei media (Decisione 6, riuso di `PublicMediaService`
   * invece di duplicare la risoluzione guid -> blob) e l'adapter di
   * deployment (RFC-44 Decisione 8): la scrittura/rimozione dei file
   * statici passa sempre da qui, mai da `node:fs` direttamente.
   */
  constructor(
    private readonly manifestService: ManifestService,
    private readonly exportService: ExportService,
    private readonly db: DbService,
    private readonly publicMediaService: PublicMediaService,
    @Inject(STATIC_SITE_DEPLOYER) private readonly deployer: StaticSiteDeployer,
  ) {
    super();
  }

  /** Smista il job in base a `kind`: export/tombstone di una singola pagina, o fan-out full-site. */
  async process(job: Job<StaticExportJobData>): Promise<void> {
    switch (job.data.kind) {
      case 'page':
        return this.exportPage(
          job.data.pageId,
          job.data.locale,
          job.data.path,
          job.data.skipSitemapRegeneration ?? false,
        );
      case 'tombstone':
        return this.tombstonePage(job.data.pageId, job.data.locale, job.data.path);
      case 'full-site':
        return this.exportFullSite();
    }
  }

  /** Percorso relativo del file statico per `locale`+`path` (RFC-44, Decisione 2: `<locale>/<segmenti>/index.html`), affidato all'adapter di deployment per la radice effettiva (Decisione 8). */
  private resolveRelativePagePath(locale: string, path: string): string {
    const segments = path.split('/').filter((segment) => segment.length > 0);
    return join(locale, ...segments, 'index.html');
  }

  /** Percorso relativo stabile del media esportato (RFC-44, Decisione 6: `assets/media/<guid>.<ext>`). */
  private resolveRelativeMediaPath(guid: string, extension: string): string {
    return join('assets', 'media', `${guid}.${extension}`);
  }

  /**
   * Percorso relativo del bundle CSS sull'export, ricavato dall'`href`
   * assoluto già presente nell'HTML (`/assets/style.<hash>.css`): deve
   * combaciare esattamente con l'`href` scritto nel `<link>`, altrimenti il
   * tag punterebbe a un file mai scritto sull'edge. Nessuna ricostruzione
   * del nome: si toglie solo lo `/` iniziale, stesso schema relativo già
   * usato da `resolveRelativeMediaPath`/`resolveRelativePagePath`.
   */
  private resolveRelativeCssPath(href: string): string {
    return href.startsWith('/') ? href.slice(1) : href;
  }

  /**
   * Copia sull'export statico il foglio CSS esterno dei blocchi referenziato
   * dal `<link rel="stylesheet">` nell'HTML prodotto da `app/public-site`
   * (`server.ts::loadCss`). A differenza di un media referenziato
   * (`resolveMediaResources`), qui non esiste un fallback sensato: un bundle
   * CSS mancante non lascia "un tag invariato", lascia l'intera pagina
   * esportata visivamente rotta (nessuno stile applicato tranne le variabili
   * di tema inline). Il tag è sempre presente nell'HTML prodotto da `App.tsx`
   * (`<link rel="stylesheet" href={cssHref} />`, mai condizionale): la sua
   * assenza è quindi un render corrotto a monte, non un caso degradabile — si
   * fa fallire l'intero job (BullMQ ritenta), stesso trattamento del fetch
   * dell'HTML di pagina in `exportPage`.
   */
  private async syncCssBundle(html: string): Promise<void> {
    const linkTag = html.match(STYLESHEET_LINK_TAG_PATTERN)?.[0];
    const href = linkTag ? linkTag.match(STYLESHEET_HREF_PATTERN)?.[1] : undefined;
    if (!href) {
      throw new Error(
        'Nessun <link rel="stylesheet"> con href trovato nell\'HTML prodotto da public-site: bundle CSS non individuabile.',
      );
    }
    if (this.exportedCssHrefs.has(href)) {
      return;
    }

    const cssUrl = `${AppConstants.publicSiteUrl}${href}`;
    let response: Response;
    try {
      response = await fetch(cssUrl);
    } catch (err) {
      throw new Error(
        `Chiamata a public-site fallita per il bundle CSS ${href}: ${(err as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new Error(`public-site ha risposto ${response.status} per il bundle CSS ${href}`);
    }
    const cssContent = await response.text();

    await this.deployer.write(this.resolveRelativeCssPath(href), cssContent);
    this.exportedCssHrefs.add(href);
  }

  /**
   * Copia sull'export statico ogni media referenziato nell'HTML (nodi
   * `<img data-media-ref="guid">`, marcatore già emesso dal componente
   * `Image` condiviso frontend/public-site) e riscrive il tag su un percorso
   * relativo stabile, così il file esportato non dipende più da
   * `PUBLIC_MEDIA_BASE_URL`/dal backend a runtime (RFC-44, Decisione 6: stessa
   * risoluzione guid -> blob di ADR-27 via `PublicMediaService`, copia bytes
   * invece di riferimento). Se esistono varianti derivate a preset nominato
   * (ADR-49), il tag diventa un `<picture>` con `srcset` AVIF/WebP
   * multi-risoluzione e `width`/`height`/`aspect-ratio` (SPEC-F03 § 3.3, CLS
   * = 0). Un `guid` non risolvibile (media soft-eliminato, non raster) lascia
   * l'`<img>` invariato: la pagina resta esportabile, solo quell'immagine
   * punta ancora al backend per quel media.
   */
  private async syncMediaAndRewriteHtml(html: string): Promise<string> {
    const tags = html.match(IMG_TAG_PATTERN);
    if (!tags) {
      return html;
    }

    const resourcesByGuid = new Map<string, ResolvedMediaResources | null>();
    let result = html;

    for (const tag of tags) {
      const guidMatch = tag.match(MEDIA_REF_PATTERN);
      if (!guidMatch) {
        continue;
      }
      const guid = guidMatch[1];

      if (!resourcesByGuid.has(guid)) {
        resourcesByGuid.set(guid, await this.resolveMediaResources(guid));
      }
      const resources = resourcesByGuid.get(guid);
      if (resources) {
        result = result.replace(tag, this.renderMediaMarkup(tag, resources));
      }
    }

    return result;
  }

  /**
   * Risolve le risorse copiate sull'export per un `guid` referenziato
   * (asset di base + eventuali varianti a preset nominato in AVIF/WebP,
   * famiglia legata da `parentFileId`, ADR-49): cacheabile per `guid`, a
   * differenza del markup finale che dipende anche dagli attributi del
   * singolo tag `<img>` (`alt` in primis) e va quindi ricomposto per ogni
   * occorrenza (`renderMediaMarkup`). Restituisce `null` se il `guid` non è
   * servibile — il chiamante lascia il tag originale invariato.
   */
  private async resolveMediaResources(guid: string): Promise<ResolvedMediaResources | null> {
    const referenceRow = await this.db.db.query.fileEntity.findFirst({
      where: and(
        eq(fileEntity.guid, guid),
        eq(fileEntity.entity, 'page-media'),
        eq(fileEntity.isActive, true),
      ),
    });
    if (!referenceRow) {
      this.logger.warn(
        `Media non servibile durante l'export, tag lasciato invariato (guid=${guid}).`,
      );
      return null;
    }

    const base = await this.copyMediaAsset(guid);
    if (!base) {
      return null;
    }

    const referenceLabel = parseVariantLabel(referenceRow.originalName);
    const baseDimensions =
      referenceLabel && referenceLabel !== CROP_VARIANT_LABEL
        ? PRESET_DIMENSIONS[referenceLabel]
        : await this.readIntrinsicDimensions(base.buffer);

    const familyRootId = referenceRow.parentFileId ?? referenceRow.id;
    const familyRows = await this.db.db.query.fileEntity.findMany({
      where: and(
        or(eq(fileEntity.parentFileId, familyRootId), eq(fileEntity.id, familyRootId)),
        eq(fileEntity.entity, 'page-media'),
        eq(fileEntity.isActive, true),
      ),
    });

    const entriesByExtension = new Map<'avif' | 'webp', { width: number; url: string }[]>();
    for (const row of familyRows) {
      const label = parseVariantLabel(row.originalName);
      if (!label || label === CROP_VARIANT_LABEL) {
        continue;
      }
      if (row.mimeType !== 'image/avif' && row.mimeType !== 'image/webp') {
        continue;
      }
      const copied = row.guid === guid ? base : await this.copyMediaAsset(row.guid);
      if (!copied) {
        continue;
      }
      const extension = copied.extension as 'avif' | 'webp';
      const { width } = PRESET_DIMENSIONS[label];
      const entries = entriesByExtension.get(extension) ?? [];
      entries.push({ width, url: `/assets/media/${row.guid}.${extension}` });
      entriesByExtension.set(extension, entries);
    }

    const sources = (['avif', 'webp'] as const)
      .filter((extension) => entriesByExtension.has(extension))
      .map((extension) => ({
        extension,
        srcset: entriesByExtension
          .get(extension)!
          .sort((a, b) => a.width - b.width)
          .map((entry) => `${entry.url} ${entry.width}w`)
          .join(', '),
      }));

    return {
      baseUrl: `/assets/media/${guid}.${base.extension}`,
      width: baseDimensions.width,
      height: baseDimensions.height,
      sources,
    };
  }

  /**
   * Compone il markup finale per una specifica occorrenza di
   * `<img data-media-ref="guid">`, riusando le risorse già risolte
   * (`resolveMediaResources`, cacheate per `guid`) ma preservando gli
   * attributi propri di **questo** tag (`alt` in primis) — due `<img>` con
   * lo stesso `guid` ma `alt` diverso non devono collassare sullo stesso
   * markup.
   */
  private renderMediaMarkup(originalTag: string, resources: ResolvedMediaResources): string {
    const innerImg = this.augmentImgTag(
      originalTag,
      resources.baseUrl,
      resources.width,
      resources.height,
    );
    if (resources.sources.length === 0) {
      return innerImg;
    }
    const sources = resources.sources
      .map((source) => `<source type="image/${source.extension}" srcset="${source.srcset}">`)
      .join('');
    return `<picture>${sources}${innerImg}</picture>`;
  }

  /** Legge le dimensioni intrinseche di un buffer già copiato (originale o crop esplicito, mai un preset nominato). */
  private async readIntrinsicDimensions(
    buffer: Buffer,
  ): Promise<{ width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Impossibile leggere le dimensioni intrinseche del media durante l'export.");
    }
    return { width: metadata.width, height: metadata.height };
  }

  /** Riscrive `src` e inietta `width`/`height`/`aspect-ratio` su un tag `<img>` esistente, senza duplicare attributi già presenti. */
  private augmentImgTag(tag: string, srcPath: string, width: number, height: number): string {
    const withSrc = tag.replace(/\ssrc="[^"]*"/, ` src="${srcPath}"`);
    const withoutSizing = withSrc
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/\sstyle="[^"]*"/, '');
    const sizingAttrs = ` width="${width}" height="${height}" style="aspect-ratio:${width}/${height}"`;
    return withoutSizing.replace(
      /\s*\/?>\s*$/,
      (closing) => `${sizingAttrs}${closing.trimStart()}`,
    );
  }

  /** Risolve e copia un singolo media sull'export statico. Restituisce l'estensione scritta e il buffer, o `null` se il media non è servibile. */
  private async copyMediaAsset(
    guid: string,
  ): Promise<{ extension: string; buffer: Buffer } | null> {
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

    await this.deployer.write(this.resolveRelativeMediaPath(guid, extension), blob.buffer);
    return { extension, buffer: blob.buffer };
  }

  private async exportPage(
    pageId: string,
    locale: string,
    path: string,
    skipSitemapRegeneration = false,
  ): Promise<void> {
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
    const rawHtml = await response.text();
    // Il bundle CSS non dipende dal contenuto della singola pagina (è
    // condiviso da tutta la build): va copiato prima di scrivere l'HTML,
    // così un suo fallimento non lascia mai un file di pagina che referenzia
    // un `<link>` non risolvibile sull'edge (SPEC-F03 § 3.2/§ 4.3).
    await this.syncCssBundle(rawHtml);
    const html = await this.syncMediaAndRewriteHtml(rawHtml);

    const relativePath = this.resolveRelativePagePath(locale, path);
    await this.deployer.write(relativePath, html);

    await this.manifestService.upsertEntry({
      pageId,
      locale,
      path,
      contentHash: createHash('sha256').update(html).digest('hex'),
      exportedAt: new Date().toISOString(),
    });

    this.logger.log(
      `Pagina esportata: pageId=${pageId} locale=${locale} path=${path} -> ${relativePath}`,
    );

    if (!skipSitemapRegeneration) {
      await this.regenerateSitemapAndRobots();
    }
  }

  /**
   * Rimozione fisica del file statico (RFC-44, Decisione 5): un file rimasto
   * su disco resterebbe raggiungibile da Nginx anche a backend spento,
   * violando "pagina non pubblicata mai raggiungibile" in modo più grave del
   * `404` dinamico. `force: true` rende l'operazione un no-op innocuo se il
   * file non era mai stato esportato. Il tombstone non nasce mai dal fan-out
   * di un full-site rebuild (che ripubblica solo Pagine già `published`),
   * quindi rigenera sempre `sitemap.xml`/`robots.txt`, senza il flag di
   * `exportPage`.
   */
  private async tombstonePage(pageId: string, locale: string, path: string): Promise<void> {
    const relativePath = this.resolveRelativePagePath(locale, path);
    try {
      await this.deployer.remove(relativePath);
    } catch (err) {
      throw new Error(`Rimozione file statico fallita per ${path}: ${(err as Error).message}`);
    }
    await this.manifestService.removeEntry(locale, path);
    this.logger.log(
      `Tombstone applicato: pageId=${pageId} locale=${locale} path=${path} (file rimosso).`,
    );

    await this.regenerateSitemapAndRobots();
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
          // `skipSitemapRegeneration: true` — la rigenerazione di questo
          // fan-out avviene una sola volta sotto, riusando `locations` già
          // risolta: se ogni job del batch rigenerasse la propria sitemap,
          // l'O(catalogo) del rebuild diventerebbe O(catalogo²).
          this.exportService.enqueuePageExport(
            location.pageId,
            location.locale,
            location.path,
            true,
          ),
        ),
      );
    }

    this.logger.log(`Full-site export: ${locations.length} pagina/e accodata/e per il rebuild.`);

    // Riusa `locations`, già la stessa enumerazione: nessuna query
    // aggiuntiva a `pageEntity`. Ogni job di singola pagina fanned-out sopra
    // salta la propria rigenerazione (`skipSitemapRegeneration`) proprio per
    // lasciare a questa unica chiamata il compito di riflettere lo stato
    // finale del rebuild.
    await this.generateSitemapAndRobots(locations);
  }

  /**
   * Rigenera `sitemap.xml`/`robots.txt` a partire dall'enumerazione corrente
   * delle Pagine pubblicate (query fresca): usata da `exportPage`/
   * `tombstonePage` per la freshness per-pagina (pubblicazione,
   * depubblicazione, cambio slug/genitore — SPEC-F03 § 4.2 emendata su
   * richiesta esplicita). Stesso costo O(catalogo) di un full-site rebuild:
   * accettabile qui perché ogni chiamata nasce da un singolo evento, non da
   * un fan-out (che invece riusa `generateSitemapAndRobots` direttamente con
   * l'enumerazione già risolta, vedi `exportFullSite`).
   */
  private async regenerateSitemapAndRobots(): Promise<void> {
    const locations = await this.resolvePublishedPageLocations();
    await this.generateSitemapAndRobots(locations);
  }

  /**
   * Scrive `sitemap.xml`/`robots.txt` sulla radice dell'export (SPEC-F03
   * § 4.2), tramite lo stesso `StaticSiteDeployer` di ogni altro asset. La
   * sitemap elenca solo le Pagine `published` la cui Revisione pubblicata
   * non porta `seo.robotsIndex === 'noindex'` (business-rules.md § SEO,
   * regola di sistema 1) — `robots.txt` resta il default conservativo
   * dichiarato in SPEC-F03 § 4.2 (`Allow: /`), perché `app_settings` non ha
   * oggi alcun campo di indicizzazione globale da cui derivarlo (nessuna
   * colonna nuova: fuori perimetro di questo task). Chiamato sia a fine
   * full-site rebuild (`exportFullSite`, con l'enumerazione già risolta) sia
   * da `regenerateSitemapAndRobots` (freshness per-pagina).
   */
  private async generateSitemapAndRobots(locations: PublishedPageLocation[]): Promise<void> {
    const revisionIds = locations
      .map((location) => location.publishedRevisionId)
      .filter((id): id is number => id != null);

    const revisionRows =
      revisionIds.length > 0
        ? await this.db.db.query.pageRevisionEntity.findMany({
            where: inArray(pageRevisionEntity.id, revisionIds),
            columns: { id: true, seo: true },
          })
        : [];
    const robotsIndexByRevisionId = new Map(
      revisionRows.map((row) => [
        row.id,
        (row.seo as { robotsIndex?: string } | null)?.robotsIndex,
      ]),
    );

    const indexableLocations = locations.filter(
      (location) => robotsIndexByRevisionId.get(location.publishedRevisionId ?? -1) !== 'noindex',
    );

    await this.deployer.write('sitemap.xml', this.buildSitemapXml(indexableLocations));
    await this.deployer.write('robots.txt', this.buildRobotsTxt());

    this.logger.log(
      `sitemap.xml/robots.txt rigenerati (${indexableLocations.length} pagina/e indicizzabili su ${locations.length} pubblicate).`,
    );
  }

  /** Compone `sitemap.xml` (protocollo sitemaps.org), una `<url>` per Pagina indicizzabile, URL assolute su `AppConstants.staticSiteBaseUrl`. */
  private buildSitemapXml(locations: PublishedPageLocation[]): string {
    const urlEntries = locations
      .map(
        (location) =>
          `  <url><loc>${escapeXmlText(this.resolveAbsolutePublicUrl(location.path))}</loc></url>`,
      )
      .join('\n');
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `${urlEntries}\n` +
      '</urlset>\n'
    );
  }

  /** Default conservativo dichiarato in SPEC-F03 § 4.2: nessun campo di `app_settings` da cui derivare direttive di disabilitazione globale oggi. */
  private buildRobotsTxt(): string {
    const sitemapUrl = this.resolveAbsolutePublicUrl('/sitemap.xml');
    return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
  }

  /** Combina `AppConstants.staticSiteBaseUrl` con un percorso pubblico relativo, senza doppio `/`. */
  private resolveAbsolutePublicUrl(path: string): string {
    const base = AppConstants.staticSiteBaseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
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
      columns: {
        id: true,
        guid: true,
        slug: true,
        parentId: true,
        locale: true,
        publishedRevisionId: true,
      },
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
        publishedRevisionId: row.publishedRevisionId,
      });
    }
    return locations;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { JobsOptions, Queue } from 'bullmq';
import { StaticExportJobData } from './export.types';

/**
 * Priorità/retry della singola pagina (RFC-44, Decisione 4): SLA di
 * invalidazione ereditata da NFR (< 5s dal commit), quindi priorità più alta
 * (numero più basso = priorità maggiore in BullMQ) di un full-site rebuild,
 * così una rigenerazione massiva non ne ritarda la disponibilità.
 */
const SINGLE_PAGE_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
  priority: 1,
};

/** Full-site rebuild (RFC-44, Decisione 4): asincrono, mai sulla SLA dei 5s, priorità bassa. */
const FULL_SITE_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,
  priority: 20,
};

/**
 * Produttore dei job della coda BullMQ `static-export` (RFC-44). Stesso
 * pattern di `CacheInvalidationQueueService`: nessun calcolo qui, solo
 * accodamento — path/locale sono già risolti dal chiamante
 * (`PagesService`, sugli stessi punti che invalidano `PublicPageCacheService`
 * di ADR-23).
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  /** Inietta la coda BullMQ `static-export`. */
  constructor(
    @InjectQueue('static-export')
    private readonly queue: Queue<StaticExportJobData>,
  ) {}

  /**
   * Accoda la (ri)generazione del file statico di una Pagina pubblicata.
   * `skipSitemapRegeneration` è `true` solo per il fan-out interno di un
   * full-site rebuild (`ExportProcessor::exportFullSite`), che rigenera
   * `sitemap.xml`/`robots.txt` una volta sola a fine batch — ogni altro
   * chiamante (pubblicazione, cambio slug/genitore) lo lascia `false` per
   * ottenere la rigenerazione immediata per-pagina.
   */
  async enqueuePageExport(
    pageId: string,
    locale: string,
    path: string,
    skipSitemapRegeneration = false,
  ): Promise<void> {
    await this.queue.add(
      'export-page',
      { kind: 'page', pageId, locale, path, skipSitemapRegeneration },
      SINGLE_PAGE_JOB_OPTS,
    );
    this.logger.log(`Export statico accodato (pageId=${pageId}, locale=${locale}, path=${path}).`);
  }

  /** Accoda la rimozione fisica del file statico di una Pagina uscita da `published`. */
  async enqueuePageTombstone(pageId: string, locale: string, path: string): Promise<void> {
    await this.queue.add(
      'tombstone-page',
      { kind: 'tombstone', pageId, locale, path },
      SINGLE_PAGE_JOB_OPTS,
    );
    this.logger.log(
      `Tombstone statico accodato (pageId=${pageId}, locale=${locale}, path=${path}).`,
    );
  }

  /** Accoda la rigenerazione completa (cambio tema/sezione globale). */
  async enqueueFullSiteExport(): Promise<void> {
    await this.queue.add('full-site', { kind: 'full-site' }, FULL_SITE_JOB_OPTS);
    this.logger.log('Full-site export accodato.');
  }
}

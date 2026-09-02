/**
 * Payload dei job della coda BullMQ `static-export` (RFC-44, Decisione 1/3).
 * `pageId` è sempre il `guid` della Pagina (mai l'`id` numerico, CLAUDE.md §
 * Divieti assoluti) — usato solo per il manifest/i log, mai per interrogare
 * `app/public-site`, che risolve esclusivamente per `locale`+`path`.
 */
export interface PageExportJobData {
  kind: 'page';
  pageId: string;
  locale: string;
  path: string;
}

/** Rimozione del file statico su transizione fuori da `published` (RFC-44, Decisione 5). */
export interface PageTombstoneJobData {
  kind: 'tombstone';
  pageId: string;
  locale: string;
  path: string;
}

/**
 * Rigenerazione completa (tema, sezione globale — RFC-44, Decisione 3/4):
 * il processor enumera le Pagine pubblicate e fa il fan-out di job `page`
 * individuali, non renderizza nulla direttamente qui.
 */
export interface FullSiteExportJobData {
  kind: 'full-site';
}

export type StaticExportJobData = PageExportJobData | PageTombstoneJobData | FullSiteExportJobData;

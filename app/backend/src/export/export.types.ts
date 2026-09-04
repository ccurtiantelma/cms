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
  /**
   * `true` solo quando il job nasce dal fan-out di un full-site rebuild
   * (`ExportProcessor::exportFullSite`): il chiamante rigenera già
   * `sitemap.xml`/`robots.txt` una sola volta a fine fan-out, riusando
   * l'enumerazione già risolta — ogni job individuale del batch salta la
   * propria rigenerazione per non trasformare l'O(catalogo) del rebuild in
   * O(catalogo²). Assente/`false` per ogni pubblicazione/spostamento di
   * singola pagina, dove la rigenerazione per-pagina è invece voluta.
   */
  skipSitemapRegeneration?: boolean;
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

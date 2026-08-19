import type { components } from '@api-types';
import { PublicSiteConfig } from './config';

type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];

export type PreviewPageResolution =
  | { kind: 'ok'; page: PagePreviewContentDto }
  | { kind: 'not-found' }
  | { kind: 'error' };

/**
 * Legge la bozza corrente di una Pagina tramite il token di anteprima
 * (ADR-25 § 3): percorso dedicato `api/v1/preview/pages/:token`, mai
 * `app/` (richiederebbe login) né `public/` (quella superficie serve per
 * costruzione solo contenuto `published`). Nessuna cache: ogni lettura è
 * fresca, la bozza cambia in continuazione.
 *
 * Token invalido, scaduto, `purpose` errato, pagina inesistente o
 * soft-eliminata: il backend risponde sempre `404` uniforme (mai
 * `401`/`403`, ADR-25 § 3) — propagato qui senza distinzioni. Il token non
 * viene mai loggato per intero (qui non viene loggato affatto).
 */
export async function resolvePreviewPage(token: string): Promise<PreviewPageResolution> {
  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/preview/pages/${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { kind: 'error' };
  }

  if (res.status === 200) {
    const page = (await res.json()) as PagePreviewContentDto;
    return { kind: 'ok', page };
  }

  if (res.status === 404) {
    return { kind: 'not-found' };
  }

  return { kind: 'error' };
}

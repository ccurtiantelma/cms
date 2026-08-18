import type { components } from '@api-types';
import { PublicSiteConfig } from './config';

type PublicPageDto = components['schemas']['PublicPageDto'];

export type PublicPageResolution =
  | { kind: 'ok'; page: PublicPageDto }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' }
  | { kind: 'error' };

/**
 * Estrae il valore di `?path=` dalla `Location` del `308` del backend
 * (`/api/v1/public/pages?path=X`, ADR-24 § 4) per ridirigere sul percorso del
 * sito pubblico (`X`), non sul path dell'API.
 */
function extractCanonicalPath(location: string): string | null {
  try {
    return new URL(location, PublicSiteConfig.apiBaseUrl).searchParams.get('path');
  } catch {
    return null;
  }
}

/**
 * Risolve `pathname` chiamando `GET api/v1/public/pages?path=` (anonima,
 * F03/T2). `redirect: 'manual'` per poter leggere la `Location` del `308` di
 * canonicalizzazione e propagarla, non reimplementarla (ADR-24 § 4).
 */
export async function resolvePublicPage(pathname: string): Promise<PublicPageResolution> {
  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/public/pages?path=${encodeURIComponent(pathname)}`;

  let res: Response;
  try {
    res = await fetch(url, { redirect: 'manual' });
  } catch {
    return { kind: 'error' };
  }

  if (res.status === 200) {
    const page = (await res.json()) as PublicPageDto;
    return { kind: 'ok', page };
  }

  if (res.status === 308) {
    const location = res.headers.get('location');
    const canonicalPath = location ? extractCanonicalPath(location) : null;
    return canonicalPath ? { kind: 'redirect', location: canonicalPath } : { kind: 'error' };
  }

  if (res.status === 404) {
    return { kind: 'not-found' };
  }

  return { kind: 'error' };
}

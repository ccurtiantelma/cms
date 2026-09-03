import type { components } from '@api-types';
import { PublicSiteConfig } from './config';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];
type PublicPageGuidResolutionDto = components['schemas']['PublicPageGuidResolutionDto'];

export type PublicPageResolution =
  | { kind: 'ok'; page: PublicPageDto }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' }
  | { kind: 'error' };

/** Invia una pageview validata senza propagare errori al consumer HTML. */
export function ingestPageview(path: string): void {
  if (!PublicSiteConfig.analyticsIngestSecret) return;

  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/analytics/ingest/pageview`;
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Analytics-Secret': PublicSiteConfig.analyticsIngestSecret,
    },
    body: JSON.stringify({ path }),
  }).catch((error: unknown) => {
    console.error('public-site: ingest analytics non riuscito', error);
  });
}

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

/**
 * Recupera il `ThemeConfig` dell'installazione — l'oggetto salvato dall'Editor
 * tema (ADR-4) — da compilare in variabili CSS nell'head del documento SSR.
 *
 * Chiama `GET /api/v1/public/settings/theme` (`public-pages.controller.ts`),
 * superficie pubblica anonima che riusa `SettingsService.getThemeConfig()`
 * (fallback ai default di fabbrica lato backend se non e' mai stata salvata
 * alcuna riga `app_settings` con chiave `theme`).
 *
 * Tollerante ai guasti per costruzione, come `resolvePublicPage`: nessuna
 * eccezione esce da questa funzione, ne' per errore di rete/timeout ne' per
 * risposta non `200`. In quel caso restituisce `null` e il documento viene
 * servito **senza** il blocco di variabili del tema: i componenti dei blocchi
 * ricadono sui valori statici gia' dichiarati in `style-tokens.module.css`
 * (ogni `var()` li' ha un fallback), quindi la pagina resta leggibile e
 * completa - degradata nell'identita' visiva, mai mutilata nel contenuto.
 */
export async function fetchThemeConfig(): Promise<ThemeConfigDto | null> {
  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/public/settings/theme`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`public-site: theme non disponibile (status ${res.status}), nessun tema applicato`);
      return null;
    }
    return (await res.json()) as ThemeConfigDto;
  } catch (error: unknown) {
    console.error('public-site: errore di rete su theme, nessun tema applicato', error);
    return null;
  }
}

/**
 * Nessuna Sezione Globale innestata: forma restituita quando l'endpoint non è
 * raggiungibile o risponde male. Identica a ciò che il backend restituisce su
 * un'installazione in cui nessuno slot è stato assegnato (ADR-40: sempre `200`,
 * slot assente = `null`), così il render non ha un ramo "errore" separato da
 * quello "non configurato" — in entrambi i casi la Pagina si serve da sola.
 */
const NO_GLOBAL_SECTIONS: PublicActiveGlobalSectionsDto = { header: null, footer: null };

/**
 * Recupera le Sezioni Globali assegnate agli slot `header`/`footer` da innestare
 * nel layout SSR di ogni Pagina pubblica.
 *
 * Chiama `GET /api/v1/public/global-sections/active` (ADR-40), superficie
 * pubblica anonima servita dalla cache Redis. Il contenuto arriva già
 * migrato/validato/sanitizzato in scrittura: nessuna rielaborazione qui, stessa
 * fiducia nel server che `resolvePublicPage` già applica all'albero di Pagina.
 *
 * Tollerante ai guasti per costruzione, come `fetchThemeConfig`: nessuna
 * eccezione esce da questa funzione, né per errore di rete/timeout né per
 * risposta non `200`. Header e footer sono cromatura del layout, non il
 * contenuto: la loro indisponibilità degrada la pagina, non la abbatte —
 * il fallback è renderizzare i soli blocchi della Pagina.
 */
export async function fetchActiveGlobalSections(): Promise<PublicActiveGlobalSectionsDto> {
  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/public/global-sections/active`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(
        `public-site: global-sections/active non disponibile (status ${res.status}), nessun header/footer`,
      );
      return NO_GLOBAL_SECTIONS;
    }
    return (await res.json()) as PublicActiveGlobalSectionsDto;
  } catch (error: unknown) {
    console.error('public-site: errore di rete su global-sections/active, nessun header/footer', error);
    return NO_GLOBAL_SECTIONS;
  }
}

/**
 * Risolve il `pageGuid` di un `navMenuItem` (ADR-52 § 4) al percorso pubblico canonico
 * della Pagina puntata. Chiama `GET /api/v1/public/pages/by-guid/:guid` (stesso principio
 * di `resolvePublicPage`, ADR-24): `404` uniforme quando la Pagina non è pubblicata o non
 * esiste, mai un `403`, nessuna distinzione di causa.
 *
 * Tollerante ai guasti per costruzione, come `fetchThemeConfig`/`fetchActiveGlobalSections`:
 * nessuna eccezione esce mai da questa funzione. Un guid non risolvibile (`404`, errore di
 * rete, risposta malformata) produce `null` — la voce di menu resta un'etichetta senza
 * `href`, mai un link rotto (`NavMenuItemBlock.tsx`).
 */
export async function fetchPagePathByGuid(guid: string): Promise<string | null> {
  const url = `${PublicSiteConfig.apiBaseUrl}/api/v1/public/pages/by-guid/${encodeURIComponent(guid)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      // `404` è l'esito atteso per una Pagina non pubblicata/inesistente (ADR-24 § 3): non
      // è un errore da loggare, solo un link che non c'è. Ogni altro status è comunque
      // trattato allo stesso modo — nessuna distinzione di causa lato consumer.
      return null;
    }
    const body = (await res.json()) as PublicPageGuidResolutionDto;
    return body.path;
  } catch (error: unknown) {
    console.error('public-site: errore di rete su pages/by-guid, voce di menu senza link', error);
    return null;
  }
}

/**
 * Risolve in parallelo (`Promise.all`) l'intero insieme di `pageGuid` referenziati dai
 * `navMenuItem` di una Pagina (albero + Sezioni Globali header/footer, ADR-52 §
 * Conseguenze): una `Map<guid, path | null>` — `null` per ogni guid non risolvibile, mai
 * un'eccezione propagata (stesso principio di {@link fetchPagePathByGuid}). Nessuna cache
 * dedicata (ADR-52 § Conseguenze): la stessa chiave di ADR-23/ADR-40, già invalidata per
 * evento, copre indirettamente questa risoluzione a monte.
 */
export async function resolvePageGuidsToPaths(
  guids: readonly string[],
): Promise<Map<string, string | null>> {
  const uniqueGuids = Array.from(new Set(guids));
  const paths = await Promise.all(uniqueGuids.map((guid) => fetchPagePathByGuid(guid)));
  return new Map(uniqueGuids.map((guid, index) => [guid, paths[index]]));
}

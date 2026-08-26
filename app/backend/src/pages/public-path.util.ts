/**
 * Nome dello slug radice, in attesa di F05/`app_settings` (ADR-24 § 7).
 * Condiviso fra la risoluzione pubblica (T2) e l'invalidazione della cache
 * (T3): la home è raggiungibile sia da `/` sia dal proprio segmento `/home`
 * (stessa riga, due chiavi di cache — vedi `PublicPageCacheService`).
 */
export const HOME_SLUG = 'home';

/**
 * Numero massimo di segmenti di percorso accettati prima di consultare il
 * database (F03/T2). **Guardrail anti-abuso dichiarato come tale, non
 * derivato da ADR-24**: l'ADR parla di "al massimo cinque letture indicizzate"
 * come nota di performance sulla profondità tipica di una gerarchia di
 * Pagine, non come limite di validazione. Un path con più segmenti di questo
 * riceve lo stesso `404` uniforme (ADR-24 § 3) senza leggere il database.
 */
export const MAX_PUBLIC_PATH_SEGMENTS = 20;

/**
 * Forma canonica del percorso pubblico (ADR-24 § 4): minuscolo, senza slash
 * finale (eccetto la radice `/`). Pura trasformazione di stringa — non
 * dipende dall'esistenza della pagina, quindi non consulta mai il database.
 */
export function canonicalizePublicPath(rawPath: string): string {
  let path = rawPath.trim().toLowerCase();
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (path.length > 1) {
    path = path.replace(/\/+$/, '');
  }
  return path === '' ? '/' : path;
}

/** Segmenti non vuoti di un percorso già in forma canonica (`/a/b` → `['a', 'b']`, `/` → `[]`). */
export function splitPathSegments(canonicalPath: string): string[] {
  return canonicalPath.split('/').filter((segment) => segment.length > 0);
}

/** Esito dell'estrazione del prefisso di lingua da un percorso pubblico già canonico. */
export interface LocalePrefixExtraction {
  locale: string;
  residualPath: string;
}

/**
 * Estrae il prefisso di lingua da un percorso pubblico già canonico (RFC-F05
 * § 4). La lingua di default non ha mai prefisso (ADR-24 § 5): solo il primo
 * segmento è confrontato contro `activeLocales` **esclusa** `defaultLocale`.
 * Nessun match → non è un prefisso di lingua, il percorso è servito
 * interamente nella lingua di default, esattamente come prima di F05 (nessun
 * fallback: un locale non riconosciuto qui non produce mai un `404` da solo,
 * il primo segmento entra semplicemente nella risoluzione come primo slug).
 * Il confronto è case-insensitive per costruzione: `canonicalPath` è già in
 * minuscolo (`canonicalizePublicPath`), qui si abbassa solo `activeLocales`.
 */
export function extractLocalePrefix(
  canonicalPath: string,
  activeLocales: string[],
  defaultLocale: string,
): LocalePrefixExtraction {
  const segments = splitPathSegments(canonicalPath);
  const firstSegment = segments[0];
  const matchedLocale = firstSegment
    ? activeLocales.find(
        (locale) => locale !== defaultLocale && locale.toLowerCase() === firstSegment,
      )
    : undefined;

  if (!matchedLocale) {
    return { locale: defaultLocale, residualPath: canonicalPath };
  }

  const residualSegments = segments.slice(1);
  const residualPath = residualSegments.length > 0 ? `/${residualSegments.join('/')}` : '/';
  return { locale: matchedLocale, residualPath };
}

/**
 * Etichetta leggibile "browser su OS" a partire da uno User-Agent grezzo, per la
 * tab "Sessioni attive" della pagina Profilo. Riconoscimento best-effort via regex
 * (nessuna libreria di UA-parsing: dipendenza non necessaria per un'etichetta
 * indicativa, non per un fingerprint accurato).
 */

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Linux/, 'Linux'],
];

/** Restituisce un'etichetta "Browser su OS" (o solo uno dei due) da uno User-Agent, `null` se assente. */
export function parseDeviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];

  if (browser && os) return `${browser} su ${os}`;
  return browser ?? os ?? userAgent;
}

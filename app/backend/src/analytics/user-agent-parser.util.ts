/**
 * Parser User-Agent leggero e autocontenuto, basato su regex. NON è un
 * database di User-Agent (tipo `ua-parser-js`): è un'euristica volutamente
 * semplice che copre i casi comuni (desktop/mobile/tablet, i browser e i
 * sistemi operativi più diffusi) e dichiara `undefined` quando non riconosce
 * nulla, piuttosto che indovinare. Nessuna nuova dipendenza npm — CLAUDE.md,
 * "Divieti assoluti": nessuna dipendenza senza approvazione umana.
 */

export type AnalyticsDevice = 'desktop' | 'mobile' | 'tablet';

export interface ParsedUserAgent {
  device: AnalyticsDevice;
  browser?: string;
  os?: string;
}

/** Tablet prima di mobile: uno User-Agent Android senza "Mobile" è un tablet. */
function detectDevice(ua: string): AnalyticsDevice {
  const isTablet =
    /iPad/i.test(ua) || /Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isTablet) return 'tablet';

  const isMobile =
    /Mobi/i.test(ua) || /iPhone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
  if (isMobile) return 'mobile';

  return 'desktop';
}

/**
 * Ordine di precedenza obbligatorio: Edge e Opera prima di Chrome (le loro UA
 * contengono anche "Chrome"), Chrome prima di Safari (la UA di Chrome
 * contiene anche "Safari"). `undefined` se nessun token noto è presente.
 */
function detectBrowser(ua: string): string | undefined {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari';
  return undefined;
}

/** `undefined` se nessuna famiglia di OS nota è riconosciuta. */
function detectOs(ua: string): string | undefined {
  if (/Windows/i.test(ua)) return 'Windows';
  // iOS: "like Mac OS X" compare nella UA di Safari/WebKit mobile — va
  // riconosciuto come iOS e non come macOS anche senza il token iPhone/iPad
  // esplicito (es. iPod).
  if (/iPhone|iPad|iPod/i.test(ua) || /like Mac OS X/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return undefined;
}

/**
 * Estrae device/browser/os da uno User-Agent con un'euristica leggera
 * regex-based. Input assente/vuoto → `{ device: 'desktop' }` (fallback
 * prudente, mai un errore).
 */
export function parseUserAgent(ua: string | undefined): ParsedUserAgent {
  if (!ua) return { device: 'desktop' };
  return {
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}

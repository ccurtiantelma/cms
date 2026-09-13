import { canonicalizePublicPath } from '../pages/public-path.util';

/** Una riga del log JSON di `nginx-static` (`log_format edge_json`, ADR-68). */
export interface EdgeLogEntry {
  time: string;
  method: string;
  uri: string;
  status: number;
  ip: string;
  ua: string;
  referer: string;
  purpose: string;
}

/** Una visita a una Pagina, già filtrata: ancora con l'IP, che non esce da questo processo. */
export interface EdgePageview {
  path: string;
  visitedAt: Date;
  ip: string;
  userAgent: string;
  referrer?: string;
}

/**
 * Client che non sono persone: motori di ricerca, crawler AI, anteprime dei
 * social, monitor di uptime, librerie HTTP. Un bot che si finge browser passa:
 * è il limite dichiarato da ADR-68.
 */
const NON_HUMAN_AGENT =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|uptime|pingdom|lighthouse|headless|curl|wget|python|go-http|java\/|okhttp|scrapy|httpclient|axios|node-fetch/i;

/** Legge una riga del log; `null` se non è JSON o non ha la forma di `edge_json`. */
export function parseEdgeLogLine(line: string): EdgeLogEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof entry[key] === 'string' ? (entry[key] as string) : null;

  const time = text('time');
  const method = text('method');
  const uri = text('uri');
  const ip = text('ip');
  if (!time || !method || !uri || !ip || typeof entry.status !== 'number') return null;

  return {
    time,
    method,
    uri,
    status: entry.status,
    ip,
    ua: text('ua') ?? '',
    referer: text('referer') ?? '',
    purpose: text('purpose') ?? '',
  };
}

/**
 * Decide se una riga è una visita di una persona a una Pagina (ADR-68):
 * `GET` riuscito (`200`, o `304` di un browser che rivalida l'HTML in cache),
 * nessun prefetch, un user-agent umano, un percorso senza estensione di file
 * (`sitemap.xml`, `robots.txt` e `llms.txt` non sono Pagine). La query string
 * non entra nel percorso.
 */
export function toPageview(entry: EdgeLogEntry): EdgePageview | null {
  if (entry.method !== 'GET') return null;
  if (entry.status !== 200 && entry.status !== 304) return null;
  if (/prefetch|prerender/i.test(entry.purpose)) return null;
  if (entry.ua.trim() === '' || NON_HUMAN_AGENT.test(entry.ua)) return null;

  const rawPath = entry.uri.split('?')[0].split('#')[0];
  const lastSegment = rawPath.split('/').pop() ?? '';
  if (lastSegment.includes('.')) return null;

  const visitedAt = new Date(entry.time);
  if (Number.isNaN(visitedAt.getTime())) return null;

  return {
    path: canonicalizePublicPath(rawPath),
    visitedAt,
    ip: entry.ip,
    userAgent: entry.ua,
    referrer: entry.referer !== '' && entry.referer !== '-' ? entry.referer : undefined,
  };
}

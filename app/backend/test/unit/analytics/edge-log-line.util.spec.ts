import { parseEdgeLogLine, toPageview } from '../../../src/analytics/edge-log-line.util';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    time: '2026-09-13T10:15:00+00:00',
    method: 'GET',
    uri: '/chi-siamo?utm_source=newsletter',
    status: 200,
    ip: '203.0.113.7',
    ua: BROWSER_UA,
    referer: 'https://www.google.com/',
    purpose: '',
    ...overrides,
  });
}

function pageviewOf(overrides: Record<string, unknown> = {}) {
  const entry = parseEdgeLogLine(line(overrides));
  return entry ? toPageview(entry) : null;
}

describe('righe di log di nginx-static (ADR-68)', () => {
  it('una visita di un browser a una Pagina diventa una pageview, senza query string', () => {
    expect(pageviewOf()).toEqual({
      path: '/chi-siamo',
      visitedAt: new Date('2026-09-13T10:15:00Z'),
      ip: '203.0.113.7',
      userAgent: BROWSER_UA,
      referrer: 'https://www.google.com/',
    });
  });

  it('un 304 di rivalidazione è una visita: il browser ha riaperto la Pagina', () => {
    expect(pageviewOf({ status: 304 })?.path).toBe('/chi-siamo');
  });

  it.each([
    ['404', { status: 404 }],
    ['HEAD', { method: 'HEAD' }],
    ['prefetch del browser', { purpose: 'prefetch' }],
    ['bot di un motore di ricerca', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }],
    ['crawler AI', { ua: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2)' }],
    ['user-agent vuoto', { ua: '' }],
    ['file con estensione', { uri: '/sitemap.xml' }],
  ])('scarta: %s', (_label, overrides) => {
    expect(pageviewOf(overrides)).toBeNull();
  });

  it('un referer vuoto non viene registrato', () => {
    expect(pageviewOf({ referer: '' })?.referrer).toBeUndefined();
  });

  it('una riga illeggibile o incompleta viene ignorata', () => {
    expect(parseEdgeLogLine('non è json')).toBeNull();
    expect(parseEdgeLogLine(JSON.stringify({ time: 'x' }))).toBeNull();
  });
});

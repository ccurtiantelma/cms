import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import type { components } from '@api-types';

type PublicPageDto = components['schemas']['PublicPageDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';

/**
 * Pagina minima con solo blocchi vuoti: questi test riguardano
 * l'assemblaggio di `page.seo` in markup (SPEC-F03 § 4.1, PLAN-F03 T4), non
 * il rendering dei blocchi (già coperto da `escaping.spec.ts`/`critical-css.spec.ts`).
 */
function pageWithSeo(seo: Record<string, unknown>): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: { version: 1, blocks: [] },
    seo,
  };
}

/**
 * Sostituisce `fetch` per le due letture di layout di `entry-server.tsx`
 * (mock obbligatorio per i servizi esterni, CLAUDE.md § Testing) — stesso
 * pattern di `theme-ssr.spec.ts`: senza questo stub la suite chiamerebbe un
 * backend reale se raggiungibile sull'host di sviluppo, rendendo il test non
 * deterministico.
 */
function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(THEME_PATH)) {
        return new Response('boom', { status: 503 });
      }
      if (url.includes(GLOBAL_SECTIONS_PATH)) {
        return new Response(JSON.stringify({ header: null, footer: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`URL non previsto dal mock: ${url}`);
    }),
  );
}

beforeEach(() => {
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assemblaggio SEO nel documento HTML (SPEC-F03 § 4.1, PLAN-F03 T4)', () => {
  it('emette un <meta property="og:..."> solo per le chiavi OpenGraph presenti in page.seo', async () => {
    const html = await renderPageDocument(
      pageWithSeo({ ogTitle: 'Titolo OG', ogDescription: 'Descrizione OG' }),
      '/assets/style.css',
    );

    expect(html).toContain('<meta property="og:title" content="Titolo OG"/>');
    expect(html).toContain('<meta property="og:description" content="Descrizione OG"/>');
    // ogImage assente da `page.seo`: nessun tag, nemmeno vuoto.
    expect(html).not.toContain('og:image');
  });

  it('non emette alcun <meta property="og:..."> quando page.seo non porta chiavi OpenGraph', async () => {
    const html = await renderPageDocument(pageWithSeo({}), '/assets/style.css');

    expect(html).not.toContain('og:title');
    expect(html).not.toContain('og:description');
    expect(html).not.toContain('og:image');
  });

  it('emette <link rel="canonical"> con il percorso già canonico passato da entry-server/server.ts, mai un URL assoluto', async () => {
    const html = await renderPageDocument(
      pageWithSeo({}),
      '/assets/style.css',
      '',
      '/chi-siamo',
    );

    expect(html).toContain('<link rel="canonical" href="/chi-siamo"/>');
    // Percorso relativo, non un URL assoluto con dominio (stesso principio di
    // `cssHref`): il tag canonico non porta mai uno schema/host.
    const canonicalTag = html.match(/<link rel="canonical" href="[^"]*"\/>/)?.[0] ?? '';
    expect(canonicalTag).not.toMatch(/href="https?:\/\//);
  });

  it('non emette <link rel="canonical"> quando il percorso canonico non è stato passato', async () => {
    const html = await renderPageDocument(pageWithSeo({}), '/assets/style.css');

    expect(html).not.toContain('rel="canonical"');
  });

  it('serializza un unico <script type="application/ld+json"> col @graph WebPage+FAQPage combinato da SeoGraphService (ADR-48)', async () => {
    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Pagina di test' },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'Domanda?',
              acceptedAnswer: { '@type': 'Answer', text: 'Risposta.' },
            },
          ],
        },
      ],
    };

    const html = await renderPageDocument(pageWithSeo({ structuredData }), '/assets/style.css');

    const scriptMatches = html.match(/<script type="application\/ld\+json">/g) ?? [];
    expect(scriptMatches).toHaveLength(1);

    const jsonStart = html.indexOf('<script type="application/ld+json">') + '<script type="application/ld+json">'.length;
    const jsonEnd = html.indexOf('</script>', jsonStart);
    const embedded = html.slice(jsonStart, jsonEnd);
    const parsed = JSON.parse(embedded) as typeof structuredData;

    expect(parsed['@graph']).toHaveLength(2);
    expect(parsed['@graph'][0]).toMatchObject({ '@type': 'WebPage' });
    expect(parsed['@graph'][1]).toMatchObject({ '@type': 'FAQPage' });
  });

  it('non emette alcuno script ld+json quando page.seo non porta structuredData', async () => {
    const html = await renderPageDocument(pageWithSeo({}), '/assets/style.css');

    expect(html).not.toContain('application/ld+json');
  });

  it('neutralizza "</script>" dentro structuredData (campo GEO plainText non fidato) senza rompere il documento', async () => {
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Pagina di test',
      description: '</script><script>alert(1)</script>',
    };

    const html = await renderPageDocument(pageWithSeo({ structuredData }), '/assets/style.css');

    // La sequenza "</script>" grezza non deve comparire: romperebbe il tag
    // JSON-LD e permetterebbe l'iniezione di un secondo <script> eseguibile.
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('<\\/script><script>alert(1)<\\/script>');

    // Il documento resta ben formato: un solo script ld+json individuabile,
    // e il suo contenuto resta JSON valido (la barra di escape non rompe il parsing).
    const jsonStart = html.indexOf('<script type="application/ld+json">') + '<script type="application/ld+json">'.length;
    const jsonEnd = html.indexOf('</script>', jsonStart);
    const embedded = html.slice(jsonStart, jsonEnd);
    expect(() => JSON.parse(embedded)).not.toThrow();
    expect(JSON.parse(embedded)).toMatchObject({ description: '</script><script>alert(1)</script>' });
  });
});

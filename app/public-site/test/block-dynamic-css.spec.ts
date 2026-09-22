import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];
type BreakpointsDto = components['schemas']['BreakpointsDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';
const BREAKPOINTS_PATH = '/api/v1/public/settings/breakpoints';
const CSS_HREF = '/assets/style.test.css';

const ACTIVE_BREAKPOINTS: BreakpointsDto = {
  default: {},
  widescreen: { active: false, minWidth: 2400 },
  laptop: { active: false, maxWidth: 1366 },
  tabletExtra: { active: false, maxWidth: 1200 },
  tablet: { active: true, maxWidth: 1024 },
  mobileExtra: { active: false, maxWidth: 880 },
  mobile: { active: true, maxWidth: 767 },
};

/** Sostituisce `fetch` per le tre letture di layout di `entry-server.tsx` (CLAUDE.md § Testing). */
function stubApi(
  globalSections: PublicActiveGlobalSectionsDto = { header: null, footer: null },
  breakpoints: BreakpointsDto = ACTIVE_BREAKPOINTS,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(THEME_PATH)) {
        return new Response(JSON.stringify(DEFAULT_THEME_CONFIG), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(GLOBAL_SECTIONS_PATH)) {
        return new Response(JSON.stringify(globalSections), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(BREAKPOINTS_PATH)) {
        return new Response(JSON.stringify(breakpoints), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`URL non previsto dal mock: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Estrae il contenuto del blocco `<style data-block-dynamic-css>...</style>`, o `null` se assente. */
function extractDynamicStyleBlock(html: string): string | null {
  const match = html.match(/<style data-block-dynamic-css="?"?[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

/** Pagina con un `container` (Contenitore/Sezione/Colonna, ADR-82) con `background.color` impostato. */
function pageWithContainerBackground(): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 'container-1',
          type: 'container',
          v: 1,
          props: {
            background: { normal: { type: 'color', color: '#ff0000' } },
          },
          children: [
            {
              id: 'text-1',
              type: 'richText',
              v: 1,
              props: { html: '<p>Testo</p>' },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

describe('CSS dinamico per-nodo (background, ADR-96) sulla pagina pubblica', () => {
  it('inietta un <style> con background-color per un container, dopo il <link> esterno', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithContainerBackground(), CSS_HREF);
    const dynamic = extractDynamicStyleBlock(html);

    expect(dynamic).toBeTruthy();
    expect(dynamic).toContain('data-canvas-style-id="container-1"');
    expect(dynamic).toContain('background-color: #ff0000');

    expect(html.indexOf(`<link rel="stylesheet" href="${CSS_HREF}"`)).toBeLessThan(
      html.indexOf('<style data-block-dynamic-css'),
    );
  });

  it('non genera alcuna dichiarazione background per un nodo richText (fuori scope ADR-96)', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithContainerBackground(), CSS_HREF);
    const dynamic = extractDynamicStyleBlock(html);

    expect(dynamic).not.toContain('data-canvas-style-id="text-1"');
  });

  it('il DOM renderizzato porta data-canvas-style-id sul container, selettore coerente col CSS iniettato', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithContainerBackground(), CSS_HREF);

    expect(html).toContain('data-canvas-style-id="container-1"');
  });

  it('nessun <style> dinamico quando nessun nodo ha prop di stile libere (nessun elemento vuoto)', async () => {
    stubApi();
    const page: PublicPageDto = {
      title: 'Pagina senza stile libero',
      slug: 'pagina-senza-stile',
      locale: 'it-IT',
      content: {
        version: 1,
        blocks: [{ id: 'r1', type: 'richText', v: 1, props: { html: '<p>Solo testo</p>' }, children: [] }],
      },
    };

    const html = await renderPageDocument(page, CSS_HREF);

    expect(html).not.toContain('data-block-dynamic-css');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';
// Stesso identico testo CSS (classi già hashate) letto da `critical-css.ts`: usato
// qui solo per asserire per contenuto, mai per nome di classe (che è instabile fra
// build). Se questi import smettessero di combaciare con l'output di
// `buildCriticalCss`, sarebbe perché `critical-css.ts` non legge più questi stessi
// file — esattamente la regressione che questa suite deve intercettare.
import styleTokensCss from '@blocks/style-tokens.module.css?inline';
import sectionCss from '@blocks/blocks/Section.module.css?inline';
import headingCss from '@blocks/blocks/Heading.module.css?inline';
import richTextCss from '@blocks/blocks/RichText.module.css?inline';
import buttonCss from '@blocks/blocks/Button.module.css?inline';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';
const CSS_HREF = '/assets/style.test.css';

/** Sostituisce `fetch` per le due letture di layout di `entry-server.tsx` (CLAUDE.md § Testing). */
function stubApi(globalSections: PublicActiveGlobalSectionsDto = { header: null, footer: null }): void {
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
      throw new Error(`URL non previsto dal mock: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Tre Sezioni in cima all'albero: le prime due (`heading`, `richText`) sono
 * "sopra la piega" per `ABOVE_FOLD_ROOT_BLOCK_COUNT` (`critical-css.ts`), la
 * terza (`button`) no — è il caso di controllo negativo della suite.
 */
function pageWithThreeSections(): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 's1',
          type: 'section',
          v: 1,
          props: {},
          children: [{ id: 'h1', type: 'heading', v: 1, props: { level: 'h2', text: 'Sopra la piega' }, children: [] }],
        },
        {
          id: 's2',
          type: 'section',
          v: 1,
          props: {},
          children: [{ id: 'r1', type: 'richText', v: 1, props: { html: '<p>Ancora sopra</p>' }, children: [] }],
        },
        {
          id: 's3',
          type: 'section',
          v: 1,
          props: {},
          children: [{ id: 'b1', type: 'button', v: 1, props: { label: 'Sotto la piega', href: '/x' }, children: [] }],
        },
      ],
    },
  };
}

/** Estrae il contenuto del blocco `<style data-critical-css>...</style>`, o `null` se assente. */
function extractCriticalStyleBlock(html: string): string | null {
  const match = html.match(/<style data-critical-css="?"?[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

describe('CSS critico inline nel <head> (ADR-53 § 2, SPEC-F03 § 3.2)', () => {
  it('inietta un <style> non vuoto con i design token e il CSS dei blocchi above-the-fold, prima del <link> esterno', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithThreeSections(), CSS_HREF);
    const critical = extractCriticalStyleBlock(html);

    expect(critical).toBeTruthy();
    expect(critical).toContain(styleTokensCss);
    expect(critical).toContain(sectionCss);
    expect(critical).toContain(headingCss);
    expect(critical).toContain(richTextCss);

    expect(html.indexOf('<style data-critical-css')).toBeLessThan(
      html.indexOf(`<link rel="stylesheet" href="${CSS_HREF}"`),
    );
  });

  it('non inietta il CSS di blocchi che compaiono solo sotto la piega', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithThreeSections(), CSS_HREF);
    const critical = extractCriticalStyleBlock(html);

    expect(critical).not.toContain(buttonCss);
    // Il resto del foglio (button incluso) resta comunque servito, solo dal
    // link esterno: il contratto è "critico inline, resto esterno", mai una
    // rimozione del CSS non critico dal bundle.
    expect(html).toContain(`<link rel="stylesheet" href="${CSS_HREF}"`);
  });

  it('include il CSS dei blocchi della Sezione Globale header, sempre sopra la piega se presente', async () => {
    stubApi({
      header: {
        slug: 'header-principale',
        content: {
          version: 1,
          blocks: [{ id: 'hb1', type: 'button', v: 1, props: { label: 'Contattaci', href: '/contatti' }, children: [] }],
        },
      },
      footer: null,
    });

    const html = await renderPageDocument(pageWithThreeSections(), CSS_HREF);
    const critical = extractCriticalStyleBlock(html);

    expect(critical).toContain(buttonCss);
  });
});

/**
 * ADR-53 § 2: "zero-JS client-side". `renderToStaticMarkup` non emette mai
 * marcatori di idratazione di per sé; questa suite verifica che nessun
 * documento pubblico introduca uno script aggiuntivo al di fuori dell'unica
 * isola dichiarata (submit dei Form, F10-04).
 */
describe('zero-JS client-side (ADR-53 § 2)', () => {
  it('non emette alcun <script> per una Pagina senza blocchi form', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithThreeSections(), CSS_HREF, '/assets/form-submit.js');

    expect(html.toLowerCase()).not.toMatch(/<script[\s>]/);
  });

  it('emette solo l\'isola dichiarata del submit Form quando la Pagina ne contiene uno, nessun bundle di idratazione', async () => {
    stubApi();
    const page: PublicPageDto = {
      title: 'Pagina con form',
      slug: 'pagina-con-form',
      locale: 'it-IT',
      content: {
        version: 1,
        blocks: [{ id: 'f1', type: 'form', v: 1, props: { formKey: 'contatti' }, children: [] }],
      },
    };

    const html = await renderPageDocument(page, CSS_HREF, '/assets/form-submit.js');
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];

    expect(scriptTags).toHaveLength(1);
    expect(scriptTags[0]).toContain('src="/assets/form-submit.js"');
    expect(scriptTags[0]).toContain('defer');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@api-types';
import { renderErrorDocument, renderPageDocument, renderPreviewDocument } from '../src/entry-server';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';

/**
 * Il tema dell'Editor tema (ADR-4) deve vestire il **sito pubblicato**, non la
 * chrome amministrativa: questa suite verifica il capolinea di quel percorso —
 * che il `ThemeConfig` salvato arrivi davvero nell'HTML servito su ogni
 * documento, e che un backend muto non abbatta la pagina.
 */

const CSS_HREF = '/assets/style.test.css';

function page(): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        { id: 'b-1', type: 'heading', v: 1, props: { level: 'h2', text: 'CIAO' }, children: [] },
      ],
    },
  };
}

function previewPage(): PagePreviewContentDto {
  return { ...page() } as PagePreviewContentDto;
}

/**
 * Sostituisce `fetch` per le due letture di layout di `entry-server.tsx`
 * (mock obbligatorio per i servizi esterni, CLAUDE.md § Testing).
 * @param theme Tema da restituire, o `'fail'` per simulare un backend muto.
 */
function stubApi(theme: typeof DEFAULT_THEME_CONFIG | 'fail'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(THEME_PATH)) {
        if (theme === 'fail') return new Response('boom', { status: 503 });
        return new Response(JSON.stringify(theme), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tema dell\'installazione nel documento SSR', () => {
  it('porta i colori salvati dall\'Editor tema nell\'HTML della Pagina pubblicata', async () => {
    const theme = structuredClone(DEFAULT_THEME_CONFIG);
    theme.colors.primary = '#aa00bb';
    theme.light.pageBg = '#fafbfc';
    stubApi(theme);

    const html = await renderPageDocument(page(), CSS_HREF);

    expect(html).toContain('<style id="eaidos-theme-vars">');
    expect(html).toContain('--theme-primary: #aa00bb;');
    expect(html).toContain('--theme-page-bg: #fafbfc;');
    // Il ponte verso i token dei blocchi: senza questo il tema resterebbe
    // dichiarato ma invisibile sul contenuto già salvato.
    expect(html).toContain('--cms-button-bg: #aa00bb;');
  });

  it('dichiara il tema dopo il foglio dei blocchi, altrimenti non vincerebbe la cascata', async () => {
    stubApi(DEFAULT_THEME_CONFIG);

    const html = await renderPageDocument(page(), CSS_HREF);

    expect(html.indexOf(CSS_HREF)).toBeLessThan(html.indexOf('eaidos-theme-vars'));
  });

  it('segue la preferenza di sistema del visitatore per lo scheme scuro', async () => {
    const theme = structuredClone(DEFAULT_THEME_CONFIG);
    theme.dark.pageBg = '#0a0a0a';
    stubApi(theme);

    const html = await renderPageDocument(page(), CSS_HREF);

    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('--theme-page-bg: #0a0a0a;');
  });

  it('veste anche anteprima di bozza e pagine di errore, non solo la Pagina', async () => {
    const theme = structuredClone(DEFAULT_THEME_CONFIG);
    theme.colors.primary = '#010203';
    stubApi(theme);

    const preview = await renderPreviewDocument(previewPage(), CSS_HREF);
    const error = await renderErrorDocument(404, 'Pagina non trovata', CSS_HREF);

    expect(preview).toContain('--theme-primary: #010203;');
    expect(error).toContain('--theme-primary: #010203;');
  });

  it('con backend muto serve la Pagina senza tema, mai un documento mutilato', async () => {
    stubApi('fail');

    const html = await renderPageDocument(page(), CSS_HREF);

    expect(html).not.toContain('eaidos-theme-vars');
    // Il contenuto resta: l'indisponibilità del tema degrada l'identità visiva,
    // non la Pagina (i `var()` dei blocchi hanno tutti un fallback statico).
    expect(html).toContain('CIAO');
  });
});

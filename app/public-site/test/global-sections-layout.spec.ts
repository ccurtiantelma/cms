import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import type { components } from '@api-types';
import { DEFAULT_GLOBAL_TOKENS } from '../../frontend/src/libs/globalTokensCompiler';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const GLOBAL_TOKENS_PATH = '/api/v1/public/settings/global-tokens';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';

/** Albero minimo con un solo `heading`, sufficiente a riconoscere il testo nell'HTML. */
function treeWith(text: string) {
  return {
    version: 1,
    blocks: [
      {
        id: `b-${text}`,
        type: 'heading',
        v: 1,
        props: { level: 'h2', text },
        children: [],
      },
    ],
  };
}

function page(): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: treeWith('CORPO PAGINA'),
  };
}

/**
 * Sostituisce `fetch` per entrambe le letture di layout di `entry-server.tsx`
 * (Global Design Tokens e Sezioni Globali): mock obbligatorio per i servizi
 * esterni (CLAUDE.md § Testing). `globalSections === 'fail'` simula un backend
 * che non risponde — il caso che ADR-40 lascia degradare, non fallire.
 */
function stubApi(globalSections: PublicActiveGlobalSectionsDto | 'fail' | 'error'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(GLOBAL_TOKENS_PATH)) {
        // I default di fabbrica, non un `{}`: `compileTokensToCss` legge
        // `palette`/`typography`/`spacing` e un mock a forma libera farebbe
        // fallire questi test per un motivo che non è quello in esame.
        return new Response(JSON.stringify(DEFAULT_GLOBAL_TOKENS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(GLOBAL_SECTIONS_PATH)) {
        if (globalSections === 'fail') throw new Error('ECONNREFUSED');
        if (globalSections === 'error') return new Response('boom', { status: 503 });
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
 * Iniezione degli slot di layout nel documento SSR (F06, ADR-40). Si asserisce
 * sull'HTML *prodotto* da `renderToStaticMarkup`, non sui componenti: ciò che
 * conta è dove header e footer finiscono nel documento servito, non quali
 * elementi React sono stati montati per ottenerlo.
 */
describe('SSR: iniezione di header/footer dalle Sezioni Globali (ADR-40)', () => {
  it('rende lo slot header in cima al layout, prima dei blocchi della Pagina', async () => {
    stubApi({
      header: { slug: 'header-principale', content: treeWith('INTESTAZIONE') },
      footer: null,
    });

    const html = await renderPageDocument(page(), '/assets/style.css');

    expect(html).toContain('<header>');
    expect(html).toContain('INTESTAZIONE');
    // L'ordine nel documento è il punto del test: header prima di `<main>`.
    expect(html.indexOf('INTESTAZIONE')).toBeLessThan(html.indexOf('<main>'));
    expect(html.indexOf('INTESTAZIONE')).toBeLessThan(html.indexOf('CORPO PAGINA'));
    // Nessuno slot footer assegnato ⇒ nessun `<footer>` vuoto nel documento.
    expect(html).not.toContain('<footer>');
  });

  it('rende lo slot footer in fondo al documento, dopo i blocchi della Pagina', async () => {
    stubApi({
      header: null,
      footer: { slug: 'footer-principale', content: treeWith('PIEDE') },
    });

    const html = await renderPageDocument(page(), '/assets/style.css');

    expect(html).toContain('<footer>');
    expect(html.indexOf('PIEDE')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html).not.toContain('<header>');
  });

  it('rende entrambi gli slot attorno al `main` quando sono assegnati', async () => {
    stubApi({
      header: { slug: 'h', content: treeWith('INTESTAZIONE') },
      footer: { slug: 'f', content: treeWith('PIEDE') },
    });

    const html = await renderPageDocument(page(), '/assets/style.css');

    expect(html.indexOf('INTESTAZIONE')).toBeLessThan(html.indexOf('CORPO PAGINA'));
    expect(html.indexOf('CORPO PAGINA')).toBeLessThan(html.indexOf('PIEDE'));
  });

  it('senza alcuna Sezione assegnata rende i soli blocchi della Pagina, senza errori', async () => {
    stubApi({ header: null, footer: null });

    const html = await renderPageDocument(page(), '/assets/style.css');

    expect(html).toContain('CORPO PAGINA');
    expect(html).not.toContain('<header>');
    expect(html).not.toContain('<footer>');
  });

  it.each(['fail', 'error'] as const)(
    'tollera il guasto dell\'endpoint (%s): la Pagina si serve comunque, senza header/footer',
    async (mode) => {
      stubApi(mode);

      // Il punto: nessuna eccezione esce da qui. Un header non disponibile
      // degrada il documento, non lo abbatte (ADR-40 + `fetchActiveGlobalSections`).
      const html = await renderPageDocument(page(), '/assets/style.css');

      expect(html).toContain('CORPO PAGINA');
      expect(html).not.toContain('<header>');
      expect(html).not.toContain('<footer>');
    },
  );
});

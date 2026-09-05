import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import BlockRenderer from '@blocks/BlockRenderer';
import type { RenderableBlockNode } from '@blocks/types';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';

/**
 * Mock obbligatorio per il servizio esterno (CLAUDE.md § Testing): nessuna chiamata di rete
 * reale durante i test. Stesso pattern di `global-sections-layout.spec.ts` — qui senza
 * Sezioni Globali assegnate, per isolare l'asserzione dal contenuto reale di header/footer
 * (irrilevante per questo test, e potenzialmente diverso/assente a seconda dell'ambiente).
 */
function stubApiWithoutGlobalSections(): void {
  const emptyGlobalSections: PublicActiveGlobalSectionsDto = { header: null, footer: null };
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
        return new Response(JSON.stringify(emptyGlobalSections), {
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
 * RFC-58 T6 — test di regressione, indipendente dal resto della RFC (nessuna modifica di
 * schema, nessuna decisione architetturale coinvolta). Copre due comportamenti verificati
 * già corretti in `Section.tsx`/`Container.tsx` (RFC-58 § "Cosa esiste già, verificato
 * leggendo il codice", Punto 3), finora privi di un'asserzione esplicita sull'HTML SSR
 * *reale* prodotto per il consumer pubblico (`renderToStaticMarkup`, ADR-22/53).
 *
 * `app/frontend/src/components/blocks/blocks/Section.test.tsx` e `Container.test.tsx`
 * coprono già lo stesso componente sorgente a livello di unità (pipeline CSS `css:false`,
 * classi non hashate); questo file verifica lo stesso contratto sulla pipeline reale del
 * sito pubblico (`css: true`, classi CSS Modules hashate dal bundle SSR, documento intero
 * via `renderPageDocument`) — le due suite si completano, non si duplicano: un renderer
 * corretto a livello di componente isolato potrebbe comunque regredire nell'assemblaggio
 * SSR (es. un CSS globale che reintroduce `min-height` sul selettore sbagliato).
 */

/**
 * Isola il markup renderizzato (`<main>...</main>`) dal resto del documento — in
 * particolare dal `<style>` di CSS critico iniettato nel `<head>` (`critical-css.ts`), che
 * per costruzione include l'intero foglio dei design token (`style-tokens.module.css`,
 * ogni classe `maxWidth_*` vi è *dichiarata* indipendentemente da quali siano applicate
 * nella pagina) e, per il tipo `container`, anche `ContentPlaceholderBlock.module.css`
 * (che ha un proprio `min-height: 160px` su una classe distinta, `.contentPlaceholder`,
 * concatenato di proposito allo stesso foglio — vedi il commento di testa di
 * `critical-css.ts`). Un'asserzione sull'intero documento HTML confonderebbe "il selettore
 * è dichiarato nel foglio CSS" con "la classe è applicata al nodo": qui si verifica solo il
 * secondo, sul markup reale.
 */
function extractMain(html: string): string {
  const match = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!match) throw new Error('Nessun <main> trovato nel documento SSR');
  return match[1];
}

function pageWithSection(sectionProps: Record<string, unknown>): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: sectionProps,
          children: [
            { id: 'h1', type: 'heading', v: 1, props: { level: 'h2', text: 'Contenuto' }, children: [] },
          ],
        },
      ],
    },
  };
}

/**
 * ADR-33 § 1: "`maxWidth` è ignorato dal renderer quando `contentWidth = full-width`".
 * Verificato in `Section.tsx` riga 176 (`isFullWidth ? '' : resolveScalarClassName(...)`)
 * — questo test lo fissa come contratto sull'HTML pubblico reale, non solo
 * sull'osservazione del codice.
 */
describe('ADR-33 § 1 — maxWidth ignorato dal renderer pubblico quando contentWidth è full-width (RFC-58 T6)', () => {
  it('sezione full-width con maxWidth valorizzato: nessuna classe maxWidth_* nell\'HTML servito', async () => {
    stubApiWithoutGlobalSections();
    const html = await renderPageDocument(
      pageWithSection({ contentWidth: 'full-width', maxWidth: 'lg' }),
      '/assets/style.css',
    );

    const main = extractMain(html);

    expect(main).toContain('Contenuto');
    // La classe `contentWidth_full-width_*` resta emessa (comportamento invariato) — solo
    // `maxWidth_*` deve mancare **dal markup renderizzato** (il selettore resta comunque
    // dichiarato nel foglio dei token critici, vedi {@link extractMain}).
    expect(main).toMatch(/contentWidth_full-width/);
    expect(main).not.toMatch(/maxWidth_lg/);
    expect(main).not.toMatch(/maxWidth_/);
  });

  /**
   * Controllo di sensibilità: senza questo secondo caso, il test sopra passerebbe anche se
   * `maxWidth` non producesse mai alcuna classe in nessuna combinazione — non solo nel caso
   * `full-width` che ADR-33 § 1 prescrive. Stessa `maxWidth: 'lg'`, solo `contentWidth`
   * cambia: la classe deve comparire.
   */
  it('controllo di sensibilità: la stessa maxWidth "lg" produce la classe quando contentWidth è "boxed"', async () => {
    stubApiWithoutGlobalSections();
    const html = await renderPageDocument(
      pageWithSection({ contentWidth: 'boxed', maxWidth: 'lg' }),
      '/assets/style.css',
    );

    expect(extractMain(html)).toMatch(/maxWidth_lg/);
  });
});

/**
 * Un `container` figlio vuoto (nessun `children`) è comportamento CSS Flexbox standard nel
 * consumer pubblico — nessun vincolo di altezza minima, a differenza dell'affordance di
 * editing `.emptyContainer` (`min-height: 120px`, `EditorBlockWrapper.module.css`), che vive
 * solo nella dashboard admin e non è mai importata da `app/public-site` (il sito pubblico
 * monta solo `@blocks/BlockRenderer`, mai `EditorBlockWrapper`).
 */
describe('container figlio vuoto: nessun vincolo di altezza minima nel consumer pubblico (RFC-58 T6)', () => {
  function pageWithEmptyContainer(): PublicPageDto {
    return {
      title: 'Pagina di test',
      slug: 'pagina-di-test',
      locale: 'it-IT',
      content: {
        version: 1,
        blocks: [
          {
            id: 'section-1',
            type: 'section',
            v: 1,
            props: {},
            children: [{ id: 'container-empty', type: 'container', v: 1, props: {}, children: [] }],
          },
        ],
      },
    };
  }

  it('il documento SSR reale non contiene alcun min-height né una classe equivalente a .emptyContainer', async () => {
    stubApiWithoutGlobalSections();
    const html = await renderPageDocument(pageWithEmptyContainer(), '/assets/style.css');
    const main = extractMain(html);

    // Nel markup reale (non nel foglio di CSS critico, vedi {@link extractMain}) il
    // `container` vuoto è comunque presente (non omesso), solo senza vincoli di altezza: un
    // `<div>` con la sola classe di base, nessun attributo `style`, nessuna classe
    // riconducibile all'affordance di editing `.emptyContainer` o al segnaposto
    // `.contentPlaceholder`.
    expect(main).not.toMatch(/min-height/i);
    expect(main).not.toMatch(/emptyContainer/);
    expect(main).not.toMatch(/contentPlaceholder/);
    expect(main).not.toContain('style=');
    expect(main).toMatch(/<div class="[^"]*container[^"]*"><\/div>/);
  });

  /**
   * Stesso nodo, renderizzato in isolamento tramite il dispatcher `BlockRenderer` (lo stesso
   * montato da `PageView.tsx`), senza il resto del documento: isola l'asserzione dal resto
   * del layout (tema, Sezioni Globali) per escludere che l'assenza di `min-height` sopra sia
   * un effetto collaterale di qualcos'altro nel documento.
   */
  it('lo stesso nodo, renderizzato in isolamento via BlockRenderer, produce un div privo di style', () => {
    const node: RenderableBlockNode = {
      id: 'container-empty-isolated',
      type: 'container',
      props: {},
      children: [],
    };

    const html = renderToStaticMarkup(<BlockRenderer node={node} />);

    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/min-height/i);
    expect(html).not.toMatch(/emptyContainer/);
  });
});

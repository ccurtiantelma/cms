import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import type { components } from '@api-types';

type PublicPageDto = components['schemas']['PublicPageDto'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const blocksDir = join(currentDir, '../../frontend/src/components/blocks');
const publicSiteSrcDir = join(currentDir, '../src');

/**
 * Payload che colpisce ogni via di interpolazione (contenuto JSX e valore di
 * attributo): tag, entità e virgolette insieme, così un renderer che
 * dimenticasse anche solo l'escaping degli attributi verrebbe comunque
 * intercettato.
 */
const XSS_PAYLOAD = `<script>alert(1)</script>&"'<`;

function pageWithPayload(): PublicPageDto {
  return {
    title: 'Pagina di test',
    slug: 'pagina-di-test',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            { id: 'b2', type: 'heading', v: 1, props: { level: 'h2', text: XSS_PAYLOAD }, children: [] },
            { id: 'b3', type: 'image', v: 1, props: { mediaRef: 'abc', alt: XSS_PAYLOAD }, children: [] },
            { id: 'b4', type: 'button', v: 1, props: { label: XSS_PAYLOAD, href: 'https://example.com' }, children: [] },
          ],
        },
      ],
    },
  };
}

/**
 * Vincolo bloccante ereditato da ADR-21, reso esplicito da ADR-22 § 7 e
 * PLAN-F03 T6: `plainText` è persistito verbatim senza escaping (ADR-21 § 4),
 * quindi ogni renderer lo deve escapare in uscita. Si asserisce sull'HTML
 * *prodotto* da `renderToStaticMarkup`, non sul componente: un test sul
 * componente potrebbe passare per motivi diversi dall'escaping reale (es. un
 * mock di `dangerouslySetInnerHTML`).
 */
describe('invariante di escaping plainText (ADR-21 § 4, ADR-22 § 7)', () => {
  it('escapa heading.text, image.alt e button.label nell\'HTML prodotto', async () => {
    const html = await renderPageDocument(pageWithPayload(), '/assets/style.css');

    // Il payload grezzo non deve comparire da nessuna parte: né come tag
    // eseguibile né, soprattutto, come attributo capace di rompere il markup
    // circostante (es. `alt="...">` che chiuderebbe il tag prima del previsto).
    expect(html).not.toContain(XSS_PAYLOAD);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html.toLowerCase()).not.toMatch(/<script[\s>]/);

    // Forma escapata attesa da React sia in posizione di testo (heading,
    // button) sia di attributo (alt): stesso set di entità in entrambi i casi.
    const escaped = '&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#x27;&lt;';
    const occurrences = html.split(escaped).length - 1;
    expect(occurrences).toBe(3); // heading.text, image.alt, button.label
  });

  it('non tocca richText.html: già sanitizzato server-side, va servito raw', async () => {
    const richTextHtml = '<p>Testo <strong>sanitizzato</strong></p>';
    const page: PublicPageDto = {
      title: 'Pagina di test',
      slug: 'pagina-di-test',
      locale: 'it-IT',
      content: {
        version: 1,
        blocks: [{ id: 'b1', type: 'richText', v: 1, props: { html: richTextHtml }, children: [] }],
      },
    };

    const html = await renderPageDocument(page, '/assets/style.css');

    // Se richText venisse escapato una seconda volta, i tag del rich text
    // sanitizzato apparirebbero come `&lt;p&gt;` invece di renderizzare.
    expect(html).toContain(richTextHtml);
    expect(html).not.toContain('&lt;p&gt;');
  });
});

/**
 * Pagina di fixture con i sette tipi di ADR-57 (`accordion`/`accordionItem`,
 * `tabs`/`tabPanel`, `carousel`/`carouselSlide` — sia `transition:'manual-scroll'` sia
 * `'fade-loop'`, `modalTrigger`) tutti annidati correttamente (stessa forma dell'albero
 * "happy path" di `pages-blocks-widgets-interattivi.e2e-spec.ts` T7, qui riusata come
 * fixture SSR invece che come payload di validazione backend).
 */
function pageWithInteractiveWidgets(): PublicPageDto {
  return {
    title: 'Pagina widget interattivi',
    slug: 'pagina-widget-interattivi',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'accordion-1',
              type: 'accordion',
              v: 1,
              props: { exclusive: true },
              children: [
                {
                  id: 'acc-item-1',
                  type: 'accordionItem',
                  v: 1,
                  props: { title: 'Domanda 1' },
                  children: [
                    { id: 'acc-h1', type: 'heading', v: 1, props: { level: 'h3', text: 'Risposta 1' }, children: [] },
                  ],
                },
                {
                  id: 'acc-item-2',
                  type: 'accordionItem',
                  v: 1,
                  props: { title: 'Domanda 2' },
                  children: [
                    { id: 'acc-h2', type: 'heading', v: 1, props: { level: 'h3', text: 'Risposta 2' }, children: [] },
                  ],
                },
              ],
            },
            {
              id: 'tabs-1',
              type: 'tabs',
              v: 1,
              props: {},
              children: [
                {
                  id: 'tab-panel-1',
                  type: 'tabPanel',
                  v: 1,
                  props: { label: 'Scheda 1' },
                  children: [
                    { id: 'tab-h1', type: 'heading', v: 1, props: { level: 'h3', text: 'Contenuto scheda 1' }, children: [] },
                  ],
                },
                {
                  id: 'tab-panel-2',
                  type: 'tabPanel',
                  v: 1,
                  props: { label: 'Scheda 2' },
                  children: [
                    { id: 'tab-h2', type: 'heading', v: 1, props: { level: 'h3', text: 'Contenuto scheda 2' }, children: [] },
                  ],
                },
              ],
            },
            {
              id: 'carousel-manual',
              type: 'carousel',
              v: 1,
              props: { autoplay: false, transition: 'manual-scroll' },
              children: [
                {
                  id: 'car-slide-1',
                  type: 'carouselSlide',
                  v: 1,
                  props: {},
                  children: [
                    { id: 'car-img-1', type: 'image', v: 1, props: { mediaRef: 'abc', alt: 'Slide 1' }, children: [] },
                  ],
                },
                {
                  id: 'car-slide-2',
                  type: 'carouselSlide',
                  v: 1,
                  props: {},
                  children: [
                    { id: 'car-img-2', type: 'image', v: 1, props: { mediaRef: 'def', alt: 'Slide 2' }, children: [] },
                  ],
                },
              ],
            },
            {
              id: 'carousel-fade',
              type: 'carousel',
              v: 1,
              props: { autoplay: true, transition: 'fade-loop' },
              children: [
                {
                  id: 'car-fade-slide-1',
                  type: 'carouselSlide',
                  v: 1,
                  props: {},
                  children: [
                    { id: 'car-fade-h1', type: 'heading', v: 1, props: { level: 'h3', text: 'Slide loop 1' }, children: [] },
                  ],
                },
                {
                  id: 'car-fade-slide-2',
                  type: 'carouselSlide',
                  v: 1,
                  props: {},
                  children: [
                    { id: 'car-fade-h2', type: 'heading', v: 1, props: { level: 'h3', text: 'Slide loop 2' }, children: [] },
                  ],
                },
              ],
            },
            {
              id: 'modal-trigger-1',
              type: 'modalTrigger',
              v: 1,
              props: { triggerLabel: 'Apri modale', animation: 'fade' },
              children: [
                {
                  id: 'modal-btn',
                  type: 'button',
                  v: 1,
                  props: { label: 'Contenuto modale', href: 'https://example.com' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

const FORBIDDEN_SCRIPT_TAG = /<script[\s>]/i;
/** Un attributo `on*` di handler inline, es. ` onclick="..."` — richiede uno spazio prima di
 * `on` (attributo, non testo) per non generare falsi positivi su parole comuni italiane. */
const FORBIDDEN_EVENT_HANDLER_ATTR = /\son[a-z]+\s*=/i;
const FORBIDDEN_HYDRATION_ATTR = /data-reactroot|data-hydrate/i;

/**
 * Gate CI zero-JS/zero-hydration (ADR-57 § Conformità, PLAN-widget-interattivi-enterprise.md
 * T8) — stesso principio del gate di escaping `plainText` sopra: un'unica funzione di
 * asserzione riusata sia dal test positivo sull'HTML reale sia dai test di "sabotaggio" sotto,
 * che dimostrano che l'asserzione intercetta davvero i pattern vietati (script, handler `on*`,
 * attributo di hydration) e non è un placeholder che passa sempre.
 */
function assertZeroJsZeroHydration(htmlToCheck: string): void {
  expect(htmlToCheck).not.toMatch(FORBIDDEN_SCRIPT_TAG);
  expect(htmlToCheck).not.toMatch(FORBIDDEN_EVENT_HANDLER_ATTR);
  expect(htmlToCheck).not.toMatch(FORBIDDEN_HYDRATION_ATTR);
}

describe('gate CI zero-JS/zero-hydration sui sette widget interattivi (ADR-57 § Conformità, PLAN-widget-interattivi-enterprise.md T8)', () => {
  it(
    "l'HTML reale prodotto da renderToStaticMarkup per una pagina con tutti e sette i tipi " +
      'annidati correttamente non contiene <script>, handler on* o attributi di hydration, e ' +
      'contiene il markup CSS-only atteso per ciascun widget',
    async () => {
      const html = await renderPageDocument(pageWithInteractiveWidgets(), '/assets/style.css');

      // Verifica negativa (ADR-57 § Conformità): nessuno dei sette tipi carica un runtime, uno
      // script di hydration o un event listener.
      assertZeroJsZeroHydration(html);

      // Verifica positiva: markup CSS-only atteso per ciascun widget contenitore.
      // accordion/accordionItem -> <details>/<summary> nativi.
      expect(html).toContain('<details');
      expect(html).toContain('<summary');
      // tabs/tabPanel -> radio-hack CSS-only.
      expect(html).toMatch(/<input[^>]*type="radio"/);
      // carousel/carouselSlide (manual-scroll) -> ancora nativa #slide-{id}.
      expect(html).toContain('id="slide-car-slide-1"');
      expect(html).toContain('id="slide-car-slide-2"');
      // modalTrigger -> ancora #modal-{nodeId}.
      expect(html).toMatch(/href="#modal-modal-trigger-1"/);
      expect(html).toContain('id="modal-modal-trigger-1"');
    },
  );

  it(
    'il gate rileva deliberatamente uno <script> iniettato — dimostra che non è un placeholder ' +
      'che passa sempre',
    () => {
      const sabotagedHtml =
        '<div class="accordion"><details><summary>Domanda</summary></details></div>' +
        '<script>alert(1)</script>';

      expect(() => assertZeroJsZeroHydration(sabotagedHtml)).toThrow();
    },
  );

  it('il gate rileva deliberatamente un handler inline on* iniettato', () => {
    const sabotagedHtml = '<a href="#modal-trigger-1" onclick="doSomething()">Apri modale</a>';

    expect(() => assertZeroJsZeroHydration(sabotagedHtml)).toThrow();
  });

  it('il gate rileva deliberatamente un attributo di hydration iniettato (data-reactroot/data-hydrate)', () => {
    const sabotagedWithReactroot = '<div data-reactroot="">contenuto</div>';
    const sabotagedWithHydrate = '<div data-hydrate="widget-1">contenuto</div>';

    expect(() => assertZeroJsZeroHydration(sabotagedWithReactroot)).toThrow();
    expect(() => assertZeroJsZeroHydration(sabotagedWithHydrate)).toThrow();
  });
});

/**
 * `dangerouslySetInnerHTML` è ammesso in un solo punto (RichText.tsx, su HTML
 * già sanitizzato server-side). Qualunque altra occorrenza — in un altro
 * blocco o in app/public-site — è per costruzione uno XSS stored, perché
 * bypassa l'escaping che React applica altrimenti a ogni interpolazione
 * (ADR-22 § 7). Scansione statica del sorgente, non del bundle: deve
 * accorgersi della violazione prima ancora che qualcuno scriva un test per
 * il nuovo blocco che la introduce.
 */
describe('unicità di dangerouslySetInnerHTML (ADR-22 § 7)', () => {
  function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        return listSourceFiles(fullPath);
      }
      return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
    });
  }

  // L'uso reale è un prop JSX (`dangerouslySetInnerHTML={...}`): il nome
  // ricorre anche in commenti che *vietano* la prop (Button.tsx, Heading.tsx),
  // che non sono la violazione da intercettare e non devono generare falsi
  // positivi.
  const USAGE_PATTERN = /\bdangerouslySetInnerHTML\s*=/;

  it('compare esattamente una volta in components/blocks/, in RichText.tsx', () => {
    const files = listSourceFiles(blocksDir).filter((file) => !file.endsWith('.types.ts'));
    const hits = files.filter((file) => USAGE_PATTERN.test(readFileSync(file, 'utf-8')));

    expect(hits.map((file) => relative(blocksDir, file))).toEqual([join('blocks', 'RichText.tsx')]);
  });

  // Eccezioni note e **uniche**, entrambe CSS mai derivato da input utente non
  // fidato:
  // - il blocco `:root { ... }` del tema dell'installazione
  //   (`<style id="eaidos-theme-vars">`) in `ThemeStyleTag.tsx`: compilato da
  //   `generateThemeCss`, che ricontrolla ogni valore prima di emetterlo
  //   (colori sulla regex `#rrggbb`, unità e pesi su whitelist, numeri su
  //   `Number.isFinite`) — stesso principio del richText già sanitizzato
  //   server-side.
  // - il CSS critico above-the-fold (`<style data-critical-css>`, ADR-53 § 2,
  //   SPEC-F03 § 3.2) in `App.tsx`/`PreviewDocument.tsx`: testo di build,
  //   letto da `critical-css.ts` via import `?inline` degli stessi CSS Modules
  //   già compilati nel bundle esterno — nessuna interpolazione di valore
  //   proveniente da `page`/`node.props` a runtime.
  //
  // Tre file, non uno: qualunque quarto file che tornasse a iniettare CSS per
  // conto proprio (o che riducesse questo elenco) fa fallire l'asserzione.
  it("non compare in app/public-site salvo le iniezioni note di tema e CSS critico", () => {
    const files = listSourceFiles(publicSiteSrcDir);
    const hits = files.filter((file) => USAGE_PATTERN.test(readFileSync(file, 'utf-8')));

    expect(hits.sort()).toEqual(
      [
        join(publicSiteSrcDir, 'App.tsx'),
        join(publicSiteSrcDir, 'PreviewDocument.tsx'),
        join(publicSiteSrcDir, 'ThemeStyleTag.tsx'),
      ].sort(),
    );
  });
});

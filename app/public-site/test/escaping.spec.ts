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
  it('escapa heading.text, image.alt e button.label nell\'HTML prodotto', () => {
    const html = renderPageDocument(pageWithPayload(), '/assets/style.css');

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

  it('non tocca richText.html: già sanitizzato server-side, va servito raw', () => {
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

    const html = renderPageDocument(page, '/assets/style.css');

    // Se richText venisse escapato una seconda volta, i tag del rich text
    // sanitizzato apparirebbero come `&lt;p&gt;` invece di renderizzare.
    expect(html).toContain(richTextHtml);
    expect(html).not.toContain('&lt;p&gt;');
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

  it('non compare in app/public-site (server.ts, entry-server.tsx, App.tsx, ...)', () => {
    const files = listSourceFiles(publicSiteSrcDir);
    const hits = files.filter((file) => USAGE_PATTERN.test(readFileSync(file, 'utf-8')));

    expect(hits).toEqual([]);
  });
});

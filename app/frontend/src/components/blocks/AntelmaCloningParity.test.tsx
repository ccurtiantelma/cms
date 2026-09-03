/**
 * Test di parità di rendering per la fixture "Antelma Contatti" (F13-03): l'intero albero
 * `antelmaContattiTree` viene renderizzato tramite `BlockRenderer`, lo stesso dispatcher
 * che monta il sito pubblico (ADR-22 § 5) — non i singoli componenti in isolamento (già
 * coperti da `Section.test.tsx`/`FormBlock.test.tsx`/`FormFieldBlock.test.tsx`). Copre due
 * cose che solo il dispatcher può rompere anche quando ogni componente preso singolarmente
 * è corretto: che ogni nodo del `type` giusto riceva davvero le prop del motore ADR-50/
 * ADR-51 dal proprio `node.props`, e che l'intero ciclo di vita React (mount ricorsivo,
 * `key` sui figli, Error Boundary per nodo) non produca errori/warning sull'albero reale
 * di una pagina, non su frammenti isolati.
 *
 * `renderToStaticMarkup`, non `render` di Testing Library con `MantineProvider`: i
 * componenti di `components/blocks/blocks/` non importano Mantine (CLAUDE.md § Regola
 * Mantine — "i componenti dei blocchi non importano Mantine"), stesso pattern già in uso
 * in `Section.test.tsx`/`FormBlock.test.tsx`.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BlockRenderer from './BlockRenderer';
import { antelmaContattiTree } from '../../test/fixtures/antelma-contatti.seed';

function renderTree() {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const html = antelmaContattiTree
      .map((node) => renderToStaticMarkup(<BlockRenderer node={node} />))
      .join('');
    return { html, consoleError };
  } finally {
    consoleError.mockRestore();
  }
}

/**
 * Isola il markup del blocco `section` top-level all'indice `index` (0 = Hero, 1 = Form,
 * 2 = Sub-Footer CTA, 3 = Footer — stesso ordine di `antelmaContattiTree`). Non un regex
 * "dal primo `<section>` al primo `</section>` dopo il testo cercato": con più sezioni
 * concatenate un pattern simile matcherebbe dall'apertura della *prima* sezione fino alla
 * chiusura della sezione cercata, inglobando anche quelle intermedie. Lo split sul
 * delimitatore letterale `</section>` è sicuro qui perché nessun `section` è mai annidato
 * dentro un altro (il modello di contenuto lo vieta, `section.block.ts` non lo consente
 * come figlio di se stesso).
 */
function sectionHtmlByIndex(html: string, index: number): string {
  return html.split('</section>')[index] ?? '';
}

describe('AntelmaCloningParity — pagina "Antelma Contatti" (F13-03)', () => {
  it('renderizza l\'intero albero senza errori/warning React (nessun id o prop mancante)', () => {
    const { html, consoleError } = renderTree();

    expect(html.length).toBeGreaterThan(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  describe('Hero Section — sfondo immagine e overlay (ADR-50)', () => {
    it('applica immagine di sfondo, posizione/dimensione e overlay colore+opacità separati', () => {
      const { html } = renderTree();
      const heroHtml = sectionHtmlByIndex(html, 0);
      expect(heroHtml).toContain('RICHIEDI UN CONTATTO ANTELMA');

      expect(heroHtml).toContain('background-image:url(');
      expect(heroHtml).toContain('a1b2c3d4e5f60001');
      expect(heroHtml).toContain('background-position:center center');
      expect(heroHtml).toContain('background-size:cover');
      expect(heroHtml).toContain('background-color:#0c2340');
      expect(heroHtml).toContain('opacity:0.6');
      expect(heroHtml).not.toContain('rgba(');
    });

    it('il titolo hero è centrato e bianco (nessun h1: riservato al template del consumer HTML)', () => {
      const { html } = renderTree();

      expect(html).toContain('<h2');
      expect(html).toContain('RICHIEDI UN CONTATTO ANTELMA');
      expect(html).toContain('text-align:center');
      expect(html).not.toContain('<h1');
    });
  });

  describe('Sub-Footer CTA Section — sfondo immagine e overlay (ADR-50)', () => {
    it('applica lo stesso motore sfondo/overlay con colore e opacità propri della sezione', () => {
      const { html } = renderTree();
      const ctaHtml = sectionHtmlByIndex(html, 2);

      expect(ctaHtml).toContain('background-image:url(');
      expect(ctaHtml).toContain('a1b2c3d4e5f60002');
      expect(ctaHtml).toContain('background-color:#051329');
      expect(ctaHtml).toContain('opacity:0.8');
      expect(ctaHtml).toContain('<h3');
      // L'apostrofo è escapato da React in output (`&#x27;`), mai un apostrofo letterale.
      expect(ctaHtml).toContain('RIMANI IN CONNESSIONE CON L');
      expect(ctaHtml).toContain('INNOVAZIONE');
      expect(ctaHtml).toContain('ISCRIZIONE NEWSLETTER');
    });
  });

  describe('Form Section — griglia 12 colonne del Form Builder (ADR-51)', () => {
    it('i campi accoppiati (Nome/Cognome, Azienda/Telefono, Email) portano la classe colSpan a 6 colonne', () => {
      const { html } = renderTree();

      // Nome, Cognome, Azienda, Telefono, Email → 5 campi a colSpan: 6.
      expect(html.match(/colSpan_default_6/g) ?? []).toHaveLength(5);
    });

    it('Note/Messaggio e Privacy Checkbox restano a piena larghezza (colSpan: 12)', () => {
      const { html } = renderTree();

      expect(html.match(/colSpan_default_12/g) ?? []).toHaveLength(2);
      expect(html).toContain('<textarea');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('Ho letto e accetto la Privacy Policy');
    });

    it('il form porta il formKey come data-attribute e il pulsante di invio è presente', () => {
      const { html } = renderTree();

      expect(html).toContain('data-form-key="antelma-contatti"');
      expect(html).toContain('type="submit"');
      expect(html).toContain('Invia richiesta');
    });

    it("il CTA telefonico è un link `button` valido, senza una prop `variant` inesistente sul tipo", () => {
      const { html } = renderTree();

      // `button.block.ts` non dichiara `variant` (commento di testa: "nessuna prop di
      // rendering — variant, size, icon"): "danger" è approssimato in fixture con
      // `styleBackgroundColor` (kind: 'color', già nello schema), ma `Button.tsx`/
      // `BlockRenderer.tsx` non lo applicano ancora al rendering (gap pre-esistente,
      // indipendente da ADR-50/ADR-51, fuori scope qui) — la prop resta dichiarata e
      // valida server-side, il colore di sfondo non è quindi verificato in output.
      expect(html).toContain('+39 0331 651 811');
      expect(html).toContain('href="/contatti"');
      expect(html).toContain('_textColor_default_inverse');
    });
  });

  describe('Footer Section — 4 colonne e barra di copyright (F15-02)', () => {
    it('applica la classe a 4 colonne, full-width e renderizza le quattro colonne editoriali', () => {
      const { html } = renderTree();
      const footerHtml = sectionHtmlByIndex(html, 3);

      expect(footerHtml).toContain('columns_default_4');
      expect(footerHtml).toContain('contentWidth_full-width');
      expect(footerHtml).toContain('ANTELMA');
      expect(footerHtml).toContain('Partita Iva e Codice Fiscale');
      expect(footerHtml).toContain('GRUPPO ANTELMA');
      expect(footerHtml).toContain('Chi Siamo');
      expect(footerHtml).toContain('Lavora Con Noi');
      expect(footerHtml).toContain('SOLUZIONI');
      expect(footerHtml).toContain('Rete');
      expect(footerHtml).toContain('Connettività');
      expect(footerHtml).toContain('ALTRE RISORSE');
      expect(footerHtml).toContain('News');
      expect(footerHtml).toContain('Contatti');
      expect(html).toContain('Tutti i diritti riservati');
    });
  });

  it('ogni nodo dell\'albero ha un id univoco (nessuna collisione di `key` React)', () => {
    const ids: string[] = [];
    const collect = (nodes: typeof antelmaContattiTree) => {
      for (const node of nodes) {
        ids.push(node.id);
        collect(node.children as typeof antelmaContattiTree);
      }
    };
    collect(antelmaContattiTree);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

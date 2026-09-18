/**
 * Component test di `Container.tsx` `v: 2` (ADR-82-container-unificato-grid-flex.md): riscritto
 * per lo schema v2 — il layout Flex/Grid, la spaziatura e ogni altro valore libero PropKind v2
 * non sono più letti da questo componente (resi dal Runtime Style Bridge,
 * `generateCanvasCss.test.ts`), quindi non sono più asseriti qui. Questa suite copre solo ciò
 * che `Container.tsx` rende ancora direttamente: `tag` (elenco chiuso a 8 nomi), `htmlId`/
 * `cssClass`, `contentWidth`/`boxedWidth`/`minHeight`/`overflow`/`opacity` (style inline
 * mirato) e l'attributo `data-canvas-style-id` (bersaglio del CSS generato altrove).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Container from './Container';

/**
 * Lettura diretta da filesystem, non `import … from './Container.module.css?raw'`: sotto
 * Vitest (`vitest.config.ts`, `test.css: false`) qualunque import che termina in
 * `.module.css` risolve al Proxy di classi hashate a prescindere dalla query string — lo
 * stesso limite documentato in `style-tokens.test.ts`, non aggirabile con `?raw`.
 */
const containerCss = readFileSync(
  resolve(process.cwd(), 'src/components/blocks/blocks/Container.module.css'),
  'utf-8',
);

describe('Container (v2)', () => {
  it('senza alcuna prop: solo la classe di base, tag <div>, nessun attributo style', () => {
    const html = renderToStaticMarkup(<Container id="b1">Contenuto</Container>);

    expect(html).not.toContain('style=');
    expect(html).toMatch(/^<div class="[^"]*container[^"]*"/);
  });

  it('porta sempre `data-canvas-style-id` con il valore di `id` (bersaglio del Runtime Style Bridge)', () => {
    const html = renderToStaticMarkup(<Container id="node-42">Contenuto</Container>);

    expect(html).toContain('data-canvas-style-id="node-42"');
  });

  describe('tag (kind: enum, elenco chiuso a 8 nomi)', () => {
    it('assente → <div>', () => {
      const html = renderToStaticMarkup(<Container id="b1">x</Container>);
      expect(html).toMatch(/^<div[ >]/);
    });

    it('valore ammesso (es. "section") → tag reso corrispondente', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" tag="section">
          x
        </Container>,
      );
      expect(html).toMatch(/^<section[ >]/);
      expect(html).toContain('</section>');
    });

    it("valore fuori dall'elenco chiuso → ricade su <div>, nessun errore", () => {
      expect(() =>
        renderToStaticMarkup(
          <Container id="b1" tag="script">
            x
          </Container>,
        ),
      ).not.toThrow();
      const html = renderToStaticMarkup(
        <Container id="b1" tag="script">
          x
        </Container>,
      );
      expect(html).toMatch(/^<div[ >]/);
    });
  });

  describe('htmlId/cssClass (rinominate da customElementId/customCssClass di container v1, ADR-82 § "Decisione" punto 4)', () => {
    it('htmlId stringa → id HTML', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" htmlId="hero">
          x
        </Container>,
      );
      expect(html).toContain('id="hero"');
    });

    it('cssClass stringa → classe aggiuntiva accanto a quella di base', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" cssClass="my-custom-class">
          x
        </Container>,
      );
      expect(html).toContain('my-custom-class');
      expect(html).toMatch(/class="[^"]*container[^"]*my-custom-class[^"]*"/);
    });
  });

  describe('prop scalari semplici rese con style inline mirato', () => {
    it('opacity numerica → opacity inline', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" opacity={0.5}>
          x
        </Container>,
      );
      expect(html).toContain('style="opacity:0.5"');
    });

    it('minHeight (UnitValue) → min-height inline', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" minHeight={{ value: 400, unit: 'px' }}>
          x
        </Container>,
      );
      expect(html).toContain('min-height:400px');
    });

    it('contentWidth "boxed" + boxedWidth → max-width inline centrato', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" contentWidth="boxed" boxedWidth={{ value: 1200, unit: 'px' }}>
          x
        </Container>,
      );
      expect(html).toContain('max-width:1200px');
      expect(html).toContain('margin-left:auto');
      expect(html).toContain('margin-right:auto');
    });

    it('contentWidth "full" → nessun max-width, anche con boxedWidth presente', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" contentWidth="full" boxedWidth={{ value: 1200, unit: 'px' }}>
          x
        </Container>,
      );
      expect(html).not.toContain('max-width');
    });

    it('overflow tra i tre valori ammessi → overflow inline', () => {
      const html = renderToStaticMarkup(
        <Container id="b1" overflow="hidden">
          x
        </Container>,
      );
      expect(html).toContain('overflow:hidden');
    });

    it("overflow fuori dall'elenco chiuso → nessuno stile inline, nessun errore", () => {
      expect(() =>
        renderToStaticMarkup(
          <Container id="b1" overflow="scroll">
            x
          </Container>,
        ),
      ).not.toThrow();
      const html = renderToStaticMarkup(
        <Container id="b1" overflow="scroll">
          x
        </Container>,
      );
      expect(html).not.toContain('style=');
    });

    it('valore malformato (minHeight senza `unit`) → nessuno stile inline, nessun errore (tolleranza di rendering)', () => {
      expect(() =>
        renderToStaticMarkup(
          <Container id="b1" minHeight={{ value: 400 }}>
            x
          </Container>,
        ),
      ).not.toThrow();
    });
  });

  /**
   * Regressione overflow orizzontale: come `Section.test.tsx`, asserzioni sul CSS sorgente
   * via lettura filesystem — sotto `test.css: false` (`vitest.config.ts`) l'HTML reso da
   * `renderToStaticMarkup` non porta le regole delle classi CSS Modules.
   */
  describe('anti-overflow orizzontale', () => {
    it('.container azzera il proprio min-width e spezza il testo troppo lungo per la propria porzione flex', () => {
      expect(containerCss).toMatch(/\.container\s*{[^}]*min-width:\s*0;/s);
      expect(containerCss).toMatch(/\.container\s*{[^}]*overflow-wrap:\s*anywhere;/s);
      expect(containerCss).toMatch(/\.container\s*{[^}]*word-break:\s*break-word;/s);
    });
  });
});

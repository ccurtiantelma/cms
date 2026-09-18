/**
 * Component test di `GalleryBlock.tsx` (`PLAN-parita-elementor-pro.md` § R4): copre solo ciò
 * che il componente rende direttamente — `data-canvas-style-id` (bersaglio del Runtime Style
 * Bridge per `layout`, non asserito qui, vedi `generateCanvasCss.test.ts`), `data-gallery-mode`
 * (default `grid` incluso), `data-lightbox` (presente solo se `lightbox === true`),
 * `customCssClass`/`customElementId` e il rendering dei `children` passati.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GalleryBlock from './GalleryBlock';

describe('GalleryBlock', () => {
  it('senza alcuna prop: classe di base, nessun id HTML, data-gallery-mode="grid"', () => {
    const html = renderToStaticMarkup(<GalleryBlock>Contenuto</GalleryBlock>);

    expect(html).toMatch(/^<div class="[^"]*gallery[^"]*"/);
    expect(html).not.toContain(' id=');
    expect(html).toContain('data-gallery-mode="grid"');
  });

  it('porta sempre `data-canvas-style-id` con il valore di `id` (bersaglio del Runtime Style Bridge)', () => {
    const html = renderToStaticMarkup(<GalleryBlock id="node-42">Contenuto</GalleryBlock>);

    expect(html).toContain('data-canvas-style-id="node-42"');
  });

  describe('galleryMode (kind: enum, default "grid")', () => {
    it('assente → data-gallery-mode="grid"', () => {
      const html = renderToStaticMarkup(<GalleryBlock>x</GalleryBlock>);
      expect(html).toContain('data-gallery-mode="grid"');
    });

    it('valore fuori dall\'elenco chiuso → ricade su "grid", nessun errore', () => {
      expect(() =>
        renderToStaticMarkup(<GalleryBlock galleryMode="carousel">x</GalleryBlock>),
      ).not.toThrow();
      const html = renderToStaticMarkup(<GalleryBlock galleryMode="carousel">x</GalleryBlock>);
      expect(html).toContain('data-gallery-mode="grid"');
    });

    it('"masonry" → data-gallery-mode="masonry"', () => {
      const html = renderToStaticMarkup(<GalleryBlock galleryMode="masonry">x</GalleryBlock>);
      expect(html).toContain('data-gallery-mode="masonry"');
    });

    it('"metro" → data-gallery-mode="metro"', () => {
      const html = renderToStaticMarkup(<GalleryBlock galleryMode="metro">x</GalleryBlock>);
      expect(html).toContain('data-gallery-mode="metro"');
    });
  });

  describe('lightbox (kind: boolean, solo persistito — nessun runtime JS, R5)', () => {
    it('assente → nessun attributo data-lightbox', () => {
      const html = renderToStaticMarkup(<GalleryBlock>x</GalleryBlock>);
      expect(html).not.toContain('data-lightbox');
    });

    it('lightbox === false → nessun attributo data-lightbox (mai "false" letterale)', () => {
      const html = renderToStaticMarkup(<GalleryBlock lightbox={false}>x</GalleryBlock>);
      expect(html).not.toContain('data-lightbox');
    });

    it('lightbox === true → data-lightbox="true"', () => {
      const html = renderToStaticMarkup(<GalleryBlock lightbox={true}>x</GalleryBlock>);
      expect(html).toContain('data-lightbox="true"');
    });

    it('valore malformato (non booleano) → nessun attributo data-lightbox, nessun errore', () => {
      expect(() =>
        renderToStaticMarkup(<GalleryBlock lightbox="true">x</GalleryBlock>),
      ).not.toThrow();
      const html = renderToStaticMarkup(<GalleryBlock lightbox="true">x</GalleryBlock>);
      expect(html).not.toContain('data-lightbox');
    });
  });

  describe('customCssClass/customElementId', () => {
    it('customElementId stringa → id HTML', () => {
      const html = renderToStaticMarkup(
        <GalleryBlock customElementId="galleria-hero">x</GalleryBlock>,
      );
      expect(html).toContain('id="galleria-hero"');
    });

    it('customElementId assente/vuoto → nessun id HTML', () => {
      const html = renderToStaticMarkup(<GalleryBlock customElementId="">x</GalleryBlock>);
      expect(html).not.toContain(' id=');
    });

    it('customCssClass stringa → classe aggiuntiva accanto a quella di base', () => {
      const html = renderToStaticMarkup(
        <GalleryBlock customCssClass="my-custom-class">x</GalleryBlock>,
      );
      expect(html).toMatch(/class="[^"]*gallery[^"]*my-custom-class[^"]*"/);
    });

    it('customCssClass assente/vuota → solo la classe di base', () => {
      const html = renderToStaticMarkup(<GalleryBlock customCssClass="">x</GalleryBlock>);
      expect(html).toMatch(/^<div class="[^"]*gallery[^"]*"[^>]*>x<\/div>$/);
    });
  });

  it('renderizza i children passati (i nodi `image` della galleria)', () => {
    const html = renderToStaticMarkup(
      <GalleryBlock>
        <img alt="uno" src="/one.jpg" />
        <img alt="due" src="/two.jpg" />
      </GalleryBlock>,
    );

    expect(html).toContain('alt="uno"');
    expect(html).toContain('alt="due"');
  });
});

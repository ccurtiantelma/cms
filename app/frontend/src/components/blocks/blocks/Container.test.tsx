/**
 * Component test di `Container.tsx` (ADR-39/41): nessuna suite dedicata esisteva prima di
 * questo file (SPEC-F04-grid-responsive-engine.md § 6, gap 2). Copre le sei props di layout
 * flex, `styleFlexBasis` (`kind: 'unitValue'`, unità `%`), i colori (`styleBackgroundColor`/
 * `styleColor`) e il vincolo T8 (ADR-29 Conseguenza / ADR-39 Conseguenza): un valore salvato
 * con tutti e tre i breakpoint deve produrre tutte e tre le classi nell'HTML reso, mai solo
 * `default` — stesso principio già coperto per `Section.tsx`.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Container from './Container';

describe('Container', () => {
  it('senza alcuna prop di stile: nessun attributo style, solo la classe di base', () => {
    const html = renderToStaticMarkup(<Container>Contenuto</Container>);

    expect(html).not.toContain('style=');
  });

  /**
   * Test di regressione RFC-58 T6 (Punto 3, seconda metà): un `container` figlio senza
   * `children` non deve ricevere alcun vincolo di altezza minima — comportamento CSS
   * Flexbox standard (nessun `min-height` in `Container.module.css`), deliberatamente
   * diverso dall'affordance di editing `.emptyContainer` (`min-height: 120px`) che vive
   * solo in `EditorBlockWrapper.module.css`, mai in questo componente. Questo componente è
   * lo stesso montato dal consumer SSR pubblico (`app/public-site`, alias `@blocks`): vedi
   * `app/public-site/test/section-container-layout-regression.spec.tsx` per l'asserzione
   * equivalente sull'HTML SSR reale.
   */
  it('senza children (container vuoto): nessun attributo style, nessun min-height, nessuna classe emptyContainer', () => {
    const html = renderToStaticMarkup(<Container>{null}</Container>);

    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/min-height/i);
    expect(html).not.toMatch(/emptyContainer/);
    // Solo la classe di base `container` (nessuna prop di layout passata): stesso pattern
    // di corrispondenza sostringa già in uso nel resto della suite (le classi CSS Modules
    // sono hashate anche in questa pipeline di test, es. `_container_bb9328`).
    expect(html).toMatch(/^<div class="[^"]*container[^"]*"><\/div>$/);
  });

  /**
   * `display` non produce mai una classe dedicata (ADR-39 § 2 punto 1, commento di testa di
   * `Container.tsx`): un solo valore possibile in questo round, già cablato in
   * `Container.module.css` senza bisogno di un token — qualunque cosa arrivi in questa prop
   * non deve mai far crashare il rendering.
   */
  it('display non genera alcuna classe dedicata, qualunque sia il valore ricevuto', () => {
    const html = renderToStaticMarkup(<Container display="flex">Contenuto</Container>);

    expect(html).not.toContain('display_');
  });

  describe('props di layout flex responsive (ADR-39)', () => {
    it('flexDirection: solo `default` presente → solo la classe default', () => {
      const html = renderToStaticMarkup(
        <Container flexDirection={{ default: 'column' }}>Contenuto</Container>,
      );

      expect(html).toContain('flexDirection_default_column');
      expect(html).not.toContain('flexDirection_tablet_');
      expect(html).not.toContain('flexDirection_mobile_');
    });

    /**
     * T8 (SPEC-F04-grid-responsive-engine.md § 6): tutti e tre i breakpoint presenti nel
     * valore salvato devono produrre tutte e tre le classi, mai solo `default`.
     */
    it('flexDirection con tutti e tre i breakpoint produce le tre classi, non solo default', () => {
      const html = renderToStaticMarkup(
        <Container flexDirection={{ default: 'row', tablet: 'column', mobile: 'column-reverse' }}>
          Contenuto
        </Container>,
      );

      expect(html).toContain('flexDirection_default_row');
      expect(html).toContain('flexDirection_tablet_column');
      expect(html).toContain('flexDirection_mobile_column-reverse');
    });

    it('justifyContent: emette la classe del token salvato', () => {
      const html = renderToStaticMarkup(
        <Container justifyContent={{ default: 'space-between' }}>Contenuto</Container>,
      );

      expect(html).toContain('justifyContent_default_space-between');
    });

    it('alignItems: emette la classe del token salvato', () => {
      const html = renderToStaticMarkup(
        <Container alignItems={{ default: 'center' }}>Contenuto</Container>,
      );

      expect(html).toContain('alignItems_default_center');
    });

    it('wrap: emette la classe del token salvato', () => {
      const html = renderToStaticMarkup(
        <Container wrap={{ default: 'wrap' }}>Contenuto</Container>,
      );

      expect(html).toContain('wrap_default_wrap');
    });

    it('gap con tutti e tre i breakpoint produce le tre classi, non solo default', () => {
      const html = renderToStaticMarkup(
        <Container gap={{ default: 'lg', tablet: 'md', mobile: 'sm' }}>Contenuto</Container>,
      );

      expect(html).toContain('gap_default_lg');
      expect(html).toContain('gap_tablet_md');
      expect(html).toContain('gap_mobile_sm');
    });
  });

  describe('styleFlexBasis (kind: unitValue, %) — ADR-38 § 2', () => {
    it('valore { value, unit } valido → flex-basis e flex-grow:0 inline, mai una classe', () => {
      const html = renderToStaticMarkup(
        <Container styleFlexBasis={{ value: 33, unit: '%' }}>Contenuto</Container>,
      );

      expect(html).toContain('style="flex-basis:33%;flex-grow:0"');
    });

    it('valore malformato (manca `unit`) → nessuno stile inline, nessun errore (tolleranza di rendering)', () => {
      expect(() =>
        renderToStaticMarkup(<Container styleFlexBasis={{ value: 33 }}>Contenuto</Container>),
      ).not.toThrow();

      const html = renderToStaticMarkup(
        <Container styleFlexBasis={{ value: 33 }}>Contenuto</Container>,
      );
      expect(html).not.toContain('flex-basis');
      expect(html).not.toContain('style=');
    });

    it('valore assente → nessuno stile inline', () => {
      const html = renderToStaticMarkup(<Container>Contenuto</Container>);

      expect(html).not.toContain('flex-basis');
    });
  });

  describe('colori (kind: color) — ADR-33 § 3', () => {
    it('styleBackgroundColor → background-color inline', () => {
      const html = renderToStaticMarkup(
        <Container styleBackgroundColor="#abcdef">Contenuto</Container>,
      );

      expect(html).toContain('style="background-color:#abcdef"');
    });

    it('styleColor da solo → solo color inline, mai background-color', () => {
      const html = renderToStaticMarkup(<Container styleColor="#ffffff">Contenuto</Container>);

      expect(html).toContain('style="color:#ffffff"');
      expect(html).not.toContain('background-color');
    });

    it('styleBackgroundColor e styleColor insieme → entrambi inline, stesso nodo', () => {
      const html = renderToStaticMarkup(
        <Container styleBackgroundColor="#111111" styleColor="#ffffff">
          Contenuto
        </Container>,
      );

      expect(html).toContain('style="background-color:#111111;color:#ffffff"');
    });
  });
});

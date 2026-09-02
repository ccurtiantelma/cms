import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Section from './Section';

describe('Section', () => {
  it('renderizza il colore di sfondo nell attributo style', () => {
    const html = renderToStaticMarkup(<Section styleBackgroundColor="#123456">Contenuto</Section>);

    expect(html).toContain('style="background-color:#123456"');
  });

  /**
   * T8 (SPEC-F04-grid-responsive-engine.md § 6): il renderer deve emettere **una classe per
   * ogni breakpoint presente nel valore salvato**, mai solo `default` — vincolo esplicito di
   * ADR-29 Conseguenza / ADR-31 Conseguenza. Un renderer che ignora `tablet`/`mobile` perde
   * silenziosamente contenuto già salvato in bozze precedenti.
   */
  describe('props di layout a colonne responsive (ADR-31, T8)', () => {
    it('columns con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section columns={{ default: '2', tablet: '3', mobile: '1' }}>Contenuto</Section>,
      );

      expect(html).toContain('columns_default_2');
      expect(html).toContain('columns_tablet_3');
      expect(html).toContain('columns_mobile_1');
    });

    it('gap con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section gap={{ default: 'lg', tablet: 'md', mobile: 'sm' }}>Contenuto</Section>,
      );

      expect(html).toContain('gap_default_lg');
      expect(html).toContain('gap_tablet_md');
      expect(html).toContain('gap_mobile_sm');
    });

    it('alignItems con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section alignItems={{ default: 'center', tablet: 'flex-start', mobile: 'flex-end' }}>
          Contenuto
        </Section>,
      );

      expect(html).toContain('alignItems_default_center');
      expect(html).toContain('alignItems_tablet_flex-start');
      expect(html).toContain('alignItems_mobile_flex-end');
    });

    it('solo `default` presente → solo la classe default, mai tablet/mobile inventate', () => {
      const html = renderToStaticMarkup(<Section columns={{ default: '4' }}>Contenuto</Section>);

      expect(html).toContain('columns_default_4');
      expect(html).not.toContain('columns_tablet_');
      expect(html).not.toContain('columns_mobile_');
    });
  });
});

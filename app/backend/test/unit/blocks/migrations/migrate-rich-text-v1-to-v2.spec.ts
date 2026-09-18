import { Logger } from '@nestjs/common';
import { migrateRichTextV1ToV2 } from '../../../../src/blocks/migrations/migrate-rich-text-v1-to-v2';

/** Copertura di `migrateRichTextV1ToV2` (ADR-81 § "Decisione" punto 2, stessa tabella di `heading`). */
describe('migrateRichTextV1ToV2', () => {
  it('html invariato, color/typography/margin/hideOn calcolati con default sicuri su props vuote', () => {
    const result = migrateRichTextV1ToV2({ html: '<p>Ciao</p>' });
    expect(result.html).toBe('<p>Ciao</p>');
    expect(result.color).toEqual({ normal: { default: { ref: 'text' } } });
    expect(result.margin).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
    expect(result.hideOn).toEqual([]);
  });

  it('margini con unità miste: forza px, azzera i lati non-px, logga warning', () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const result = migrateRichTextV1ToV2({
      html: '<p>x</p>',
      styleMarginTop: { value: 4, unit: '%' },
      styleMarginRight: { value: 8, unit: 'px' },
    });
    expect(result.margin).toEqual({
      default: { top: 0, right: 8, bottom: 0, left: 0, unit: 'px', linked: false },
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('le quattro prop colore "fallback" (styleBackgroundColor/styleColor/backgroundColor/color) sono scartate', () => {
    const result = migrateRichTextV1ToV2({
      html: '<p>x</p>',
      styleBackgroundColor: '#111111',
      styleColor: '#222222',
      backgroundColor: '#333333',
      color: '#444444',
    });
    expect(result).not.toHaveProperty('styleBackgroundColor');
    expect(result).not.toHaveProperty('styleColor');
    expect(result).not.toHaveProperty('backgroundColor');
    // `color` v1 (kind 'color') è rimpiazzata dal nuovo `color: colorRef` calcolato dalla migrazione,
    // non dal valore letterale scartato.
    expect(result.color).toEqual({ normal: { default: { ref: 'text' } } });
  });

  it("nessuna prop v1 sostituita sopravvive nell'output", () => {
    const result = migrateRichTextV1ToV2({
      html: '<p>x</p>',
      styleTextColor: { default: 'accent' },
      styleFontSize: { default: 'lg' },
      styleFontWeight: { default: 'bold' },
      styleFontFamily: { default: 'roboto' },
      styleHideDesktop: true,
      styleMarginTop: { value: 1, unit: 'px' },
    });
    for (const key of [
      'styleTextColor',
      'styleFontSize',
      'styleFontWeight',
      'styleFontFamily',
      'styleHideDesktop',
      'styleMarginTop',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('props totalmente vuote producono comunque un output valido (funzione totale)', () => {
    expect(() => migrateRichTextV1ToV2({})).not.toThrow();
  });
});

import { migrateButtonV1ToV2 } from '../../../../src/blocks/migrations/migrate-button-v1-to-v2';

/** Copertura di `migrateButtonV1ToV2` (ADR-81 § "Decisione" punto 2, riga `href`). */
describe('migrateButtonV1ToV2', () => {
  it('href valido migra a link.href invariato, target/rel di default', () => {
    const result = migrateButtonV1ToV2({ label: 'Vai', href: 'https://esempio.it/pagina' });
    expect(result.link).toEqual({ href: 'https://esempio.it/pagina', target: '_self', rel: [] });
  });

  it('href root-relative/mailto è accettato invariato', () => {
    expect(
      (migrateButtonV1ToV2({ label: 'Vai', href: '/contatti' }).link as Record<string, unknown>)
        .href,
    ).toBe('/contatti');
    expect(
      (migrateButtonV1ToV2({ label: 'Vai', href: 'mailto:a@b.it' }).link as Record<string, unknown>)
        .href,
    ).toBe('mailto:a@b.it');
  });

  it('href assente o malformato migra al default sicuro "/" (mai un valore che farebbe fallire la validazione a valle)', () => {
    expect((migrateButtonV1ToV2({ label: 'Vai' }).link as Record<string, unknown>).href).toBe('/');
    expect(
      (
        migrateButtonV1ToV2({ label: 'Vai', href: 'javascript:alert(1)' }).link as Record<
          string,
          unknown
        >
      ).href,
    ).toBe('/');
    expect(
      (migrateButtonV1ToV2({ label: 'Vai', href: 42 }).link as Record<string, unknown>).href,
    ).toBe('/');
  });

  it('color/typography/margin/hideOn calcolati come per heading/richText (button non aveva mai styleTextColorCustom/styleFontSizeCustom)', () => {
    const result = migrateButtonV1ToV2({
      label: 'Vai',
      href: '/',
      styleTextColor: { default: 'accent' },
      styleFontSize: { default: 'lg' },
    });
    expect(result.color).toEqual({ normal: { default: { ref: 'accent' } } });
    const typographyNormal = (result.typography as Record<string, Record<string, unknown>>).normal;
    expect(typographyNormal.fontSize).toEqual({ default: { value: 20, unit: 'px' } });
  });

  it('le quattro prop colore "fallback" sono scartate', () => {
    const result = migrateButtonV1ToV2({
      label: 'Vai',
      href: '/',
      styleBackgroundColor: '#111111',
      styleColor: '#222222',
      backgroundColor: '#333333',
      color: '#444444',
    });
    expect(result).not.toHaveProperty('styleBackgroundColor');
    expect(result).not.toHaveProperty('styleColor');
    expect(result).not.toHaveProperty('backgroundColor');
  });

  it("nessuna prop v1 sostituita sopravvive nell'output, incluso href", () => {
    const result = migrateButtonV1ToV2({
      label: 'Vai',
      href: 'https://esempio.it',
      styleTextColor: { default: 'accent' },
      styleFontSize: { default: 'lg' },
      styleFontWeight: { default: 'bold' },
      styleFontFamily: { default: 'roboto' },
      styleHideDesktop: true,
      styleMarginTop: { value: 1, unit: 'px' },
    });
    for (const key of [
      'href',
      'styleTextColor',
      'styleFontSize',
      'styleFontWeight',
      'styleFontFamily',
      'styleHideDesktop',
      'styleMarginTop',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    expect(result).toHaveProperty('link');
  });

  it('props totalmente vuote producono comunque un output valido (funzione totale)', () => {
    expect(() => migrateButtonV1ToV2({})).not.toThrow();
  });
});

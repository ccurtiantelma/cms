import { composePublicPath, extractLocalePrefix } from '../../../src/pages/public-path.util';

describe('composePublicPath (ADR-24 § 5-7, ADR-65)', () => {
  const activeLocales = ['it-IT', 'en-GB'];
  const defaultLocale = 'it-IT';

  it('lingua di default: percorso senza prefisso', () => {
    expect(composePublicPath('it-IT', '/chi-siamo/team', defaultLocale)).toBe('/chi-siamo/team');
  });

  it('altra lingua: prefisso di lingua in forma canonica minuscola', () => {
    expect(composePublicPath('en-GB', '/about-us', defaultLocale)).toBe('/en-gb/about-us');
  });

  it('home radice: "/" nella lingua di default, il solo prefisso nelle altre', () => {
    expect(composePublicPath('it-IT', '/home', defaultLocale)).toBe('/');
    expect(composePublicPath('en-GB', '/home', defaultLocale)).toBe('/en-gb');
  });

  it('una Pagina "home" non radice mantiene il proprio segmento', () => {
    expect(composePublicPath('it-IT', '/servizi/home', defaultLocale)).toBe('/servizi/home');
  });

  it("è l'inverso di extractLocalePrefix", () => {
    const composed = composePublicPath('en-GB', '/about-us', defaultLocale);
    expect(extractLocalePrefix(composed, activeLocales, defaultLocale)).toEqual({
      locale: 'en-GB',
      residualPath: '/about-us',
    });
  });
});

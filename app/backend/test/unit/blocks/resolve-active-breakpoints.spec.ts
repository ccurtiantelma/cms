import { BreakpointsValue, resolveActiveBreakpoints } from '../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata al Sub-Task S1.3 (`docs/ai/adr/ADR-76-breakpoints-configurabili.md`
 * § "Conseguenze"): `resolveActiveBreakpoints()` è il punto unico che incrocia
 * l'unione chiusa dei 7 nomi con lo stato di attivazione per sito, riusato sia
 * dal validatore (indirettamente, tramite `FontAllowlist`/`fontAllowlist` non
 * c'entra qui) sia dal compilatore CSS.
 */
describe('resolveActiveBreakpoints() (ADR-76 § "Decisione" punto 1/3/4)', () => {
  /** Default di fabbrica ADR-76 § "Decisione" punto 1: tablet+mobile attivi, il resto no. */
  const DEFAULT_BREAKPOINTS: BreakpointsValue = {
    default: {},
    widescreen: { active: false, minWidth: 2400 },
    laptop: { active: false, maxWidth: 1366 },
    tabletExtra: { active: false, maxWidth: 1200 },
    tablet: { active: true, maxWidth: 1024 },
    mobileExtra: { active: false, maxWidth: 880 },
    mobile: { active: true, maxWidth: 767 },
  };

  it("con la configurazione di default restituisce default + tablet + mobile, in quest'ordine", () => {
    const result = resolveActiveBreakpoints(DEFAULT_BREAKPOINTS);
    expect(result).toEqual([
      { name: 'default' },
      { name: 'tablet', mediaQuery: '(max-width: 1024px)' },
      { name: 'mobile', mediaQuery: '(max-width: 767px)' },
    ]);
  });

  it('"default" è sempre presente per primo e senza mediaQuery, anche a tutto disattivato', () => {
    const allInactive: BreakpointsValue = {
      ...DEFAULT_BREAKPOINTS,
      tablet: { active: false, maxWidth: 1024 },
      mobile: { active: false, maxWidth: 767 },
    };
    const result = resolveActiveBreakpoints(allInactive);
    expect(result).toEqual([{ name: 'default' }]);
  });

  it('"widescreen" attivo produce una media query min-width, non max-width', () => {
    const withWidescreen: BreakpointsValue = {
      ...DEFAULT_BREAKPOINTS,
      widescreen: { active: true, minWidth: 2400 },
    };
    const result = resolveActiveBreakpoints(withWidescreen);
    expect(result).toContainEqual({ name: 'widescreen', mediaQuery: '(min-width: 2400px)' });
  });

  it("rispetta l'ordine dal più largo al più stretto quando più chiavi sono attive", () => {
    const allActive: BreakpointsValue = {
      default: {},
      widescreen: { active: true, minWidth: 2400 },
      laptop: { active: true, maxWidth: 1366 },
      tabletExtra: { active: true, maxWidth: 1200 },
      tablet: { active: true, maxWidth: 1024 },
      mobileExtra: { active: true, maxWidth: 880 },
      mobile: { active: true, maxWidth: 767 },
    };
    const result = resolveActiveBreakpoints(allActive);
    expect(result.map((bp) => bp.name)).toEqual([
      'default',
      'widescreen',
      'laptop',
      'tabletExtra',
      'tablet',
      'mobileExtra',
      'mobile',
    ]);
  });

  it('una soglia disattivata con valore salvato non appare nel risultato (ADR-76 § "Decisione" punto 4: il dato resta salvato, solo escluso dall\'emissione)', () => {
    const result = resolveActiveBreakpoints(DEFAULT_BREAKPOINTS);
    expect(result.find((bp) => bp.name === 'laptop')).toBeUndefined();
  });
});

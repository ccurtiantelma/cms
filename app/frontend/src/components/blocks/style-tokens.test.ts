/**
 * Unit test isolato di `style-tokens.ts` (SPEC-F04-grid-responsive-engine.md § 6, gap 3):
 * prima di questo file la copertura era solo indiretta, tramite `Section.test.tsx`/
 * `Container.test.tsx`.
 *
 * Il mock `styles` sotto è deliberatamente **non** l'import reale di
 * `style-tokens.module.css`: sotto Vitest (`vitest.config.ts`, `test.css: false`) l'import di
 * un vero CSS Module risolve a un Proxy che restituisce un nome di classe hashato per
 * **qualunque** chiave, anche una del tutto inventata — non esiste modo di distinguere "chiave
 * presente nel foglio" da "token sconosciuto" con l'import reale in questo ambiente. Un
 * oggetto letterale esplicito è l'unico modo di esercitare davvero il ramo "nessuna classe"
 * delle quattro funzioni; la presenza delle classi vere nell'HTML prodotto resta verificata
 * nei test di componente (`Section.test.tsx`/`Container.test.tsx`), che usano l'import reale.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
  resolveScalarClassName,
} from './style-tokens';

const mockStyles: Record<string, string> = {
  slot_default_a: 'hash-slot-default-a',
  slot_tablet_a: 'hash-slot-tablet-a',
  slot_mobile_a: 'hash-slot-mobile-a',
  scalarSlot_known: 'hash-scalar-known',
  layerBase: 'hash-layer-base',
  layerRaised: 'hash-layer-raised',
  layerOverlay: 'hash-layer-overlay',
  layerTop: 'hash-layer-top',
  hideDesktop: 'hash-hide-desktop',
  hideTablet: 'hash-hide-tablet',
  hideMobile: 'hash-hide-mobile',
};

describe('resolveResponsiveClassNames', () => {
  it('valore assente (undefined) → nessuna classe, nessun errore', () => {
    expect(resolveResponsiveClassNames(mockStyles, 'slot', undefined)).toBe('');
  });

  it('valore non-oggetto (stringa) → nessuna classe', () => {
    expect(resolveResponsiveClassNames(mockStyles, 'slot', 'a')).toBe('');
  });

  it('valore non-oggetto (numero) → nessuna classe', () => {
    expect(resolveResponsiveClassNames(mockStyles, 'slot', 42)).toBe('');
  });

  it('valore null → nessuna classe (tipeof "object" ma esplicitamente escluso)', () => {
    expect(resolveResponsiveClassNames(mockStyles, 'slot', null)).toBe('');
  });

  it('token sconosciuto su tutti i breakpoint → nessuna classe, mai un errore', () => {
    const value = { default: 'sconosciuto', tablet: 'anche-questo', mobile: 'e-questo' };

    expect(() => resolveResponsiveClassNames(mockStyles, 'slot', value)).not.toThrow();
    expect(resolveResponsiveClassNames(mockStyles, 'slot', value)).toBe('');
  });

  it('breakpoint con valore non-stringa (numero/null) viene ignorato, mai un errore', () => {
    expect(
      resolveResponsiveClassNames(mockStyles, 'slot', { default: 'a', tablet: 42, mobile: null }),
    ).toBe('hash-slot-default-a');
  });

  it('solo `default` presente → solo la classe default, mai tablet/mobile inventate', () => {
    expect(resolveResponsiveClassNames(mockStyles, 'slot', { default: 'a' })).toBe(
      'hash-slot-default-a',
    );
  });

  it('i tre breakpoint presenti insieme producono le tre classi, in ordine default → tablet → mobile', () => {
    expect(
      resolveResponsiveClassNames(mockStyles, 'slot', { default: 'a', tablet: 'a', mobile: 'a' }),
    ).toBe('hash-slot-default-a hash-slot-tablet-a hash-slot-mobile-a');
  });
});

describe('resolveScalarClassName', () => {
  it('valore assente (undefined) → nessuna classe', () => {
    expect(resolveScalarClassName(mockStyles, 'scalarSlot', undefined)).toBe('');
  });

  it('valore non-stringa (oggetto) → nessuna classe', () => {
    expect(resolveScalarClassName(mockStyles, 'scalarSlot', { value: 'known' })).toBe('');
  });

  it('token sconosciuto → nessuna classe, mai un errore', () => {
    expect(() => resolveScalarClassName(mockStyles, 'scalarSlot', 'sconosciuto')).not.toThrow();
    expect(resolveScalarClassName(mockStyles, 'scalarSlot', 'sconosciuto')).toBe('');
  });

  it('token noto → la classe corrispondente', () => {
    expect(resolveScalarClassName(mockStyles, 'scalarSlot', 'known')).toBe('hash-scalar-known');
  });
});

describe('resolveHideClassName', () => {
  it('valore assente (undefined) → nessuna classe', () => {
    expect(resolveHideClassName(mockStyles, 'hideDesktop', undefined)).toBe('');
  });

  it('valore false → nessuna classe', () => {
    expect(resolveHideClassName(mockStyles, 'hideDesktop', false)).toBe('');
  });

  it('valore non-booleano ("true" stringa) → nessuna classe, nessuna coercizione permissiva', () => {
    expect(resolveHideClassName(mockStyles, 'hideDesktop', 'true')).toBe('');
  });

  it('valore true → la classe del breakpoint corrispondente, le tre props restano indipendenti', () => {
    expect(resolveHideClassName(mockStyles, 'hideDesktop', true)).toBe('hash-hide-desktop');
    expect(resolveHideClassName(mockStyles, 'hideTablet', true)).toBe('hash-hide-tablet');
    expect(resolveHideClassName(mockStyles, 'hideMobile', true)).toBe('hash-hide-mobile');
  });
});

describe('resolveLayerClassName', () => {
  it('valore assente (undefined) → nessuna classe', () => {
    expect(resolveLayerClassName(mockStyles, undefined)).toBe('');
  });

  it('valore non-stringa (numero) → nessuna classe', () => {
    expect(resolveLayerClassName(mockStyles, 99)).toBe('');
  });

  it('token sconosciuto → nessuna classe, mai un errore', () => {
    expect(() => resolveLayerClassName(mockStyles, 'sconosciuto')).not.toThrow();
    expect(resolveLayerClassName(mockStyles, 'sconosciuto')).toBe('');
  });

  it.each([
    ['base', 'hash-layer-base'],
    ['raised', 'hash-layer-raised'],
    ['overlay', 'hash-layer-overlay'],
    ['top', 'hash-layer-top'],
  ])('token noto "%s" → la classe di z-index corrispondente', (value, expected) => {
    expect(resolveLayerClassName(mockStyles, value)).toBe(expected);
  });
});

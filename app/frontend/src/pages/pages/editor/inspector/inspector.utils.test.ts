/**
 * Unit test di `buildStatefulResponsivePropPatch`/`buildTypographyFieldPatch`
 * (`inspector.utils.ts`, round R2 "parità Elementor Pro"): il vincolo che verificano è quello
 * di ADR-75 § "Conseguenze" — scrivere un solo ramo stato/breakpoint non deve mai cancellare
 * silenziosamente gli altri già presenti (stesso principio del test T8 già richiesto da
 * ADR-29 per il v1, qui esteso alla dimensione stato in più).
 */
import { describe, expect, it } from 'vitest';
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import { buildStatefulResponsivePropPatch, buildTypographyFieldPatch } from './inspector.utils';

function propSpec(overrides: Partial<BlockPropDescriptor> = {}): BlockPropDescriptor {
  return { name: 'test', kind: 'colorRef', required: false, ...overrides };
}

describe('buildStatefulResponsivePropPatch', () => {
  it("né stateful né responsive: il valore nudo è l'intera prop", () => {
    const prop = propSpec({ kind: 'radius' });
    const result = buildStatefulResponsivePropPatch(prop, undefined, 'normal', 'default', {
      tl: 4,
      tr: 4,
      br: 4,
      bl: 4,
      unit: 'px',
    });
    expect(result).toEqual({ tl: 4, tr: 4, br: 4, bl: 4, unit: 'px' });
  });

  describe('solo responsive (es. spacing)', () => {
    const prop = propSpec({ kind: 'spacing', responsive: true, target: 'padding' });

    it("valore assente: crea l'envelope con la sola chiave scritta", () => {
      const result = buildStatefulResponsivePropPatch(prop, undefined, 'normal', 'default', {
        top: 16,
      });
      expect(result).toEqual({ default: { top: 16 } });
    });

    it('scrivere "tablet" preserva "default" già presente', () => {
      const current = { default: { top: 32 } };
      const result = buildStatefulResponsivePropPatch(prop, current, 'normal', 'tablet', {
        top: 16,
      });
      expect(result).toEqual({ default: { top: 32 }, tablet: { top: 16 } });
    });

    it('riscrivere "default" preserva "tablet"/"mobile" già presenti (T8, ADR-29 § "Conseguenza")', () => {
      const current = { default: { top: 32 }, tablet: { top: 16 }, mobile: { top: 8 } };
      const result = buildStatefulResponsivePropPatch(prop, current, 'normal', 'default', {
        top: 40,
      });
      expect(result).toEqual({ default: { top: 40 }, tablet: { top: 16 }, mobile: { top: 8 } });
    });
  });

  describe('solo stateful, senza responsive', () => {
    const prop = propSpec({ kind: 'transform', stateful: true });

    it('scrivere "hover" preserva "normal" già presente', () => {
      const current = { normal: { scale: 1 } };
      const result = buildStatefulResponsivePropPatch(prop, current, 'hover', 'default', {
        scale: 1.05,
      });
      expect(result).toEqual({ normal: { scale: 1 }, hover: { scale: 1.05 } });
    });

    it('riscrivere "normal" preserva "hover"/"focus" già presenti', () => {
      const current = { normal: { scale: 1 }, hover: { scale: 1.05 }, focus: { scale: 1.02 } };
      const result = buildStatefulResponsivePropPatch(prop, current, 'normal', 'default', {
        scale: 0.9,
      });
      expect(result).toEqual({
        normal: { scale: 0.9 },
        hover: { scale: 1.05 },
        focus: { scale: 1.02 },
      });
    });
  });

  describe('stateful + responsive (es. colorRef "hover bg" — ADR-75 § "Decisione" punto 1)', () => {
    const prop = propSpec({
      kind: 'colorRef',
      stateful: true,
      responsive: true,
      cssProperty: 'background-color',
    });

    it('scrivere hover/tablet preserva normal/default e non tocca hover/default', () => {
      const current = {
        normal: { default: '#ffffff' },
        hover: { default: '#eeeeee' },
      };
      const result = buildStatefulResponsivePropPatch(prop, current, 'hover', 'tablet', {
        ref: 'accent',
      });
      expect(result).toEqual({
        normal: { default: '#ffffff' },
        hover: { default: '#eeeeee', tablet: { ref: 'accent' } },
      });
    });

    it("valore corrente assente: costruisce l'intero envelope da zero, ordine stato→breakpoint", () => {
      const result = buildStatefulResponsivePropPatch(
        prop,
        undefined,
        'normal',
        'default',
        '#111111',
      );
      expect(result).toEqual({ normal: { default: '#111111' } });
    });

    it('un valore corrente malformato (non oggetto) è tollerato, mai un errore', () => {
      expect(() =>
        buildStatefulResponsivePropPatch(prop, '#malformed', 'normal', 'default', '#111111'),
      ).not.toThrow();
    });
  });
});

describe('buildTypographyFieldPatch (responsive per campo, SPEC-PROPKIND-V2-DETAILS.md § 3 punto 3)', () => {
  it('scrivere fontSize/mobile preserva fontSize/default e fontWeight intatti', () => {
    const current = {
      normal: {
        fontSize: { default: { value: 32, unit: 'px' } },
        fontWeight: '700',
      },
    };
    const result = buildTypographyFieldPatch(current, 'normal', 'fontSize', 'mobile', {
      value: 22,
      unit: 'px',
    });
    expect(result).toEqual({
      normal: {
        fontSize: { default: { value: 32, unit: 'px' }, mobile: { value: 22, unit: 'px' } },
        fontWeight: '700',
      },
    });
  });

  it('scrivere sul ramo "hover" non tocca il ramo "normal" (ogni campo è sempre scritto come envelope breakpoint, mai uno scalare nudo — stesso principio di `responsiveEnvelope` per il v1)', () => {
    const current = { normal: { fontWeight: '400' } };
    const result = buildTypographyFieldPatch(current, 'hover', 'fontWeight', 'default', '700');
    expect(result).toEqual({
      normal: { fontWeight: '400' },
      hover: { fontWeight: { default: '700' } },
    });
  });

  it("valore corrente assente: costruisce l'intera struttura da zero", () => {
    const result = buildTypographyFieldPatch(undefined, 'normal', 'fontSize', 'default', {
      value: 16,
      unit: 'px',
    });
    expect(result).toEqual({ normal: { fontSize: { default: { value: 16, unit: 'px' } } } });
  });
});

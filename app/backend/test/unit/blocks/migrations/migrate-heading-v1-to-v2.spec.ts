import { Logger } from '@nestjs/common';
import { migrateHeadingV1ToV2 } from '../../../../src/blocks/migrations/migrate-heading-v1-to-v2';
import { migrateBlockNode } from '../../../../src/blocks/migration/node-migration.engine';
import { DEFAULT_BLOCK_REGISTRY } from '../../../../src/blocks/block-registry';

/**
 * Copertura di `migrateHeadingV1ToV2` (ADR-81 § "Decisione" punto 2, § "Conformità").
 */
describe('migrateHeadingV1ToV2', () => {
  it('styleTextColorCustom presente ha priorità su styleTextColor (ADR-81 § "Decisione" punto 2, riga styleTextColor)', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleTextColor: { default: 'accent' },
      styleTextColorCustom: '#123456',
    });
    // `color` è `stateful: true` su `heading` v2: la migrazione avvolge sempre
    // l'inviluppo responsive in `{ normal: ... }` (ADR-75 § "Decisione" punto 1),
    // senza mai popolare un ramo `hover` (ADR-81 § "Conseguenze").
    expect(result.color).toEqual({ normal: { default: '#123456' } });
  });

  it.each([
    ['default', { ref: 'text' }],
    ['accent', { ref: 'accent' }],
    ['muted', '#6b7280'],
    ['inverse', '#ffffff'],
  ])(
    'styleTextColor token "%s" migra al valore colorRef atteso senza styleTextColorCustom',
    (token, expected) => {
      const result = migrateHeadingV1ToV2({
        level: 'h2',
        text: 'T',
        styleTextColor: { default: token },
      });
      expect(result.color).toEqual({ normal: { default: expected } });
    },
  );

  it('styleTextColor responsive (3 breakpoint) preserva la responsività ramo per ramo', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleTextColor: { default: 'accent', tablet: 'muted', mobile: 'inverse' },
    });
    expect(result.color).toEqual({
      normal: { default: { ref: 'accent' }, tablet: '#6b7280', mobile: '#ffffff' },
    });
  });

  it('styleFontSizeCustom ha priorità su styleFontSize, forma typography.fontSize a ramo singolo', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleFontSize: { default: 'lg' },
      styleFontSizeCustom: { value: 42, unit: 'rem' },
    });
    const typographyNormal = (result.typography as Record<string, Record<string, unknown>>).normal;
    expect(typographyNormal.fontSize).toEqual({ default: { value: 42, unit: 'rem' } });
  });

  it.each([
    ['sm', 14],
    ['md', 16],
    ['lg', 20],
    ['xl', 28],
  ])('styleFontSize token "%s" migra a %d px senza styleFontSizeCustom', (token, px) => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleFontSize: { default: token },
    });
    const typographyNormal = (result.typography as Record<string, Record<string, unknown>>).normal;
    expect(typographyNormal.fontSize).toEqual({ default: { value: px, unit: 'px' } });
  });

  it.each([
    ['regular', '400'],
    ['medium', '500'],
    ['bold', '700'],
  ])('styleFontWeight token "%s" migra a fontWeight CSS "%s"', (token, css) => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleFontWeight: { default: token },
    });
    const typographyNormal = (result.typography as Record<string, Record<string, unknown>>).normal;
    expect(typographyNormal.fontWeight).toEqual({ default: css });
  });

  it('styleFontFamily "default" migra a { family: "inter", source: "system" }', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleFontFamily: { default: 'default' },
    });
    const typographyNormal = (result.typography as Record<string, Record<string, unknown>>).normal;
    expect(typographyNormal.fontFamily).toEqual({
      default: { family: 'inter', source: 'system' },
    });
  });

  it('styleHideDesktop/Tablet/Mobile → hideOn (ADR-81 § "Decisione" punto 2, riga styleHide*)', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleHideDesktop: true,
      styleHideTablet: false,
      styleHideMobile: true,
    });
    expect(result.hideOn).toEqual(['default', 'mobile']);
  });

  it('tutti i flag hide falsi/assenti → hideOn vuoto', () => {
    const result = migrateHeadingV1ToV2({ level: 'h2', text: 'T' });
    expect(result.hideOn).toEqual([]);
  });

  it('margini con stessa unità producono spacing coerente (linked true se tutti uguali)', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleMarginTop: { value: 8, unit: 'px' },
      styleMarginRight: { value: 8, unit: 'px' },
      styleMarginBottom: { value: 8, unit: 'px' },
      styleMarginLeft: { value: 8, unit: 'px' },
    });
    expect(result.margin).toEqual({
      default: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
    });
  });

  it('margini con unità miste: forza unit "px", azzera i lati non-px, logga un warning (ADR-81 § "Decisione" punto 2, riga styleMargin*)', () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleMarginTop: { value: 10, unit: 'px' },
      styleMarginRight: { value: 5, unit: '%' },
      styleMarginBottom: { value: 20, unit: 'px' },
      styleMarginLeft: { value: 2, unit: '%' },
    });
    expect(result.margin).toEqual({
      default: { top: 10, right: 0, bottom: 20, left: 0, unit: 'px', linked: false },
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('nessuna prop v1 sostituita sopravvive nell\'output (ADR-81 § "Decisione" punto 3)', () => {
    const result = migrateHeadingV1ToV2({
      level: 'h2',
      text: 'T',
      styleTextColor: { default: 'accent' },
      styleTextColorCustom: '#123456',
      styleFontSize: { default: 'lg' },
      styleFontSizeCustom: { value: 20, unit: 'px' },
      styleFontWeight: { default: 'bold' },
      styleFontFamily: { default: 'roboto' },
      styleHideDesktop: true,
      styleHideTablet: true,
      styleHideMobile: true,
      styleMarginTop: { value: 1, unit: 'px' },
      styleMarginRight: { value: 1, unit: 'px' },
      styleMarginBottom: { value: 1, unit: 'px' },
      styleMarginLeft: { value: 1, unit: 'px' },
    });
    const replaced = [
      'styleTextColor',
      'styleTextColorCustom',
      'styleFontSize',
      'styleFontSizeCustom',
      'styleFontWeight',
      'styleFontFamily',
      'styleHideDesktop',
      'styleHideTablet',
      'styleHideMobile',
      'styleMarginTop',
      'styleMarginRight',
      'styleMarginBottom',
      'styleMarginLeft',
    ];
    for (const key of replaced) {
      expect(result).not.toHaveProperty(key);
    }
    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('typography');
    expect(result).toHaveProperty('margin');
    expect(result).toHaveProperty('hideOn');
  });

  it('props totalmente vuote producono comunque un output valido con default sicuri (funzione totale, ADR-21 § 3.6)', () => {
    expect(() => migrateHeadingV1ToV2({})).not.toThrow();
    const result = migrateHeadingV1ToV2({});
    expect(result.color).toEqual({ normal: { default: { ref: 'text' } } });
    expect(result.hideOn).toEqual([]);
  });

  it('idempotenza a livello di pipeline: un nodo heading già v2 non è più toccato dalla catena di migrazione (zero gradini eseguiti)', () => {
    const alreadyV2Props = {
      level: 'h2',
      text: 'T',
      color: { normal: { default: { ref: 'text' } } },
    };
    const input = { id: 'n1', type: 'heading', v: 2, props: alreadyV2Props, children: [] };
    const { node: migrated, unsupported } = migrateBlockNode(input, DEFAULT_BLOCK_REGISTRY);
    expect(unsupported).toBeUndefined();
    expect(migrated.props).toBe(alreadyV2Props);
  });
});

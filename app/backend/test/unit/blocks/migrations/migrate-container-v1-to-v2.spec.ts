import { Logger } from '@nestjs/common';
import { migrateContainerV1ToV2 } from '../../../../src/blocks/migrations/migrate-container-v1-to-v2';

/** Copertura di `migrateContainerV1ToV2` (ADR-82 § "Decisione" punto 1, container v1 → v2). */
describe('migrateContainerV1ToV2', () => {
  it('props vuote producono layout default flex, padding/margin zero', () => {
    const result = migrateContainerV1ToV2({});
    expect((result.layout as Record<string, unknown>).default).toEqual({
      display: 'flex',
      direction: 'row',
      justify: 'flex-start',
      align: 'stretch',
      wrap: 'nowrap',
      gap: { x: { value: 0, unit: 'px' }, y: { value: 0, unit: 'px' } },
    });
    expect(result.padding).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
    expect(result.margin).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
  });

  it('display/flexDirection/justifyContent/alignItems/wrap/gap scalari (non responsive) migrano nel ramo default', () => {
    const result = migrateContainerV1ToV2({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'flex-end',
      wrap: 'wrap',
      gap: 'lg',
    });
    expect((result.layout as Record<string, unknown>).default).toEqual({
      display: 'flex',
      direction: 'column',
      justify: 'center',
      align: 'flex-end',
      wrap: 'wrap',
      gap: { x: { value: 32, unit: 'px' }, y: { value: 32, unit: 'px' } },
    });
  });

  it('campi responsive producono un ramo default completo e rami sparsi per gli altri breakpoint', () => {
    const result = migrateContainerV1ToV2({
      flexDirection: { default: 'row', tablet: 'column' },
      gap: { default: 'sm', mobile: 'lg' },
    });
    const layout = result.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.direction).toBe('row');
    expect(layout.default.gap).toEqual({
      x: { value: 8, unit: 'px' },
      y: { value: 8, unit: 'px' },
    });
    expect(layout.tablet).toEqual({ direction: 'column' });
    expect(layout.mobile).toEqual({
      gap: { x: { value: 32, unit: 'px' }, y: { value: 32, unit: 'px' } },
    });
  });

  it('stylePadding*/styleMargin* (token enum) migrano a spacing in px', () => {
    const result = migrateContainerV1ToV2({
      stylePaddingTop: '16',
      stylePaddingRight: '16',
      stylePaddingBottom: '8',
      stylePaddingLeft: '8',
      styleMarginTop: '0',
      styleMarginRight: '0',
      styleMarginBottom: '0',
      styleMarginLeft: '0',
    });
    expect(result.padding).toEqual({
      default: { top: 16, right: 16, bottom: 8, left: 8, unit: 'px', linked: false },
    });
    expect(result.margin).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
  });

  it('customCssClass/customElementId rinominati a cssClass/htmlId', () => {
    const result = migrateContainerV1ToV2({ customCssClass: 'hero', customElementId: 'main-hero' });
    expect(result.cssClass).toBe('hero');
    expect(result.htmlId).toBe('main-hero');
    expect(result).not.toHaveProperty('customCssClass');
    expect(result).not.toHaveProperty('customElementId');
  });

  it('styleWidth/styleHeight (senza equivalente diretto) mappano a boxedWidth/minHeight con warning', () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const result = migrateContainerV1ToV2({
      styleWidth: { value: 800, unit: 'px' },
      styleHeight: { value: 50, unit: '%' },
    });
    expect(result.boxedWidth).toEqual({ value: 800, unit: 'px' });
    expect(result.contentWidth).toBe('boxed');
    expect(result.minHeight).toEqual({ value: 50, unit: 'px' });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('styleFlexBasis e le 4 prop colore "fallback" sono scartate in silenzio', () => {
    const result = migrateContainerV1ToV2({
      styleFlexBasis: { value: 50, unit: '%' },
      styleBackgroundColor: '#111111',
      styleColor: '#222222',
      backgroundColor: '#333333',
      color: '#444444',
    });
    for (const key of [
      'styleFlexBasis',
      'styleBackgroundColor',
      'styleColor',
      'backgroundColor',
      'color',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it("nessuna prop v1 sostituita sopravvive nell'output", () => {
    const result = migrateContainerV1ToV2({
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      wrap: 'nowrap',
      gap: 'md',
      stylePaddingTop: '8',
      styleMarginTop: '8',
      styleWidth: { value: 100, unit: 'px' },
      styleHeight: { value: 100, unit: 'px' },
      customCssClass: 'x',
      customElementId: 'y',
    });
    for (const key of [
      'display',
      'flexDirection',
      'justifyContent',
      'alignItems',
      'wrap',
      'gap',
      'stylePaddingTop',
      'styleMarginTop',
      'styleWidth',
      'styleHeight',
      'customCssClass',
      'customElementId',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('props totalmente vuote producono comunque un output valido (funzione totale, ADR-21 § 3.6)', () => {
    expect(() => migrateContainerV1ToV2({})).not.toThrow();
  });
});

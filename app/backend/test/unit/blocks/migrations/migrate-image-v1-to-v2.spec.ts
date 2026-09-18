import { Logger } from '@nestjs/common';
import { migrateImageV1ToV2 } from '../../../../src/blocks/migrations/migrate-image-v1-to-v2';

/** Copertura di `migrateImageV1ToV2` (ADR-81 § "Decisione" punto 2: solo margin/hideOn, mai color/typography). */
describe('migrateImageV1ToV2', () => {
  it('mediaRef/alt/styleSizePreset invariati, margin/hideOn calcolati', () => {
    const result = migrateImageV1ToV2({
      mediaRef: '0123456789abcdef',
      alt: 'Descrizione',
      styleSizePreset: 'card',
      styleHideMobile: true,
    });
    expect(result.mediaRef).toBe('0123456789abcdef');
    expect(result.alt).toBe('Descrizione');
    expect(result.styleSizePreset).toBe('card');
    expect(result.hideOn).toEqual(['mobile']);
    expect(result.margin).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
  });

  it('mai color/typography (image non li dichiarava in v1)', () => {
    const result = migrateImageV1ToV2({ mediaRef: '0123456789abcdef', alt: 'x' });
    expect(result).not.toHaveProperty('color');
    expect(result).not.toHaveProperty('typography');
  });

  it('margini con unità miste: forza px, azzera i lati non-px, logga warning', () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const result = migrateImageV1ToV2({
      mediaRef: '0123456789abcdef',
      alt: 'x',
      styleMarginTop: { value: 10, unit: 'px' },
      styleMarginLeft: { value: 3, unit: '%' },
    });
    expect(result.margin).toEqual({
      default: { top: 10, right: 0, bottom: 0, left: 0, unit: 'px', linked: false },
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("nessuna prop v1 sostituita sopravvive nell'output", () => {
    const result = migrateImageV1ToV2({
      mediaRef: '0123456789abcdef',
      alt: 'x',
      styleHideDesktop: true,
      styleHideTablet: true,
      styleHideMobile: true,
      styleMarginTop: { value: 1, unit: 'px' },
      styleMarginRight: { value: 1, unit: 'px' },
      styleMarginBottom: { value: 1, unit: 'px' },
      styleMarginLeft: { value: 1, unit: 'px' },
    });
    for (const key of [
      'styleHideDesktop',
      'styleHideTablet',
      'styleHideMobile',
      'styleMarginTop',
      'styleMarginRight',
      'styleMarginBottom',
      'styleMarginLeft',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('props totalmente vuote producono comunque un output valido (funzione totale)', () => {
    expect(() => migrateImageV1ToV2({})).not.toThrow();
  });
});

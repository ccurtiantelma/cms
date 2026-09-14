/**
 * Unit test della logica pura delle maniglie di resize generiche (ADR-71
 * resize-handles-unita-dinamiche.md): risoluzione di `{min, max, units}` dal registro per
 * `(blockType, propName)`, conversione delta-puntatore → valore per `px`/`%`, clamping,
 * verso del gesto. Nessun DOM montato — stesso principio di `container-resize.utils.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  clampResizeValue,
  formatResizeBadge,
  pixelDeltaToUnitDelta,
  readUnitValue,
  resolveResizeDirection,
  resolveResizePropSpec,
  toUnitValue,
  RESIZE_HANDLE_UNITS,
} from './resize-handle.utils';

describe('resolveResizePropSpec — risoluzione dal registro reale', () => {
  it('container.styleWidth: unitValue px/%, min/max dichiarati (ADR-71 § 3)', () => {
    expect(resolveResizePropSpec('container', 'styleWidth')).toEqual({
      min: 0,
      max: 4000,
      units: ['px', '%'],
    });
  });

  it('heading.styleMarginTop: unitValue px/%, min/max dichiarati (ADR-71 § 3)', () => {
    expect(resolveResizePropSpec('heading', 'styleMarginTop')).toEqual({
      min: 0,
      max: 500,
      units: ['px', '%'],
    });
  });

  it('image.styleWidth dichiara anche "vw" nel registro (ADR-58): la maniglia resta ristretta a px/%, mai un\'unità che non sa pilotare (ADR-71 § "Decisione" punto 2)', () => {
    expect(resolveResizePropSpec('image', 'styleWidth')).toEqual({
      min: 0,
      max: 3840,
      units: ['px', '%'],
    });
  });

  it('restituisce null se il tipo non dichiara affatto la prop (heading non ha styleWidth)', () => {
    expect(resolveResizePropSpec('heading', 'styleWidth')).toBeNull();
  });

  it('restituisce null se la prop esiste col nome giusto ma di kind diverso — container.styleMarginTop resta un enum a token (ADR-33 § 4), non una prop pilotabile da maniglia', () => {
    expect(resolveResizePropSpec('container', 'styleMarginTop')).toBeNull();
  });

  it('restituisce null per un tipo inesistente nel registro', () => {
    expect(resolveResizePropSpec('non-existent-type', 'styleWidth')).toBeNull();
  });
});

describe('resolveResizeDirection', () => {
  it('styleMarginTop/styleMarginLeft: -1 (i lati "iniziali" del box)', () => {
    expect(resolveResizeDirection('styleMarginTop')).toBe(-1);
    expect(resolveResizeDirection('styleMarginLeft')).toBe(-1);
  });

  it('styleWidth/styleHeight/styleMarginBottom/styleMarginRight: 1 (i lati "finali" del box)', () => {
    expect(resolveResizeDirection('styleWidth')).toBe(1);
    expect(resolveResizeDirection('styleHeight')).toBe(1);
    expect(resolveResizeDirection('styleMarginBottom')).toBe(1);
    expect(resolveResizeDirection('styleMarginRight')).toBe(1);
  });
});

describe('pixelDeltaToUnitDelta', () => {
  it('px: conversione diretta, nessun ridimensionamento in base al padre', () => {
    expect(pixelDeltaToUnitDelta(42, 'px', 800)).toBe(42);
    expect(pixelDeltaToUnitDelta(-15, 'px', 0)).toBe(-15);
  });

  it('%: relativo a parentSize (metà del padre di 800px → 50%)', () => {
    expect(pixelDeltaToUnitDelta(400, '%', 800)).toBe(50);
  });

  it('%: un terzo del padre di 900px → 33.33...%', () => {
    expect(pixelDeltaToUnitDelta(300, '%', 900)).toBeCloseTo(33.33, 1);
  });

  it('%: parentSize <= 0 non è convertibile in una percentuale significativa — nessun delta', () => {
    expect(pixelDeltaToUnitDelta(400, '%', 0)).toBe(0);
    expect(pixelDeltaToUnitDelta(400, '%', -10)).toBe(0);
  });
});

describe('clampResizeValue', () => {
  const spec = { min: 0, max: 500 };

  it('un valore sopra il massimo dichiarato viene troncato al massimo', () => {
    expect(clampResizeValue(999, spec)).toBe(500);
  });

  it('un valore sotto il minimo dichiarato viene troncato al minimo', () => {
    expect(clampResizeValue(-50, spec)).toBe(0);
  });

  it('un valore dentro il range è arrotondato a un decimale, non alterato altrimenti', () => {
    expect(clampResizeValue(123.456, spec)).toBe(123.5);
  });

  it('un valore non finito ricade sul minimo, mai su NaN', () => {
    expect(clampResizeValue(Number.NaN, spec)).toBe(0);
    expect(clampResizeValue(Number.POSITIVE_INFINITY, spec)).toBe(0);
  });
});

describe('readUnitValue / toUnitValue', () => {
  it('legge un valore composto valido nell\'unità ammessa', () => {
    expect(readUnitValue({ value: 42, unit: 'px' }, RESIZE_HANDLE_UNITS)).toEqual({
      value: 42,
      unit: 'px',
    });
  });

  it('rifiuta un\'unità non pilotabile da questa maniglia (es. "vw" salvato in precedenza via ispettore) invece di convertirla a occhio', () => {
    expect(readUnitValue({ value: 42, unit: 'vw' }, RESIZE_HANDLE_UNITS)).toBeNull();
  });

  it('rifiuta prop assente o di forma diversa', () => {
    expect(readUnitValue(undefined, RESIZE_HANDLE_UNITS)).toBeNull();
    expect(readUnitValue('50px', RESIZE_HANDLE_UNITS)).toBeNull();
    expect(readUnitValue({ value: '50', unit: 'px' }, RESIZE_HANDLE_UNITS)).toBeNull();
  });

  it('round-trip: quello che si scrive è quello che si rilegge', () => {
    expect(readUnitValue(toUnitValue(66.7, '%'), RESIZE_HANDLE_UNITS)).toEqual({
      value: 66.7,
      unit: '%',
    });
  });
});

describe('formatResizeBadge', () => {
  it('nessun decimale superfluo su un valore intero', () => {
    expect(formatResizeBadge(50, 'px')).toBe('50px');
    expect(formatResizeBadge(100, '%')).toBe('100%');
  });

  it('un decimale dove serve', () => {
    expect(formatResizeBadge(33.33, '%')).toBe('33.3%');
  });
});

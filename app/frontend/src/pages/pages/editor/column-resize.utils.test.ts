/**
 * Unit test della logica pura del ridimensionamento inter-colonna di `section` (nessun DOM
 * montato — è esattamente il motivo per cui questa logica vive fuori dal componente, stesso
 * principio di `container-resize.utils.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import {
  COLUMN_RATIO_BOUNDARY_PERCENT,
  COLUMN_RATIO_VALUES,
  formatColumnRatioBadge,
  isColumnRatioValue,
  resolveColumnRatio,
  resolveColumnRatioFromFraction,
} from './column-resize.utils';

describe('isColumnRatioValue / resolveColumnRatio', () => {
  it('riconosce i tre stop dichiarati dal registro', () => {
    for (const value of COLUMN_RATIO_VALUES) {
      expect(isColumnRatioValue(value)).toBe(true);
      expect(resolveColumnRatio(value)).toBe(value);
    }
  });

  it('rifiuta una percentuale libera invece di convertirla a occhio', () => {
    expect(isColumnRatioValue(70)).toBe(false);
    expect(isColumnRatioValue('70-30')).toBe(false);
  });

  it('ricade su "equal" per un valore assente o di forma diversa', () => {
    expect(resolveColumnRatio(undefined)).toBe('equal');
    expect(resolveColumnRatio(null)).toBe('equal');
    expect(resolveColumnRatio(50)).toBe('equal');
  });
});

describe('resolveColumnRatioFromFraction', () => {
  it('metà del contenitore → "equal"', () => {
    expect(resolveColumnRatioFromFraction(0.5)).toBe('equal');
  });

  it('sotto la soglia sinistra (0.4) → "33-66"', () => {
    expect(resolveColumnRatioFromFraction(0.3)).toBe('33-66');
    expect(resolveColumnRatioFromFraction(0)).toBe('33-66');
  });

  it('sopra la soglia destra (0.6) → "66-33"', () => {
    expect(resolveColumnRatioFromFraction(0.7)).toBe('66-33');
    expect(resolveColumnRatioFromFraction(1)).toBe('66-33');
  });

  it('esattamente sulle soglie: 0.4 e 0.6 restano "equal" (confini inclusi nella zona centrale)', () => {
    expect(resolveColumnRatioFromFraction(0.4)).toBe('equal');
    expect(resolveColumnRatioFromFraction(0.6)).toBe('equal');
  });

  it('ogni stop resta a distanza >=10% dai bordi e dagli altri stop (vincolo "minimo 10% per colonna" del task)', () => {
    for (const ratio of COLUMN_RATIO_VALUES) {
      const boundary = COLUMN_RATIO_BOUNDARY_PERCENT[ratio];
      expect(boundary).toBeGreaterThanOrEqual(10);
      expect(boundary).toBeLessThanOrEqual(90);
    }
  });
});

describe('formatColumnRatioBadge', () => {
  it('formatta la ripartizione di entrambe le colonne', () => {
    expect(formatColumnRatioBadge('equal')).toBe('50% / 50%');
    expect(formatColumnRatioBadge('33-66')).toBe('33% / 67%');
    expect(formatColumnRatioBadge('66-33')).toBe('67% / 33%');
  });
});

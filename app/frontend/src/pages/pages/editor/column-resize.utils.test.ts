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
  it('riconosce i cinque stop dichiarati dal registro (RFC-58 ha aggiunto 30-70/70-30 a equal/33-66/66-33)', () => {
    for (const value of COLUMN_RATIO_VALUES) {
      expect(isColumnRatioValue(value)).toBe(true);
      expect(resolveColumnRatio(value)).toBe(value);
    }
  });

  it('rifiuta una percentuale libera invece di convertirla a occhio', () => {
    expect(isColumnRatioValue(70)).toBe(false);
    // '70-30' è uno stop valido da RFC-58: non più utilizzabile come esempio di valore fuori
    // registro (era usato prima dell'estensione). '20-80' resta fuori registro.
    expect(isColumnRatioValue('20-80')).toBe(false);
  });

  it('ricade su "equal" per un valore assente o di forma diversa', () => {
    expect(resolveColumnRatio(undefined)).toBe('equal');
    expect(resolveColumnRatio(null)).toBe('equal');
    expect(resolveColumnRatio(50)).toBe('equal');
  });
});

/**
 * Con cinque stop il nearest-neighbor generico (vedi JSDoc di
 * `resolveColumnRatioFromFraction`) divide `[0,1]` in cinque zone ai punti medi fra stop
 * adiacenti (percentuali riportate a frazione): 0.3/0.31667/0.41667/0.5/0.58333/0.68333/0.7.
 * Le vecchie soglie fisse 0.4/0.6 (due stop, `equal`/`33-66`/`66-33`) sono superate: 0.4 e 0.6
 * ora cadono nella zona di `33-66`/`66-33` (più vicini a 0.33333/0.66667 che a 0.5), non più
 * in quella di `equal` — la zona centrale di `equal` si è ristretta a `[0.41667,0.58333)` per
 * fare spazio ai due nuovi stop più esterni.
 */
describe('resolveColumnRatioFromFraction', () => {
  it('metà del contenitore → "equal" (zona centrale invariata, [0.41667, 0.58333))', () => {
    expect(resolveColumnRatioFromFraction(0.5)).toBe('equal');
  });

  it('0.4 e 0.6 non sono più "equal": più vicini a "33-66"/"66-33" ora che esistono stop più esterni', () => {
    expect(resolveColumnRatioFromFraction(0.4)).toBe('33-66');
    expect(resolveColumnRatioFromFraction(0.6)).toBe('66-33');
  });

  it('0 e 0.3 → "30-70": lo stop più esterno a sinistra è ora il più vicino', () => {
    expect(resolveColumnRatioFromFraction(0)).toBe('30-70');
    expect(resolveColumnRatioFromFraction(0.3)).toBe('30-70');
  });

  it('0.7 e 1 → "70-30": lo stop più esterno a destra è ora il più vicino', () => {
    expect(resolveColumnRatioFromFraction(0.7)).toBe('70-30');
    expect(resolveColumnRatioFromFraction(1)).toBe('70-30');
  });

  it('zona intermedia stretta ancora coperta da "33-66"/"66-33" (es. 0.35/0.65)', () => {
    expect(resolveColumnRatioFromFraction(0.35)).toBe('33-66');
    expect(resolveColumnRatioFromFraction(0.65)).toBe('66-33');
  });

  it('ogni stop resta a distanza >=10% dai bordi (vincolo "minimo 10% per colonna" del task)', () => {
    for (const ratio of COLUMN_RATIO_VALUES) {
      const boundary = COLUMN_RATIO_BOUNDARY_PERCENT[ratio];
      expect(boundary).toBeGreaterThanOrEqual(10);
      expect(boundary).toBeLessThanOrEqual(90);
    }
  });
});

describe('formatColumnRatioBadge', () => {
  it('formatta la ripartizione di entrambe le colonne per tutti e cinque gli stop', () => {
    expect(formatColumnRatioBadge('equal')).toBe('50% / 50%');
    expect(formatColumnRatioBadge('33-66')).toBe('33% / 67%');
    expect(formatColumnRatioBadge('66-33')).toBe('67% / 33%');
    expect(formatColumnRatioBadge('30-70')).toBe('30% / 70%');
    expect(formatColumnRatioBadge('70-30')).toBe('70% / 30%');
  });
});

import { withTimeout } from '../../../src/health/health-check.util';

describe('withTimeout (unit)', () => {
  it('risolve con il valore della promise se questa completa prima del timeout', async () => {
    await expect(withTimeout(Promise.resolve('valore'), 100, 'Test check')).resolves.toBe('valore');
  });

  it('propaga il rifiuto della promise se questa fallisce prima del timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100, 'Test check')).rejects.toThrow(
      'boom',
    );
  });

  it('rigetta con un errore di timeout se la promise non completa in tempo', async () => {
    const neverResolves = new Promise(() => {});

    await expect(withTimeout(neverResolves, 20, 'Test check')).rejects.toThrow(
      'Test check: timeout dopo 20ms',
    );
  });
});

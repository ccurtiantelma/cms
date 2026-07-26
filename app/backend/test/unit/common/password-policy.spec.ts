import { validatePasswordStrength } from '../../../src/common/password-policy';

describe('validatePasswordStrength', () => {
  it('rifiuta una password vuota', () => {
    const result = validatePasswordStrength('');
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('La password non può essere vuota.');
  });

  it('rifiuta una password troppo corta anche se rispetta le categorie di caratteri', () => {
    const result = validatePasswordStrength('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('almeno 12 caratteri'))).toBe(true);
  });

  it('rifiuta una password lunga ma con meno di 3 categorie di caratteri', () => {
    const result = validatePasswordStrength('abcdefghijklmnop');
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('almeno 3 delle seguenti categorie'))).toBe(true);
  });

  it('accetta una password lunga con almeno 3 categorie di caratteri (score = numero categorie)', () => {
    const result = validatePasswordStrength('SuperSicura123!');
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.score).toBe(4); // maiuscole, minuscole, numeri, simboli
  });

  it('accetta una password lunga con esattamente 3 categorie (nessun simbolo)', () => {
    const result = validatePasswordStrength('SuperSicura1234');
    expect(result.valid).toBe(true);
    expect(result.score).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { computeFormHoneypotFieldName, computeFormSignature } from '../src/form-antispam';

/**
 * Anti-spam headless dei Form (F10-04, ADR-46 § 3, RFC-46 D6.1/D6.2), lato
 * renderer pubblico. L'unico contratto che conta qui è quello che il backend
 * riverifica a submit (`app/backend/src/forms/form-antispam.util.ts`): stesso
 * algoritmo (HMAC-SHA256 esadecimale, honeypot = primi 12 caratteri) per lo
 * stesso `formKey`+secret. Non importiamo il modulo backend (workspace
 * separati, ADR-22 § 5): questi test fissano solo le proprietà osservabili
 * dell'implementazione duplicata qui, non un confronto diretto fra i due file.
 */
describe('form-antispam (public-site)', () => {
  it('deriva un nome honeypot di 12 caratteri esadecimali, mai una stringa fissa nota', () => {
    const name = computeFormHoneypotFieldName('contatti-home');
    expect(name).toMatch(/^[0-9a-f]{12}$/);
    expect(name).not.toBe('honeypot');
    expect(name).not.toBe('website');
    expect(name).not.toBe('_hp_check');
  });

  it('è deterministico per lo stesso formKey (stabile finché il secret non cambia)', () => {
    expect(computeFormHoneypotFieldName('contatti-home')).toBe(computeFormHoneypotFieldName('contatti-home'));
    expect(computeFormSignature('contatti-home')).toBe(computeFormSignature('contatti-home'));
  });

  it('produce honeypot/firma diversi per formKey diversi', () => {
    expect(computeFormHoneypotFieldName('contatti-home')).not.toBe(computeFormHoneypotFieldName('newsletter-footer'));
    expect(computeFormSignature('contatti-home')).not.toBe(computeFormSignature('newsletter-footer'));
  });

  it('la firma è un digest SHA-256 esadecimale completo (64 caratteri) che inizia col nome honeypot', () => {
    const signature = computeFormSignature('contatti-home');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature.startsWith(computeFormHoneypotFieldName('contatti-home'))).toBe(true);
  });
});

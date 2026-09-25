/**
 * Test di `getErrorCode` (SPEC-RBAC-F2b S37).
 */
import { describe, it, expect } from 'vitest';
import { getErrorCode } from './api.utils';

describe('getErrorCode', () => {
  it('restituisce il codice di dominio della risposta', () => {
    const err = { isAxiosError: true, response: { status: 409, data: { code: 'ROLE_IN_USE' } } };
    expect(getErrorCode(err)).toBe('ROLE_IN_USE');
  });

  it('undefined senza risposta (errore di rete)', () => {
    expect(getErrorCode({ isAxiosError: true })).toBeUndefined();
  });

  it('undefined se il corpo non ha un codice stringa', () => {
    expect(getErrorCode({ response: { status: 400, data: { code: 42 } } })).toBeUndefined();
    expect(getErrorCode({ response: { status: 400, data: {} } })).toBeUndefined();
  });

  it('undefined per valori che non sono errori', () => {
    expect(getErrorCode(undefined)).toBeUndefined();
    expect(getErrorCode(new Error('boom'))).toBeUndefined();
  });
});

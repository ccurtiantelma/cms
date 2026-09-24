/**
 * Test di `roleErrorMessage` (SPEC-RBAC-F2b S37): un caso per ognuno degli 8 codici di dominio,
 * più i casi in cui la pagina tace perché l'interceptor Axios ha già notificato.
 */
import { describe, it, expect } from 'vitest';
import { roleErrorMessage } from './roles-errors.utils';

function httpError(status: number, data: Record<string, unknown> = {}): unknown {
  return { isAxiosError: true, response: { status, data } };
}

const FALLBACK = 'Salvataggio non riuscito';

describe('roleErrorMessage (SPEC F2b S37)', () => {
  it('RESERVED_PERMISSION → messaggio dedicato', () => {
    const res = roleErrorMessage(httpError(400, { code: 'RESERVED_PERMISSION' }), FALLBACK);
    expect(res?.message).toContain('roles:manage');
    expect(res?.field).toBeUndefined();
  });

  it('ROLE_IN_USE → messaggio del backend con il numero di utenti', () => {
    const message = 'Il ruolo è assegnato a 3 utenti: rimuovilo prima di eliminarlo.';
    expect(roleErrorMessage(httpError(409, { code: 'ROLE_IN_USE', message }), FALLBACK)).toEqual({
      message,
    });
  });

  it('ROLE_CODE_DUPLICATE → errore anche sul campo code', () => {
    expect(roleErrorMessage(httpError(409, { code: 'ROLE_CODE_DUPLICATE' }), FALLBACK)).toEqual({
      message: 'Esiste già un ruolo con questo codice.',
      field: 'code',
    });
  });

  it('INVALID_ROLE_CODE → errore anche sul campo code', () => {
    const res = roleErrorMessage(httpError(400, { code: 'INVALID_ROLE_CODE' }), FALLBACK);
    expect(res?.field).toBe('code');
  });

  it('INVALID_PERMISSION_CODE → messaggio che annuncia il catalogo ricaricato', () => {
    const res = roleErrorMessage(httpError(400, { code: 'INVALID_PERMISSION_CODE' }), FALLBACK);
    expect(res?.message).toMatch(/catalogo/i);
  });

  it('SYSTEM_ROLE_READONLY (403 di dominio) → messaggio dedicato', () => {
    expect(roleErrorMessage(httpError(403, { code: 'SYSTEM_ROLE_READONLY' }), FALLBACK)).toEqual({
      message: 'I ruoli di sistema sono in sola lettura.',
    });
  });

  it('PERMISSION_ESCALATION (403 di dominio) → messaggio del backend con i codici', () => {
    const message = 'Non puoi concedere permessi che non possiedi: media:delete_any.';
    expect(
      roleErrorMessage(httpError(403, { code: 'PERMISSION_ESCALATION', message }), FALLBACK),
    ).toEqual({ message });
  });

  it('SYSTEM_ROLE_NOT_ASSIGNABLE → rimanda al campo "Ruolo"', () => {
    const res = roleErrorMessage(httpError(400, { code: 'SYSTEM_ROLE_NOT_ASSIGNABLE' }), FALLBACK);
    expect(res?.message).toContain('"Ruolo"');
  });

  it("403 senza codice di dominio (guard) → null, basta il toast dell'interceptor", () => {
    expect(
      roleErrorMessage(
        httpError(403, { code: 'ForbiddenException', message: 'Permessi insufficienti' }),
        FALLBACK,
      ),
    ).toBeNull();
  });

  it('404, 5xx ed errore di rete → null', () => {
    expect(roleErrorMessage(httpError(404, { code: 'NotFoundException' }), FALLBACK)).toBeNull();
    expect(roleErrorMessage(httpError(500), FALLBACK)).toBeNull();
    expect(roleErrorMessage({ isAxiosError: true }, FALLBACK)).toBeNull();
  });

  it('codice sconosciuto → messaggio del backend, oppure il fallback', () => {
    expect(
      roleErrorMessage(
        httpError(400, { code: 'BadRequestException', message: ['name must be a string'] }),
        FALLBACK,
      ),
    ).toEqual({ message: 'name must be a string' });
    expect(roleErrorMessage(httpError(400, { code: 'X' }), FALLBACK)).toEqual({
      message: FALLBACK,
    });
  });
});

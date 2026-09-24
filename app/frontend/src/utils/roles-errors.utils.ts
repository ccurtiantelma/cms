/**
 * Messaggi per i codici d'errore di dominio delle rotte ruoli e dell'assegnazione dei ruoli
 * agli utenti (SPEC-RBAC-F2a § Endpoint API, SPEC-RBAC-F2b S37).
 */
import type { AxiosError } from 'axios';
import { getErrorCode, getErrorMessage, isNetworkError } from './api.utils';

/** Messaggio da mostrare per un errore di scrittura su ruoli o ruoli aggiuntivi. */
export interface RoleErrorFeedback {
  message: string;
  /** Campo del form a cui attribuire l'errore, oltre al toast. */
  field?: 'code';
}

/**
 * Messaggi per codice. Una funzione riceve il messaggio del backend quando contiene dettagli
 * utili (codici coinvolti, numero di utenti).
 */
const MESSAGES: Record<string, (backendMessage: string) => RoleErrorFeedback> = {
  RESERVED_PERMISSION: () => ({
    message:
      'Il permesso "roles:manage" è riservato ai ruoli di sistema e non può far parte di un ruolo personalizzato.',
  }),
  ROLE_IN_USE: (backendMessage) => ({ message: backendMessage }),
  ROLE_CODE_DUPLICATE: () => ({ message: 'Esiste già un ruolo con questo codice.', field: 'code' }),
  INVALID_ROLE_CODE: () => ({
    message:
      'Codice non valido: minuscole, cifre e underscore, da 3 a 50 caratteri, inizia con una lettera.',
    field: 'code',
  }),
  INVALID_PERMISSION_CODE: () => ({
    message:
      'Il catalogo dei permessi è cambiato: è stato ricaricato. Controlla la selezione e riprova.',
  }),
  SYSTEM_ROLE_READONLY: () => ({ message: 'I ruoli di sistema sono in sola lettura.' }),
  PERMISSION_ESCALATION: (backendMessage) => ({ message: backendMessage }),
  SYSTEM_ROLE_NOT_ASSIGNABLE: () => ({
    message:
      'I ruoli di sistema non si assegnano come ruoli aggiuntivi: il livello base si sceglie nel campo "Ruolo".',
  }),
};

/**
 * Traduce un errore di scrittura in un messaggio per la pagina. Restituisce `null` quando la
 * pagina non deve mostrare nulla perché l'interceptor Axios ha già notificato: errore di rete,
 * `403` senza codice di dominio (guard), `404` e `5xx`.
 *
 * @param err Errore catturato in un blocco `catch`.
 * @param fallback Messaggio se la risposta non ne contiene uno.
 */
export function roleErrorMessage(err: unknown, fallback: string): RoleErrorFeedback | null {
  if (isNetworkError(err)) return null;
  const status = (err as AxiosError)?.response?.status;
  const code = getErrorCode(err);
  const mapped = code ? MESSAGES[code] : undefined;
  if (mapped) return mapped(getErrorMessage(err, fallback));
  if (status === 403 || status === 404 || (status !== undefined && status >= 500)) return null;
  return { message: getErrorMessage(err, fallback) };
}

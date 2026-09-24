/**
 * Utility condivise per la gestione delle risposte/errori API (Axios).
 * Riferimento: CLAUDE.md — Error Handling Policy (Frontend).
 */
import { AxiosError } from 'axios';

/**
 * Estrae un messaggio d'errore leggibile dalla risposta di un errore Axios.
 *
 * Il backend (`AllExceptionsFilter`) normalizza ogni errore nel formato
 * `{ statusCode, message, code, timestamp, path }`, dove `message` può essere
 * una stringa singola o un array (errori di validazione `class-validator`).
 *
 * @param err Errore catturato in un blocco `catch` (tipizzato `unknown`).
 * @param fallback Messaggio da usare se la risposta non contiene un `message`.
 * @returns Messaggio pronto da passare a `notifications.show(...)`.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const error = err as AxiosError<{ message?: string | string[] }>;
  const raw = error.response?.data?.message ?? fallback;
  return Array.isArray(raw) ? raw.join(' ') : raw;
}

/**
 * Estrae il codice di dominio (`code`) dal corpo di un errore Axios, per esempio
 * `RESERVED_PERMISSION` o `ROLE_IN_USE`. Per le eccezioni senza codice di dominio il backend
 * mette il nome della classe (`ForbiddenException`, `NotFoundException`, ...).
 *
 * @param err Errore catturato in un blocco `catch` (tipizzato `unknown`).
 * @returns Il codice, oppure `undefined` se la risposta non ne ha uno (o non c'è risposta).
 */
export function getErrorCode(err: unknown): string | undefined {
  const code = (err as AxiosError<{ code?: unknown }>)?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Verifica se un errore catturato è un errore di rete Axios (nessuna risposta
 * ricevuta dal server: timeout, DNS, connessione assente).
 */
export function isNetworkError(err: unknown): boolean {
  const error = err as AxiosError;
  return Boolean(error.isAxiosError) && !error.response;
}

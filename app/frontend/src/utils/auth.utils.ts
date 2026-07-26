/**
 * Utility per la gestione del token di autenticazione e dell'utente cachato.
 * Chiavi `localStorage` fissate dal contratto: `access_token`, `auth_user`.
 */
import type { AuthUser } from '../types/common.types';

const ACCESS_TOKEN_KEY = 'access_token';
const AUTH_USER_KEY = 'auth_user';

/**
 * Path di atterraggio post-login. Nello starter-kit esiste un solo layout/area
 * applicativa: ogni ruolo atterra su `/dashboard` (nessun secondo layout tipo
 * `LayoutOperator`, quel pattern resta documentato solo come esempio in `docs/`).
 * @param role Valore enum del ruolo utente, o undefined se non disponibile.
 */
export function homePathForRole(_role: number | undefined): string {
  return '/dashboard';
}

/** Recupera il token di accesso dal localStorage. */
export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Salva il token di accesso nel localStorage. */
export function setToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** Recupera l'utente autenticato cachato dal localStorage. */
export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** Salva l'utente autenticato nel localStorage. */
export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

/** Rimuove token e utente cachato dal localStorage (logout / refresh fallito). */
export function clearAuthStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

interface DecodedTokenPayload {
  id: number;
  name: string;
  email: string;
  role: number;
  scopeId: string | null;
  jti: string;
  /** Presente solo nei JWT di impersonificazione: id del SuperAdmin reale. */
  impersonatedBy?: number;
}

/**
 * Decodifica il payload di un JWT (senza verificarne la firma: la verifica è
 * compito esclusivo del backend). Usato lato client solo per leggere claim
 * non sensibili come `impersonatedBy`.
 */
function decodeTokenPayload(token: string): DecodedTokenPayload | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as DecodedTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Id del SuperAdmin reale se il token corrente è una sessione di impersonificazione,
 * altrimenti `null`.
 */
export function getImpersonatedBy(): number | null {
  const token = getToken();
  if (!token) return null;
  return decodeTokenPayload(token)?.impersonatedBy ?? null;
}

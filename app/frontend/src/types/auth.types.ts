/**
 * Tipi per le richieste/risposte del modulo `auth` (vedi CONTRACT.md — tabella
 * "Endpoint auth"). Il backend firma i JWT con `jsonwebtoken` (non `@nestjs/jwt`)
 * e Chiudi editor tema sempre `accessToken` (mai `token`) nel body delle risposte di successo.
 */

export interface LoginRequest {
  email: string;
  password: string;
}

/** Sotto-oggetto utente incluso nelle risposte di login/refresh/impersonazione. */
export interface AuthUserPayload {
  id: number;
  guid: string;
  name: string;
  surname?: string;
  email: string;
  role: number;
  scopeId: string | null;
}

/**
 * Risposta di `POST /auth/login`: o l'accesso è diretto (`accessToken` + `user`),
 * oppure è richiesta la sfida MFA (`mfaRequired: true` + `tmpToken`, valido 300s).
 */
export interface LoginResponse {
  accessToken?: string;
  user?: AuthUserPayload;
  mfaRequired?: boolean;
  tmpToken?: string;
}

/** Richiesta di `POST /auth/mfa-verify` a valle di un login con MFA richiesta. */
export interface MfaVerifyRequest {
  tmpToken: string;
  code: string;
}

/** Risposta di `POST /auth/mfa-verify`: equivalente a un login riuscito. */
export interface MfaVerifyResponse {
  accessToken: string;
  user: AuthUserPayload;
}

/**
 * Risposta di `POST /auth/refresh`. Il refresh token ruotato resta nel cookie
 * httpOnly firmato `rtk`, mai esposto nel body — vedi `services/api.ts`.
 */
export interface RefreshResponse {
  accessToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

/** Sempre esito generico positivo, anche se l'email non esiste (anti user-enumeration). */
export interface ForgotPasswordResponse {
  success: boolean;
  message?: string;
}

/** Richiesta di `POST /auth/activate` (primo accesso via link email). */
export interface ActivateAccountRequest {
  token: string;
  password: string;
}

/** Richiesta di `POST /auth/reset-password` (reimpostazione dopo "password dimenticata"). */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface SetPasswordResponse {
  success: boolean;
}

/**
 * Risposta di `GET /auth/me` — dati anagrafici e stato MFA dell'utente autenticato.
 * Usata in `pages/profile/PageProfile.tsx`.
 */
export interface MeResponse {
  id: number;
  guid: string;
  name: string;
  surname?: string;
  email: string;
  role: number;
  scopeId: string | null;
  isMfaEnabled: boolean;
  /** Presente solo durante una sessione di impersonificazione: id del SuperAdmin reale. */
  impersonatedBy?: number;
}

/** Richiesta di `PATCH /auth/me` — aggiornamento self-service anagrafica. */
export interface UpdateProfileRequest {
  name: string;
  surname?: string;
}

export interface UpdateProfileResponse {
  name: string;
  surname?: string;
}

/** Richiesta di `PATCH /auth/change-password`. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
}

/** Risposta di `POST /auth/mfa-setup`: segreto TOTP + QR code da inquadrare. */
export interface MfaSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
}

/** Richiesta di `POST /auth/mfa-enable` — conferma il primo codice generato dall'app TOTP. */
export interface MfaEnableRequest {
  code: string;
}

export interface MfaEnableResponse {
  success: boolean;
}

/** Richiesta di `POST /auth/mfa-disable` — richiede un codice TOTP valido per disattivare. */
export interface MfaDisableRequest {
  code: string;
}

export interface MfaDisableResponse {
  success: boolean;
}

/**
 * Risposta di `POST /auth/impersonate/:guid` e `POST /auth/end-impersonation`.
 * Durante l'impersonificazione non viene generato alcun refresh token: il cookie
 * `rtk` del SuperAdmin reale non viene toccato (vedi CONTRACT.md).
 */
export interface ImpersonateResponse {
  accessToken: string;
  user: AuthUserPayload;
}

/**
 * Voce di `GET /auth/sessions`: una sessione "dispositivo" attiva dell'utente
 * autenticato, tracciata lato backend attraverso le rotazioni di access/refresh
 * token (vedi ADR gestione sessioni/dispositivi). `sessionId` è l'identificativo
 * opaco da passare a `DELETE /auth/sessions/:sessionId` per revocarla.
 */
export interface SessionSummary {
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  /** `true` se corrisponde alla sessione della richiesta corrente. */
  current: boolean;
}

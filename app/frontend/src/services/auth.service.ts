/**
 * Service per le chiamate API di autenticazione.
 * Riferimento: CONTRACT.md — tabella "Endpoint auth".
 */

import api from './api';
import type {
  LoginRequest,
  LoginResponse,
  MfaVerifyRequest,
  MfaVerifyResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ActivateAccountRequest,
  ResetPasswordRequest,
  SetPasswordResponse,
  ImpersonateResponse,
  MeResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  MfaSetupResponse,
  MfaEnableRequest,
  MfaEnableResponse,
  MfaDisableRequest,
  MfaDisableResponse,
  SessionSummary,
} from '../types/auth.types';

const AUTH_PREFIX = 'auth';

/** `POST /auth/login` → accesso diretto o richiesta di sfida MFA. */
export async function loginApi(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(`${AUTH_PREFIX}/login`, payload);
  return data;
}

/** `POST /auth/mfa-verify` — completa il login dopo la sfida MFA. */
export async function mfaVerifyApi(payload: MfaVerifyRequest): Promise<MfaVerifyResponse> {
  const { data } = await api.post<MfaVerifyResponse>(`${AUTH_PREFIX}/mfa-verify`, payload);
  return data;
}

/** `POST /auth/logout` — invalida la sessione corrente (`login:${token}` in Redis). */
export async function logoutApi(): Promise<void> {
  await api.post(`${AUTH_PREFIX}/logout`);
}

/** `POST /auth/forgot-password` — esito sempre generico (anti user-enumeration). */
export async function forgotPasswordApi(
  payload: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> {
  const { data } = await api.post<ForgotPasswordResponse>(
    `${AUTH_PREFIX}/forgot-password`,
    payload,
  );
  return data;
}

/** `POST /auth/activate` — primo accesso, imposta la password via token ricevuto per email. */
export async function activateAccountApi(
  payload: ActivateAccountRequest,
): Promise<SetPasswordResponse> {
  const { data } = await api.post<SetPasswordResponse>(`${AUTH_PREFIX}/activate`, payload);
  return data;
}

/** `POST /auth/reset-password` — reimposta la password dopo "password dimenticata". */
export async function resetPasswordApi(
  payload: ResetPasswordRequest,
): Promise<SetPasswordResponse> {
  const { data } = await api.post<SetPasswordResponse>(`${AUTH_PREFIX}/reset-password`, payload);
  return data;
}

/** `POST /auth/request-activation` — reinvio email di attivazione (Admin+). */
export async function requestActivationApi(userGuid: string): Promise<void> {
  await api.post(`${AUTH_PREFIX}/request-activation`, { userGuid });
}

/**
 * Avvia l'impersonificazione dell'utente con il `guid` indicato (SuperAdmin only).
 * Non genera un nuovo refresh token: il cookie `rtk` del SuperAdmin reale resta invariato.
 */
export async function impersonateApi(guid: string): Promise<ImpersonateResponse> {
  const { data } = await api.post<ImpersonateResponse>(`${AUTH_PREFIX}/impersonate/${guid}`);
  return data;
}

/** Termina la sessione di impersonificazione corrente e ripristina il SuperAdmin originale. */
export async function endImpersonationApi(): Promise<ImpersonateResponse> {
  const { data } = await api.post<ImpersonateResponse>(`${AUTH_PREFIX}/end-impersonation`);
  return data;
}

/** Recupera i dati anagrafici e lo stato MFA dell'utente autenticato. */
export async function getMeApi(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>(`${AUTH_PREFIX}/me`);
  return data;
}

/** Aggiorna nome e cognome dell'utente autenticato (self-service, qualsiasi ruolo). */
export async function updateProfileApi(
  payload: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  const { data } = await api.patch<UpdateProfileResponse>(`${AUTH_PREFIX}/me`, payload);
  return data;
}

/** Cambia la password dell'utente autenticato (richiede la password attuale). */
export async function changePasswordApi(
  payload: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  const { data } = await api.patch<ChangePasswordResponse>(
    `${AUTH_PREFIX}/change-password`,
    payload,
  );
  return data;
}

/** Genera secret TOTP e QR code per avviare la configurazione MFA (non persiste ancora). */
export async function mfaSetupApi(): Promise<MfaSetupResponse> {
  const { data } = await api.post<MfaSetupResponse>(`${AUTH_PREFIX}/mfa-setup`);
  return data;
}

/** Conferma il setup MFA verificando il codice TOTP generato dal secret: persiste `totpSecret`. */
export async function mfaEnableApi(payload: MfaEnableRequest): Promise<MfaEnableResponse> {
  const { data } = await api.post<MfaEnableResponse>(`${AUTH_PREFIX}/mfa-enable`, payload);
  return data;
}

/** Disabilita la MFA per l'utente autenticato (richiede un codice TOTP valido). */
export async function mfaDisableApi(payload: MfaDisableRequest): Promise<MfaDisableResponse> {
  const { data } = await api.post<MfaDisableResponse>(`${AUTH_PREFIX}/mfa-disable`, payload);
  return data;
}

/** `GET /auth/sessions` — elenca le sessioni/dispositivi attivi dell'utente autenticato. */
export async function getSessionsApi(): Promise<SessionSummary[]> {
  const { data } = await api.get<SessionSummary[]>(`${AUTH_PREFIX}/sessions`);
  return data;
}

/** `DELETE /auth/sessions/:sessionId` — revoca una sessione/dispositivo dell'utente autenticato. */
export async function revokeSessionApi(sessionId: string): Promise<void> {
  await api.delete(`${AUTH_PREFIX}/sessions/${sessionId}`);
}

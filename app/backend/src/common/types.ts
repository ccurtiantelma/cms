import { AppUserRoles } from './enums';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- unico modo per estendere Express.Request globalmente
  namespace Express {
    interface Request {
      authInfo?: AuthInfo;
    }
  }
}

/**
 * Payload decodificato dal JWT di accesso e propagato su `req.authInfo`
 * dall'`AuthMiddleware`. `scopeId` è il campo generico di scoping
 * multi-tenant/multi-sede del CMS (vedi `Utils.applyScopeFilter`).
 */
export interface AuthInfo {
  userId: number;
  role: AppUserRoles;
  name: string;
  scopeId: string | null;
  /** Presente solo durante una sessione di impersonificazione: id del SuperAdmin reale */
  impersonatedBy?: number;
}

/**
 * Risposta di `GET /auth/me`: estende `AuthInfo` (payload JWT) con i campi
 * letti a runtime dal DB, necessari alla pagina profilo utente.
 */
export interface MeResponse extends AuthInfo {
  guid: string;
  surname: string | null;
  email: string;
  isMfaEnabled: boolean;
}

export interface PaginationParams {
  p: number;
  i: number;
  q?: string;
  o?: string;
  d?: string;
}

/** Parametri di filtro per GET /app/admin/audit-log. */
export interface AuditLogQueryParams {
  p: number;
  i: number;
  userId?: number;
  action?: string;
  from?: string;
  to?: string;
}

/** Parametri di filtro per GET /app/notifications. */
export interface NotificationsQueryParams {
  p: number;
  i: number;
  unreadOnly?: boolean;
}

/** Parametri di filtro per GET /app/pages. */
export interface PagesQueryParams extends PaginationParams {
  status?: string;
  locale?: string;
}

/** Parametri di filtro per GET /app/files (RFC-F09 § 1, T1). */
export interface FilesQueryParams {
  p: number;
  i: number;
  /** Ricerca su `originalName` (`ILIKE %q%`). */
  q?: string;
  /** Match esatto su `mimeType`, non prefix. */
  mimeType?: string;
}

/** Parametri di filtro per GET /app/site-templates. */
export interface SiteTemplatesQueryParams extends PaginationParams {
  /** Match esatto su `type` (`SiteTemplateType`). */
  type?: string;
  /** Match esatto su `language`. */
  language?: string;
  isPublished?: boolean;
}

/** Parametri di filtro per GET /app/forms/submissions (ADR-46 § 4). */
export interface FormSubmissionsQueryParams extends PaginationParams {
  /** Match esatto su `formKey`, opzionale (assente = tutti gli Invii). */
  formKey?: string;
}

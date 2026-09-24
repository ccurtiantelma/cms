/**
 * Service per le chiamate API del modulo `app/admin` — gestione utenti
 * e audit log (vedi CONTRACT.md — tabella "Endpoint admin").
 */

import api from './api';
import type { Pagination, PaginationParams } from '../types/common.types';
import type { UserRoleSummary } from '../types/roles.types';

const ADMIN_PREFIX = 'app/admin';

/** Riga elenco utenti — colonne sensibili (pwd, totpSecret, actionToken) escluse dal backend. */
export interface UserListItem {
  guid: string;
  name: string;
  surname?: string;
  email: string;
  role: number;
  scopeId: string | null;
  isActive: boolean;
  isMfaEnabled: boolean;
  createdAt: string;
}

export interface UserDetail extends UserListItem {
  updatedAt: string;
  /** Ruoli personalizzati aggiuntivi assegnati (SPEC-RBAC-F2a S19); mai i ruoli di sistema. */
  roles: UserRoleSummary[];
}

export interface AdminUsersQueryParams extends PaginationParams {
  role?: number;
  isActive?: boolean;
}

export interface CreateUserRequest {
  name: string;
  surname?: string;
  email: string;
  role: number;
  scopeId?: string | null;
  /** Ruoli personalizzati da assegnare; richiede `users:assign_roles` (SPEC-RBAC-F2a S18). */
  roleGuids?: string[];
}

export interface UpdateUserRequest {
  name?: string;
  surname?: string;
  email?: string;
  role?: number;
  scopeId?: string | null;
  /**
   * Insieme completo dei ruoli personalizzati: sostituisce quello attuale, `[]` li toglie tutti.
   * Assente = invariati (SPEC-RBAC-F2a S18).
   */
  roleGuids?: string[];
}

export interface AuditLogItem {
  guid: string;
  userId: number | null;
  impersonatedBy: number | null;
  action: string;
  entity?: string;
  entityId?: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

export interface AuditLogQueryParams extends PaginationParams {
  userId?: number;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** `GET /app/admin/users` — elenco paginato utenti (GuardAdmin). */
export async function fetchUsers(params: AdminUsersQueryParams): Promise<Pagination<UserListItem>> {
  const { data } = await api.get<Pagination<UserListItem>>(`${ADMIN_PREFIX}/users`, { params });
  return data;
}

/** `POST /app/admin/users` — un Admin non può creare un utente SuperAdmin. */
export async function createUser(payload: CreateUserRequest): Promise<{ guid: string }> {
  const { data } = await api.post<{ guid: string }>(`${ADMIN_PREFIX}/users`, payload);
  return data;
}

/** `GET /app/admin/users/:guid` — dettaglio utente, con i ruoli personalizzati assegnati. */
export async function fetchUser(guid: string): Promise<UserDetail> {
  const { data } = await api.get<UserDetail>(`${ADMIN_PREFIX}/users/${guid}`);
  return data;
}

/** `PATCH /app/admin/users/:guid` — aggiornamento anagrafica/ruolo/scope. */
export async function updateUser(
  guid: string,
  payload: UpdateUserRequest,
): Promise<{ guid: string }> {
  const { data } = await api.patch<{ guid: string }>(`${ADMIN_PREFIX}/users/${guid}`, payload);
  return data;
}

/** `PATCH /app/admin/users/:guid/toggle-active` — attiva/disattiva (soft delete). */
export async function toggleActiveUser(guid: string): Promise<{ guid: string; isActive: boolean }> {
  const { data } = await api.patch<{ guid: string; isActive: boolean }>(
    `${ADMIN_PREFIX}/users/${guid}/toggle-active`,
  );
  return data;
}

/** `POST /app/admin/users/:guid/reset-mfa` — disattiva la MFA dell'utente indicato. */
export async function resetMfaUser(guid: string): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(`${ADMIN_PREFIX}/users/${guid}/reset-mfa`);
  return data;
}

/** `GET /app/admin/audit-log` — elenco paginato con filtri `userId,action,dateFrom,dateTo`. */
export async function fetchAuditLog(
  params: AuditLogQueryParams,
): Promise<Pagination<AuditLogItem>> {
  const { data } = await api.get<Pagination<AuditLogItem>>(`${ADMIN_PREFIX}/audit-log`, { params });
  return data;
}

/** `POST /app/admin/system/seed-demo` — crea utenti demo (1 per ruolo). GuardSuperAdmin. */
export async function seedDemo(): Promise<void> {
  await api.post(`${ADMIN_PREFIX}/system/seed-demo`);
}

/**
 * `POST /app/admin/system/rebuild-static-site` — accoda la rigenerazione di
 * tutte le Pagine pubblicate del sito statico (ADR-67). GuardSuperAdmin.
 */
export async function rebuildStaticSite(): Promise<void> {
  await api.post(`${ADMIN_PREFIX}/system/rebuild-static-site`);
}

/** `POST /app/admin/system/reset-demo` — wipe transazionale FK-safe, mantiene il SuperAdmin. GuardSuperAdmin. */
export async function resetDemo(): Promise<void> {
  await api.post(`${ADMIN_PREFIX}/system/reset-demo`);
}

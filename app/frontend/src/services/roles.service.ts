/**
 * Service per le rotte di ruoli e catalogo permessi (SPEC-RBAC-F2a § Endpoint API). I permessi
 * indicati sono quelli controllati dal `PermissionsGuard` del backend.
 */

import api from './api';
import type {
  CreateRolePayload,
  PermissionGroup,
  RoleRecord,
  UpdateRolePayload,
} from '../types/roles.types';

const ADMIN_PREFIX = 'app/admin';

/** `GET /app/admin/roles` — prima i ruoli di sistema, poi i personalizzati per nome. `roles:read`. */
export async function fetchRoles(): Promise<RoleRecord[]> {
  const { data } = await api.get<RoleRecord[]>(`${ADMIN_PREFIX}/roles`);
  return data;
}

/** `GET /app/admin/permissions` — catalogo raggruppato per categoria. `roles:read`. */
export async function fetchPermissionCatalog(): Promise<PermissionGroup[]> {
  const { data } = await api.get<PermissionGroup[]>(`${ADMIN_PREFIX}/permissions`);
  return data;
}

/** `POST /app/admin/roles` — crea un ruolo personalizzato. `roles:manage`. */
export async function createRole(payload: CreateRolePayload): Promise<{ guid: string }> {
  const { data } = await api.post<{ guid: string }>(`${ADMIN_PREFIX}/roles`, payload);
  return data;
}

/** `PATCH /app/admin/roles/:guid` — aggiorna un ruolo personalizzato. `roles:manage`. */
export async function updateRole(
  guid: string,
  payload: UpdateRolePayload,
): Promise<{ guid: string }> {
  const { data } = await api.patch<{ guid: string }>(`${ADMIN_PREFIX}/roles/${guid}`, payload);
  return data;
}

/** `DELETE /app/admin/roles/:guid` — `204`, oppure `409 ROLE_IN_USE` se assegnato. `roles:manage`. */
export async function deleteRole(guid: string): Promise<void> {
  await api.delete(`${ADMIN_PREFIX}/roles/${guid}`);
}

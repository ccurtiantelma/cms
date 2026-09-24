import { PermissionCategory, PermissionCode } from '../../permissions/permissions.registry';

/** Formato del `code` di un ruolo personalizzato: slug minuscolo, 3–50 caratteri. */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,49}$/;

/** Input di creazione di un ruolo personalizzato (diventa un DTO `class-validator` in F2). */
export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string | null;
  permissionCodes: PermissionCode[];
}

/** Input di modifica: `code` è immutabile. */
export type UpdateRoleInput = Partial<Omit<CreateRoleInput, 'code'>>;

/** Vista di un ruolo con i suoi codici permesso. */
export interface RoleView {
  guid: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  level: number | null;
  permissions: PermissionCode[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Permessi del registro raggruppati per categoria (sola lettura). */
export interface PermissionGroup {
  category: PermissionCategory;
  permissions: { code: PermissionCode; description: string | null }[];
}

/**
 * Utente destinatario di un'assegnazione di ruoli: `id` è `null` per un utente
 * non ancora creato (`AdminService.createUser`), che non ha ruoli attuali.
 */
export interface UserRolesTarget {
  id: number | null;
  role: number;
}

/** Ruolo aggiunto o rimosso da un piano di assegnazione. */
export interface UserRolesPlanEntry {
  id: number;
  code: string;
}

/**
 * Esito di `RolesService.planUserRoles`: insieme desiderato già validato
 * (permesso, esistenza, S9, anti-escalation), senza nessuna scrittura. Lo
 * applica `applyUserRoles` dentro la transazione del chiamante (SPEC-RBAC-F2a S17).
 */
export interface UserRolesPlan {
  /** Guid desiderati, deduplicati. */
  roleGuids: string[];
  added: UserRolesPlanEntry[];
  removed: UserRolesPlanEntry[];
  /** `false` se l'insieme desiderato coincide con l'attuale: nessuna scrittura, invalidazione o audit. */
  changed: boolean;
}

/** Ruolo personalizzato assegnato a un utente (dettaglio utente, SPEC-RBAC-F2a S19). */
export interface UserRoleSummary {
  guid: string;
  code: string;
  name: string;
}

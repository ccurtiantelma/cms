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

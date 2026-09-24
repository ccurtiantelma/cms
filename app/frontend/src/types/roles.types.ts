/**
 * Tipi del dominio ruoli e permessi lato frontend (ADR-99, SPEC-RBAC-F2b § DTO). Scritti a mano
 * sul contratto di SPEC-RBAC-F2a e non derivati da `api.types.ts`: lì `description` dei DTO di
 * scrittura è tipizzato `Record<string, never> | null` (SPEC F2b S36, debito dichiarato).
 */

/**
 * Codici permesso letti dalla UI (SPEC F2b S29). Non è una copia del registro backend
 * (`permissions.registry.ts`): si estende quando nasce un nuovo consumer.
 */
export type PermissionCode = 'roles:read' | 'roles:manage' | 'users:assign_roles';

/**
 * Specchio di `SYSTEM_RESERVED_PERMISSIONS` (backend, `permissions.registry.ts`): mai selezionabili
 * in un ruolo personalizzato. Se diverge, il backend risponde comunque `400 RESERVED_PERMISSION`.
 */
export const RESERVED_PERMISSIONS: readonly string[] = ['roles:manage'];

/** Categorie del registro backend (`PERMISSION_CATEGORIES`). */
export type PermissionCategory = 'pages' | 'structure' | 'media' | 'forms' | 'settings' | 'users';

/** Etichette italiane delle categorie; una categoria assente mostra il codice grezzo (S33). */
export const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  pages: 'Pagine',
  structure: 'Struttura',
  media: 'Media',
  forms: 'Moduli',
  settings: 'Impostazioni',
  users: 'Utenti',
};

/** Voce del catalogo permessi (`GET app/admin/permissions`). */
export interface PermissionItem {
  code: string;
  description: string | null;
}

/** Gruppo del catalogo permessi, nell'ordine del backend. */
export interface PermissionGroup {
  /** Stringa aperta: una categoria nuova del backend non rompe la UI (S33). */
  category: PermissionCategory | (string & {});
  permissions: PermissionItem[];
}

/** Ruolo con i suoi codici permesso (`GET app/admin/roles`). */
export interface RoleRecord {
  guid: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Valore `AppUserRoles` per i ruoli di sistema, `null` per i personalizzati. */
  level: number | null;
  permissions: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** Body di `POST app/admin/roles`. */
export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string | null;
  permissionCodes: string[];
}

/** Body di `PATCH app/admin/roles/:guid`: almeno un campo (S35), `code` non ammesso (F2a S23). */
export type UpdateRolePayload = Partial<Omit<CreateRolePayload, 'code'>>;

/** Ruolo personalizzato assegnato a un utente (`GET app/admin/users/:guid` → `roles`). */
export interface UserRoleSummary {
  guid: string;
  code: string;
  name: string;
}

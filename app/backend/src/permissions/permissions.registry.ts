import { createHash } from 'node:crypto';
import { AppUserRoles } from '../common/enums';

/**
 * Registro versionato dei permessi granulari (ADR-99 § 3, SPEC-RBAC-F1 § "Registro").
 *
 * È l'unica fonte dei codici: `PermissionsSeedService` sincronizza il DB su
 * questo file a ogni avvio e i permessi non si creano mai da API/UI. Regola di
 * ADR-99 § 3: un codice entra qui solo se esiste un punto di enforcement nel
 * codice. Per questo `forms:manage`, `settings:manage_redirects` e
 * `blocks:html_embed`, proposti dal catalogo di ADR-99 § 4, sono esclusi:
 * entreranno con il modulo che li applica.
 *
 * Qualsiasi modifica a questo file cambia `computeRegistryHash()` e quindi
 * invalida da sola tutte le chiavi di cache `perm:v<hash>:user:<id>`.
 */

export const PERMISSION_CATEGORIES = [
  'pages',
  'structure',
  'media',
  'forms',
  'settings',
  'users',
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

/** Voce del registro: `code` nel formato `risorsa:azione`, minuscolo snake_case. */
export interface PermissionDefinition {
  code: string;
  category: PermissionCategory;
  description: string;
}

export const PERMISSIONS = [
  { code: 'pages:create', category: 'pages', description: 'Creare una Pagina' },
  {
    code: 'pages:edit_own',
    category: 'pages',
    description: 'Modificare una Pagina propria (bozza)',
  },
  { code: 'pages:edit_any', category: 'pages', description: 'Modificare una Pagina di altri' },
  {
    code: 'pages:submit_review',
    category: 'pages',
    description: 'Inviare una Pagina in revisione',
  },
  {
    code: 'pages:publish',
    category: 'pages',
    description: 'Pubblicare, programmare e archiviare una Pagina',
  },
  {
    code: 'pages:restore_revision',
    category: 'pages',
    description: 'Ripristinare una Revisione passata',
  },
  { code: 'pages:delete', category: 'pages', description: 'Soft delete di una Pagina' },
  { code: 'templates:manage', category: 'structure', description: 'Gestire i Template' },
  {
    code: 'global_sections:manage',
    category: 'structure',
    description: 'Gestire le Sezioni globali',
  },
  { code: 'media:upload', category: 'media', description: 'Caricare Media' },
  { code: 'media:delete_any', category: 'media', description: 'Eliminare Media di altri' },
  {
    code: 'forms:read_submissions',
    category: 'forms',
    description: 'Leggere gli Invii dei moduli',
  },
  {
    code: 'settings:manage_theme',
    category: 'settings',
    description: 'Gestire tema e risorse globali',
  },
  {
    code: 'settings:manage_locales',
    category: 'settings',
    description: 'Gestire Locale e impostazioni multilingua',
  },
  { code: 'users:read', category: 'users', description: 'Consultare gli utenti' },
  { code: 'users:write', category: 'users', description: 'Creare e modificare gli utenti' },
  {
    code: 'users:assign_roles',
    category: 'users',
    description: 'Assegnare ruoli aggiuntivi agli utenti',
  },
  { code: 'roles:read', category: 'users', description: 'Consultare ruoli e permessi' },
  {
    code: 'roles:manage',
    category: 'users',
    description: 'Creare, modificare ed eliminare ruoli personalizzati',
  },
  { code: 'audit:read', category: 'users', description: "Consultare l'audit log" },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

/** Tutti i codici del registro, nell'ordine dichiarato. */
export const ALL_PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map((p) => p.code);

const PERMISSION_CODE_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_CODES);

/** Type guard: `true` se `value` è un codice del registro. */
export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODE_SET.has(value);
}

/**
 * Codici che non possono comparire in un ruolo personalizzato (SPEC S6, ADR-99
 * P2). Senza questo vincolo un SuperAdmin potrebbe inserire `roles:manage` in un
 * ruolo custom assegnato a un Admin, aggirando la firma "solo SuperAdmin".
 */
export const SYSTEM_RESERVED_PERMISSIONS: readonly PermissionCode[] = ['roles:manage'];

export const SYSTEM_ROLE_CODES = ['superadmin', 'admin', 'manager', 'user'] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

/** Ruolo di sistema: specchio di una soglia `AppUserRoles`, permessi in sola lettura (P3). */
export interface SystemRoleDefinition {
  code: SystemRoleCode;
  level: AppUserRoles;
  name: string;
  description: string;
  permissions: readonly PermissionCode[];
}

const USER_PERMISSIONS: readonly PermissionCode[] = [
  'pages:create',
  'pages:edit_own',
  'pages:submit_review',
  'media:upload',
];

const MANAGER_PERMISSIONS: readonly PermissionCode[] = [
  ...USER_PERMISSIONS,
  'pages:edit_any',
  'pages:publish',
  'pages:restore_revision',
  'templates:manage',
  'global_sections:manage',
  'forms:read_submissions',
];

/** `admin` ha `roles:read` ma non `roles:manage` (ADR-99 § "Decisione umana", P2). */
const ADMIN_PERMISSIONS: readonly PermissionCode[] = [
  ...MANAGER_PERMISSIONS,
  'pages:delete',
  'media:delete_any',
  'settings:manage_theme',
  'settings:manage_locales',
  'users:read',
  'users:write',
  'users:assign_roles',
  'roles:read',
  'audit:read',
];

/**
 * I 4 ruoli di sistema, derivati dalla matrice `business-rules.md` § "Permessi
 * editoriali". `superadmin` riceve **tutti** i codici del registro (non un
 * elenco), così un codice nuovo gli arriva senza modifiche a questa mappa.
 */
export const SYSTEM_ROLES: Readonly<Record<SystemRoleCode, SystemRoleDefinition>> = {
  superadmin: {
    code: 'superadmin',
    level: AppUserRoles.SuperAdmin,
    name: 'SuperAdmin',
    description: 'Ruolo di sistema: tutti i permessi del registro.',
    permissions: ALL_PERMISSION_CODES,
  },
  admin: {
    code: 'admin',
    level: AppUserRoles.Admin,
    name: 'Admin',
    description: 'Ruolo di sistema: soglia Admin.',
    permissions: ADMIN_PERMISSIONS,
  },
  manager: {
    code: 'manager',
    level: AppUserRoles.Manager,
    name: 'Manager',
    description: 'Ruolo di sistema: soglia Manager.',
    permissions: MANAGER_PERMISSIONS,
  },
  user: {
    code: 'user',
    level: AppUserRoles.User,
    name: 'User',
    description: 'Ruolo di sistema: soglia User.',
    permissions: USER_PERMISSIONS,
  },
};

/**
 * Hash del contenuto del registro (SPEC S3): primi 12 caratteri hex dello
 * `sha256` del JSON canonico `{ permissions, systemRoles }`, con codici e
 * chiavi ordinati. Cambia solo se cambiano i codici o la mappa di un ruolo di
 * sistema, non per descrizioni o ordine di dichiarazione.
 * @param permissions Registro da hashare (default: `PERMISSIONS`); parametrico per i test.
 * @param systemRoles Mappa dei ruoli di sistema (default: `SYSTEM_ROLES`).
 */
export function computeRegistryHash(
  permissions: readonly { code: string }[] = PERMISSIONS,
  systemRoles: Readonly<Record<string, { permissions: readonly string[] }>> = SYSTEM_ROLES,
): string {
  const canonicalRoles: Record<string, string[]> = {};
  for (const code of Object.keys(systemRoles).sort()) {
    canonicalRoles[code] = [...systemRoles[code].permissions].sort();
  }
  const canonical = JSON.stringify({
    permissions: permissions.map((p) => p.code).sort(),
    systemRoles: canonicalRoles,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

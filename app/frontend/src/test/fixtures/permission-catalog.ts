/**
 * Catalogo permessi come lo restituisce `GET app/admin/permissions`: i 20 codici del registro
 * backend (`permissions.registry.ts`) raggruppati nell'ordine di `PERMISSION_CATEGORIES`.
 */
import type { PermissionGroup } from '../../types/roles.types';

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    category: 'pages',
    permissions: [
      { code: 'pages:create', description: 'Creare una Pagina' },
      { code: 'pages:edit_own', description: 'Modificare una Pagina propria (bozza)' },
      { code: 'pages:edit_any', description: 'Modificare una Pagina di altri' },
      { code: 'pages:submit_review', description: 'Inviare una Pagina in revisione' },
      { code: 'pages:publish', description: 'Pubblicare, programmare e archiviare una Pagina' },
      { code: 'pages:restore_revision', description: 'Ripristinare una Revisione passata' },
      { code: 'pages:delete', description: 'Soft delete di una Pagina' },
    ],
  },
  {
    category: 'structure',
    permissions: [
      { code: 'templates:manage', description: 'Gestire i Template' },
      { code: 'global_sections:manage', description: 'Gestire le Sezioni globali' },
    ],
  },
  {
    category: 'media',
    permissions: [
      { code: 'media:upload', description: 'Caricare Media' },
      { code: 'media:delete_any', description: 'Eliminare Media di altri' },
    ],
  },
  {
    category: 'forms',
    permissions: [{ code: 'forms:read_submissions', description: 'Leggere gli Invii dei moduli' }],
  },
  {
    category: 'settings',
    permissions: [
      { code: 'settings:manage_theme', description: 'Gestire tema e risorse globali' },
      { code: 'settings:manage_locales', description: 'Gestire Locale e impostazioni multilingua' },
    ],
  },
  {
    category: 'users',
    permissions: [
      { code: 'users:read', description: 'Consultare gli utenti' },
      { code: 'users:write', description: 'Creare e modificare gli utenti' },
      { code: 'users:assign_roles', description: 'Assegnare ruoli aggiuntivi agli utenti' },
      { code: 'roles:read', description: 'Consultare ruoli e permessi' },
      { code: 'roles:manage', description: 'Creare, modificare ed eliminare ruoli personalizzati' },
      { code: 'audit:read', description: "Consultare l'audit log" },
    ],
  },
];

/** Tutti i 20 codici: i permessi effettivi di un SuperAdmin. */
export const ALL_PERMISSION_CODES: string[] = PERMISSION_CATALOG.flatMap((group) =>
  group.permissions.map((p) => p.code),
);

/** Permessi di un Admin col seed attuale: tutti tranne `roles:manage` (ADR-99 P2). */
export const ADMIN_PERMISSION_CODES: string[] = ALL_PERMISSION_CODES.filter(
  (code) => code !== 'roles:manage',
);

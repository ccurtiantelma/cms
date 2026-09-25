/**
 * Configurazione delle voci di navigazione della sidebar protetta.
 * Riferimento ruoli: CONTRACT.md / `types/common.types.ts` → `AppUserRoles`.
 */
import type { Icon as TablerIcon } from '@tabler/icons-react';
import {
  IconFileText,
  IconLayoutDashboard,
  IconLayoutNavbar,
  IconPalette,
  IconShieldLock,
  IconTemplate,
  IconUsers,
} from '@tabler/icons-react';
import { AppUserRoles } from '../types/common.types';
import type { PermissionCode } from '../types/roles.types';

/** Voce di navigazione della sidebar. */
export interface NavigationItem {
  label: string;
  path: string;
  icon: TablerIcon;
  /** Ruoli autorizzati a vedere la voce; `undefined` = nessuna restrizione (tutti i ruoli). */
  roles?: AppUserRoles[];
  /**
   * Permesso richiesto per vedere la voce (ADR-99 § 10); `undefined` = nessuno. Se presente
   * insieme a `roles` valgono entrambi (AND).
   */
  permission?: PermissionCode;
}

/**
 * Visibilità di una voce nella sidebar: `roles` rispettato se presente **e** `permission`
 * rispettato se presente (SPEC-RBAC-F2b S31). Con permessi non ancora caricati (`null`) una
 * voce con `permission` resta nascosta.
 * @param item Voce di navigazione.
 * @param role Ruolo base dell'utente, `undefined` se non noto.
 * @param permissions Permessi effettivi dell'utente, `null` se non ancora caricati.
 */
export function isNavigationItemVisible(
  item: NavigationItem,
  role: number | undefined,
  permissions: readonly string[] | null,
): boolean {
  if (item.roles && (role === undefined || !item.roles.includes(Number(role) as AppUserRoles))) {
    return false;
  }
  if (item.permission && !permissions?.includes(item.permission)) return false;
  return true;
}

// Difesa in profondità: la barriera reale è il guard lato backend
// (`GuardAdmin`/`GuardSuperAdmin`) e la protezione di rotta in `App.tsx`;
// questa restrizione evita comunque che le voci trapelino nella sidebar in
// caso di regressione del guard.
export const navigationItems: NavigationItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: IconLayoutDashboard,
  },
  {
    label: 'Pagine',
    path: '/pages',
    icon: IconFileText,
    // Nessuna restrizione di ruolo: l'API applica ownership per riga (ADR-18),
    // un `User` vede/gestisce solo le proprie Pagine in `draft`.
  },
  {
    label: 'Editor tema',
    path: '/theme-editor',
    icon: IconPalette,
    // ADR-4 § 4: il tema di installazione è SuperAdmin-only. La restrizione era
    // sparita insieme al `GuardSuperAdmin` del `PUT` (commit `8b272f7`),
    // ripristinata il 2026-09-11 insieme a quello.
    roles: [AppUserRoles.SuperAdmin],
  },
  {
    label: 'Sezioni Globali',
    path: '/global-sections',
    icon: IconLayoutNavbar,
    // Soglia `Manager`+, la stessa del `GuardManager` sul controller admin
    // (ADR-40): le Sezioni Globali non hanno ownership per riga.
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin, AppUserRoles.Manager],
  },
  {
    label: 'Template Editor',
    path: '/site-templates',
    icon: IconTemplate,
    // Stessa soglia `Manager`+ delle Sezioni Globali (RFC-40 Opzione B): i
    // Template di tema non hanno ownership per riga.
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin, AppUserRoles.Manager],
  },
  {
    label: 'Utenti',
    path: '/users',
    icon: IconUsers,
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin],
  },
  {
    label: 'Ruoli',
    path: '/roles',
    icon: IconShieldLock,
    // Per permesso e senza `roles` (ADR-99 § 10, SPEC-RBAC-F2b S31): il backend ammette chiunque
    // abbia `roles:read`, anche uno User con un ruolo personalizzato.
    permission: 'roles:read',
  },
];

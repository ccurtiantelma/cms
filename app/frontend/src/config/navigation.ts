/**
 * Configurazione delle voci di navigazione della sidebar protetta.
 * Riferimento ruoli: CONTRACT.md / `types/common.types.ts` → `AppUserRoles`.
 */
import type { Icon as TablerIcon } from '@tabler/icons-react';
import { IconLayoutDashboard, IconUsers, IconHistory } from '@tabler/icons-react';
import { AppUserRoles } from '../types/common.types';

/** Voce di navigazione della sidebar. */
export interface NavigationItem {
  label: string;
  path: string;
  icon: TablerIcon;
  /** Ruoli autorizzati a vedere la voce; `undefined` = nessuna restrizione (tutti i ruoli). */
  roles?: AppUserRoles[];
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
    label: 'Utenti',
    path: '/users',
    icon: IconUsers,
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin],
  },
  {
    label: 'Audit Log',
    path: '/audit-log',
    icon: IconHistory,
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin],
  },
];

/**
 * Configurazione delle voci di navigazione della sidebar protetta.
 * Riferimento ruoli: CONTRACT.md / `types/common.types.ts` → `AppUserRoles`.
 */
import type { Icon as TablerIcon } from '@tabler/icons-react';
import {
  IconFileText,
  IconLayoutDashboard,
  IconLayoutNavbar,
  IconUsers,
} from '@tabler/icons-react';
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
    label: 'Pagine',
    path: '/pages',
    icon: IconFileText,
    // Nessuna restrizione di ruolo: l'API applica ownership per riga (ADR-18),
    // un `User` vede/gestisce solo le proprie Pagine in `draft`.
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
    label: 'Utenti',
    path: '/users',
    icon: IconUsers,
    roles: [AppUserRoles.SuperAdmin, AppUserRoles.Admin],
  },
];

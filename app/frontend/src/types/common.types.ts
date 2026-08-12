/**
 * Ruoli applicativi RBAC a soglie. Numero minore = privilegio maggiore.
 * Deve combaciare esattamente con `AppUserRoles` in `app/backend/src/common/enums.ts`.
 */
export enum AppUserRoles {
  SuperAdmin = 5,
  Admin = 10,
  Manager = 20,
  User = 30,
}

/** Etichette IT per la UI (select, tabelle, badge ruolo). */
export const ROLE_LABELS: Record<AppUserRoles, string> = {
  [AppUserRoles.SuperAdmin]: 'Super Admin',
  [AppUserRoles.Admin]: 'Admin',
  [AppUserRoles.Manager]: 'Manager',
  [AppUserRoles.User]: 'Utente',
};

/** Utente autenticato come esposto/cachato lato frontend (localStorage `auth_user`). */
export interface AuthUser {
  id: number;
  guid: string;
  name: string;
  /** Cognome — opzionale, presente nella risposta di GET /auth/me. */
  surname?: string;
  email: string;
  role: number;
  scopeId: string | null;
}

/**
 * Busta di paginazione standard restituita dagli endpoint elenco
 * (`?p=&i=&q=&o=&d=` → `Pagination<T>`).
 */
export interface Pagination<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
}

/** Parametri di query standard per gli endpoint paginati. */
export interface PaginationParams {
  /** Numero pagina (1-based). */
  p?: number;
  /** Elementi per pagina. */
  i?: number;
  /** Testo di ricerca libero. */
  q?: string;
  /** Campo di ordinamento. */
  o?: string;
  /** Direzione di ordinamento. */
  d?: 'asc' | 'desc';
}

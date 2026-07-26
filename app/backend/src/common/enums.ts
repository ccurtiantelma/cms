/**
 * Ruoli applicativi RBAC a soglie. Numero minore = privilegio maggiore.
 * I guard in `src/auth/guard.ts` confrontano con `<=` rispetto a una soglia minima.
 */
export enum AppUserRoles {
  SuperAdmin = 5,
  Admin = 10,
  Manager = 20,
  User = 30,
}

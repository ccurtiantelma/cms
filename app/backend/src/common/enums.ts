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

/**
 * Slot di layout pubblico di una Sezione Globale (F06, ADR-40). `None` è lo
 * stato di default: una Sezione può esistere senza essere innestata in nessun
 * punto del layout pubblico. Al massimo una riga attiva per `Header`/`Footer`
 * (vincolo di unicità parziale in `schema.ts`).
 */
export enum GlobalSectionLayoutSlot {
  None = 'none',
  Header = 'header',
  Footer = 'footer',
}

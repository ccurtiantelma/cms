/** Esito dell'applicazione di una catena di migrazione generica. */
export interface AppliedMigrationChain<T> {
  value: T;
  /**
   * `true` quando `fromVersion` supera `currentVersion`: non un fallimento
   * di migrazione, un esito distinto che la catena non può gestire (ADR-21
   * § 1). In quel caso `value` è restituito **invariato**.
   */
  unsupported: boolean;
}

/**
 * Applica in ordine i soli gradini necessari a portare `value` da
 * `fromVersion` a `currentVersion` (`steps[fromVersion - 1]` fino a
 * `steps[currentVersion - 2]`). Se `fromVersion > currentVersion` non
 * applica nulla e segnala `unsupported: true`. Se `fromVersion ===
 * currentVersion` la catena applicata è vuota — zero gradini eseguiti, non
 * un no-op esplicito che comunque tocca `value`.
 *
 * Generico e puro: nessun I/O, nessuna eccezione. Usato sia dal motore per
 * nodo (props di un tipo) sia da quello d'envelope, stessa disciplina
 * pura/totale richiesta dalle migrazioni (ADR-21 § 3.6).
 */
export function applyMigrationChain<T>(
  value: T,
  fromVersion: number,
  currentVersion: number,
  steps: readonly ((value: T) => T)[],
): AppliedMigrationChain<T> {
  if (fromVersion > currentVersion) {
    return { value, unsupported: true };
  }

  let migrated = value;
  for (let v = fromVersion; v < currentVersion; v += 1) {
    const step = steps[v - 1];
    migrated = step(migrated);
  }
  return { value: migrated, unsupported: false };
}

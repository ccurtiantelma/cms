import { applyMigrationChain } from './migration-chain.core';
import { EnvelopeMigrationStep } from './block-migration.types';

/**
 * Versione corrente del formato d'envelope (ADR-21 § 1): le chiavi
 * `id`/`type`/`v`/`props`/`children`, non l'aggregato degli schemi dei tipi.
 * Ci si aspetta che non si muova mai.
 */
export const ENVELOPE_VERSION = 1;

/**
 * Catena di migrazione dell'envelope, applicata **prima** di quelle per nodo
 * (ADR-21 § 3 punto 8). Vuota oggi: nessun gradino esiste ancora. Dichiarata
 * come catena reale — stesso motore generico dei nodi (`migration-chain.core.ts`)
 * — e non come uno stub speciale, per coerenza con il resto del motore.
 */
export const ENVELOPE_MIGRATION_CHAIN: readonly EnvelopeMigrationStep[] = [];

/** Esito della migrazione dell'envelope, stesso spirito di `MigrateNodeOutcome`. */
export interface EnvelopeMigrationOutcome {
  envelope: Record<string, unknown>;
  /** Presente quando `fromVersion` supera `currentVersion`: stesso esito distinto dei nodi, mai un'eccezione. */
  unsupported?: { version: number; current: number };
}

/**
 * Motore di migrazione dell'envelope (PLAN-F02 T4). `fromVersion` assente in
 * lettura vale `1` (stesso criterio dei nodi, ADR-21 § 1). Puro: nessuna
 * eccezione per un esito atteso, nessuna mutazione dell'oggetto `envelope`
 * ricevuto (la catena generica produce un nuovo oggetto).
 */
export function migrateEnvelope(
  envelope: Record<string, unknown>,
  fromVersion: number = 1,
  chain: readonly EnvelopeMigrationStep[] = ENVELOPE_MIGRATION_CHAIN,
  currentVersion: number = ENVELOPE_VERSION,
): EnvelopeMigrationOutcome {
  const { value, unsupported } = applyMigrationChain(envelope, fromVersion, currentVersion, chain);
  if (unsupported) {
    return { envelope, unsupported: { version: fromVersion, current: currentVersion } };
  }
  return { envelope: value };
}

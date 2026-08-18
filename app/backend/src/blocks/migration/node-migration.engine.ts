import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import { applyMigrationChain } from './migration-chain.core';
import { MigratableBlockNode } from './block-migration.types';

/** Esito della migrazione di un singolo nodo, senza `path` (assegnato dal motore per albero, che conosce la posizione del nodo). */
export interface MigrateNodeOutcome {
  /**
   * Nodo risultante. Se migrato: `v` uguale alla versione corrente del
   * registro e `props` migrate. Se `unsupported` o se il `type` non è nel
   * registro: identico al nodo ricevuto in input, props non toccate.
   */
  node: MigratableBlockNode;
  /** Presente quando `v` del nodo supera la versione corrente del registro per il suo `type` (SPEC-F02 § 4, `BLOCK_VERSION_UNSUPPORTED`). */
  unsupported?: { type: string; v: number; current: number };
}

/**
 * Motore di migrazione **per nodo** (PLAN-F02 T4). `v` assente in input è
 * trattato come `1` (ADR-21 § 1 — il caso reale di ogni riga scritta da F01).
 *
 * - `type` non nel registro: non è compito di questo motore deciderne la
 *   validità (`BLOCK_TYPE_UNKNOWN` è del validator, T2) — non esiste uno
 *   schema di arrivo su cui migrare, il nodo passa attraverso invariato.
 * - `fromV > definition.v`: esito distinto (§ `unsupported`), mai
 *   un'eccezione — il nodo torna come ricevuto, props non toccate.
 * - Altrimenti: applica in ordine i soli gradini necessari a portare le
 *   props da `fromV` alla versione corrente del tipo; il nodo risultante ha
 *   `v: definition.v`.
 *
 * Puro: nessuna mutazione dell'oggetto `node`/`node.props` ricevuto in
 * input — ogni ramo ritorna un nodo nuovo o (nei rami "come ricevuto")
 * l'oggetto originale, mai una copia mutata in place.
 */
export function migrateBlockNode(
  node: MigratableBlockNode,
  registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
): MigrateNodeOutcome {
  const fromV = node.v ?? 1;
  const definition = registry.definitions.get(node.type);

  if (!definition) {
    return { node };
  }

  const { value: props, unsupported } = applyMigrationChain(
    node.props,
    fromV,
    definition.v,
    definition.migrations,
  );

  if (unsupported) {
    return { node, unsupported: { type: node.type, v: fromV, current: definition.v } };
  }

  return { node: { ...node, v: definition.v, props } };
}

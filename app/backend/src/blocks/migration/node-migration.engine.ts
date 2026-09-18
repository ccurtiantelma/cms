import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import { migrateSectionToContainer } from '../migrations/migrate-section-to-container';
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
 *
 * **Stadio di identità cross-type `section` → `container`** (ADR-82 §
 * "Decisione" punto 3, round R2 "parità Elementor Pro", Sub-Task S1.4):
 * applicato qui, **prima** della risoluzione `registry.definitions.get(node.type)`
 * — lo stesso punto che `ADR-21` § 3.8 riserva all'envelope, applicato prima
 * delle migrazioni per nodo, esteso a questo caso particolare in cui il
 * campo che cambia è `type`, non solo la forma delle chiavi. Solo per
 * `node.type === 'section'`: il nodo risultante (`{ type: 'container', v: 2
 * }`, già alla versione corrente — vedi `migrate-section-to-container.ts` per
 * la scelta di design) prosegue nella normale risoluzione/catena per-tipo
 * sotto, senza alcuna terza catena dedicata.
 */
export function migrateBlockNode(
  node: MigratableBlockNode,
  registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
): MigrateNodeOutcome {
  const identityMigratedNode = node.type === 'section' ? migrateSectionToContainer(node) : node;

  const fromV = identityMigratedNode.v ?? 1;
  const definition = registry.definitions.get(identityMigratedNode.type);

  if (!definition) {
    return { node: identityMigratedNode };
  }

  const { value: props, unsupported } = applyMigrationChain(
    identityMigratedNode.props,
    fromV,
    definition.v,
    definition.migrations,
  );

  if (unsupported) {
    return {
      node: identityMigratedNode,
      unsupported: { type: identityMigratedNode.type, v: fromV, current: definition.v },
    };
  }

  return { node: { ...identityMigratedNode, v: definition.v, props } };
}

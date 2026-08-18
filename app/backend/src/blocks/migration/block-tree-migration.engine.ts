import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import { migrateBlockNode } from './node-migration.engine';
import { MigratableBlockNode } from './block-migration.types';
import { BlockMigrationError, BlockTreeMigrationResult } from './block-migration-result.types';

/**
 * Motore di migrazione **per albero** (PLAN-F02 T4). Ricorre su radice e
 * discendenti applicando il motore per nodo a ciascuno, assegna il `path`
 * (`blocks[i]`, `blocks[i].children[j]`, …) a ogni esito
 * `BLOCK_VERSION_UNSUPPORTED` (stesso schema di path del validator, T2), e
 * **continua a scendere nei figli** anche quando un nodo produce quell'esito
 * — mai fermarsi al primo, stesso principio di `BlockTreeValidatorService`
 * (ADR-21 § 3.7). Puro: nessuna eccezione per un esito atteso, nessun I/O.
 *
 * @param blocks Nodi di radice, già passati dallo stadio "forma envelope".
 * @param registry Registro dei tipi da usare (default: quello di
 *   produzione). Parametro esplicito perché T7 dovrà iniettare un registro
 *   di test con un tipo a `v: 2` per verificare il motore.
 */
export function migrateBlockTree(
  blocks: MigratableBlockNode[],
  registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
): BlockTreeMigrationResult {
  const errors: BlockMigrationError[] = [];
  const migrated = blocks.map((node, index) =>
    migrateNodeRecursive(node, `blocks[${index}]`, registry, errors),
  );
  return { blocks: migrated, errors };
}

/** Migra un nodo, registra l'eventuale esito di versione non supportata con il suo `path`, e ricorre sui figli originali indipendentemente dall'esito. */
function migrateNodeRecursive(
  node: MigratableBlockNode,
  path: string,
  registry: BlockRegistry,
  errors: BlockMigrationError[],
): MigratableBlockNode {
  const { node: migratedNode, unsupported } = migrateBlockNode(node, registry);

  if (unsupported) {
    errors.push({
      code: 'BLOCK_VERSION_UNSUPPORTED',
      details: { path, type: unsupported.type, v: unsupported.v, current: unsupported.current },
    });
  }

  const children = node.children.map((child, index) =>
    migrateNodeRecursive(child, `${path}.children[${index}]`, registry, errors),
  );

  return { ...migratedNode, children };
}

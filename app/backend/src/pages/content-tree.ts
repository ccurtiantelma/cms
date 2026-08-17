import { BadRequestException } from '@nestjs/common';

/** Nodo dell'albero di blocchi (business-rules.md § Blocchi e albero di contenuto, regola 2). */
export interface BlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BlockNode[];
}

/** Forma esterna del contenuto di una Pagina/Revisione (SPEC-F01 § Forma del contenuto). */
export interface ContentTree {
  version: number;
  blocks: BlockNode[];
}

/**
 * Valida solo la **forma esterna** dell'albero blocchi: `version` numerico,
 * `blocks` array, ogni nodo con `id`/`type` stringa non vuota, `props`
 * oggetto, `children` array (ricorsivo a qualunque profondità). F01 non
 * conosce il registro dei tipi di blocco (arriva con F02): non interpreta
 * `props` né valida `type`/annidamento per dominio. Un albero non conforme è
 * respinto **integralmente** con `400` e il path del primo nodo colpevole —
 * mai un salvataggio parziale (business-rules.md § Blocchi, regola 4).
 */
export function assertValidContentTreeShape(value: unknown): asserts value is ContentTree {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidTree('', 'deve essere un oggetto con "version" e "blocks"');
  }
  const tree = value as Record<string, unknown>;

  if (typeof tree.version !== 'number') {
    throw invalidTree('version', 'deve essere numerico');
  }
  if (!Array.isArray(tree.blocks)) {
    throw invalidTree('blocks', 'deve essere un array');
  }

  tree.blocks.forEach((node, index) => assertValidBlockNode(node, `blocks[${index}]`));
}

function assertValidBlockNode(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidTree(path, 'deve essere un oggetto blocco');
  }
  const node = value as Record<string, unknown>;

  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw invalidTree(`${path}.id`, 'deve essere una stringa non vuota');
  }
  if (typeof node.type !== 'string' || node.type.length === 0) {
    throw invalidTree(`${path}.type`, 'deve essere una stringa non vuota');
  }
  if (node.props === null || typeof node.props !== 'object' || Array.isArray(node.props)) {
    throw invalidTree(`${path}.props`, 'deve essere un oggetto');
  }
  if (!Array.isArray(node.children)) {
    throw invalidTree(`${path}.children`, 'deve essere un array');
  }

  node.children.forEach((child, index) =>
    assertValidBlockNode(child, `${path}.children[${index}]`),
  );
}

function invalidTree(path: string, reason: string): BadRequestException {
  return new BadRequestException({
    message: path
      ? `Albero blocchi non valido in "${path}": ${reason}.`
      : `Albero blocchi non valido: ${reason}.`,
    code: 'CONTENT_TREE_INVALID',
    ...(path ? { details: { path } } : {}),
  });
}

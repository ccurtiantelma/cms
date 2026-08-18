import { BadRequestException } from '@nestjs/common';

/**
 * Numero massimo di nodi per albero, radice inclusa, a ogni profondità
 * (SPEC-F02-blocchi.md § 1.1). Derivato senza margine da NFR § Volumi di
 * riferimento («limite 500»): alzarlo non è un tuning, è una revisione
 * dell'NFR.
 */
export const MAX_NODES = 500;

/**
 * Profondità massima dell'albero, radice a profondità 1 (SPEC-F02-blocchi.md
 * § 1.2). **Arbitrario e dichiarato tale**: margine per due generazioni
 * future di contenitori, non derivato dal registro (gira prima che il
 * registro sia consultato).
 */
export const MAX_DEPTH = 5;

/**
 * Dimensione massima, in byte UTF-8, della serializzazione JSON
 * dell'envelope `{ version, blocks }` (SPEC-F02-blocchi.md § 1.3): 512 KiB,
 * derivato da 500 nodi × ~1 KiB medio.
 */
export const MAX_PAYLOAD_BYTES = 524_288;

/**
 * Nodo dell'albero di blocchi (business-rules.md § Blocchi e albero di
 * contenuto, regola 2). `v` è la versione dello schema del tipo (ADR-21 § 1):
 * assente sui nodi già persistiti da F01, obbligatoria in scrittura (vedi
 * {@link assertValidContentTreeShape}).
 */
export interface BlockNode {
  id: string;
  type: string;
  v?: number;
  props: Record<string, unknown>;
  children: BlockNode[];
}

/** Forma esterna del contenuto di una Pagina/Revisione (SPEC-F01 § Forma del contenuto). */
export interface ContentTree {
  version: number;
  blocks: BlockNode[];
}

/** Opzioni di {@link assertValidContentTreeShape}. */
export interface AssertContentTreeShapeOptions {
  /**
   * Se `true` (default), ogni nodo deve portare `v` — coerente con ADR-21
   * § 1 («in scrittura `v` è obbligatorio»). Questa funzione di forma è
   * invocata **solo** sui payload client in ingresso (`create`/`update`):
   * la lettura di contenuto già persistito non la richiama affatto, quindi
   * non esiste un caso legittimo per passare `false` oggi — il parametro
   * resta esplicito per non nascondere l'assunzione nel codice.
   */
  requireVersion?: boolean;
}

/**
 * Valida la **forma esterna** dell'albero blocchi: `version` numerico,
 * `blocks` array, ogni nodo con `id`/`type` stringa non vuota, `props`
 * oggetto, `children` array (ricorsivo a qualunque profondità), `v` numerico
 * se presente (obbligatorio per default, ADR-21 § 1). Verifica anche, nello
 * stesso gradino e **prima** che il registro dei tipi sia consultato
 * (SPEC-F02-blocchi.md § 1): il numero massimo di nodi, la profondità
 * massima e la dimensione del payload **in ingresso**. Non interpreta
 * `props` né valida `type`/annidamento per dominio: quello è lo stadio
 * successivo della pipeline (`BlockTreeValidatorService`, T2).
 *
 * Un albero non conforme è respinto **integralmente** con `400` e il path
 * del primo nodo colpevole — mai un salvataggio parziale (business-rules.md
 * § Blocchi, regola 4).
 */
export function assertValidContentTreeShape(
  value: unknown,
  options: AssertContentTreeShapeOptions = {},
): asserts value is ContentTree {
  const requireVersion = options.requireVersion ?? true;

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

  const counter = { count: 0 };
  tree.blocks.forEach((node, index) =>
    assertValidBlockNode(node, `blocks[${index}]`, 1, requireVersion, counter),
  );

  assertPayloadWithinLimit({ version: tree.version, blocks: tree.blocks }, 'input');
}

function assertValidBlockNode(
  value: unknown,
  path: string,
  depth: number,
  requireVersion: boolean,
  counter: { count: number },
): void {
  if (depth > MAX_DEPTH) {
    throw tooDeep(path, depth);
  }

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
  if (node.v !== undefined && typeof node.v !== 'number') {
    throw invalidTree(`${path}.v`, 'deve essere numerico');
  }
  if (requireVersion && node.v === undefined) {
    throw blockVersionRequired(path, node.type);
  }

  counter.count += 1;
  if (counter.count > MAX_NODES) {
    throw tooManyNodes(counter.count);
  }

  node.children.forEach((child, index) =>
    assertValidBlockNode(child, `${path}.children[${index}]`, depth + 1, requireVersion, counter),
  );
}

/**
 * Verifica che la serializzazione JSON UTF-8 di `{ version, blocks }` non
 * superi {@link MAX_PAYLOAD_BYTES} (SPEC-F02-blocchi.md § 1.3). Riusabile
 * lungo la pipeline in due punti distinti — `stage: 'input'` sull'albero
 * appena ricevuto (dentro questo file), `stage: 'persist'` sull'albero dopo
 * la sanitizzazione (`pages.service.ts`, T5) — perché una migrazione può
 * comporre stringhe nuove e allungare ciò che verrà scritto.
 */
export function assertPayloadWithinLimit(
  envelope: { version: number; blocks: unknown },
  stage: 'input' | 'persist',
): void {
  const bytes = Buffer.byteLength(
    JSON.stringify({ version: envelope.version, blocks: envelope.blocks }),
    'utf8',
  );
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new BadRequestException({
      message: `Payload dell'albero blocchi troppo grande (${bytes} byte, massimo ${MAX_PAYLOAD_BYTES}).`,
      code: 'CONTENT_TREE_TOO_LARGE',
      details: { bytes, max: MAX_PAYLOAD_BYTES, stage },
    });
  }
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

/** `v` assente in scrittura (ADR-21 § 1, SPEC-F02-blocchi.md § 4). */
function blockVersionRequired(path: string, type: string): BadRequestException {
  return new BadRequestException({
    message: `Blocco "${path}" privo del campo "v", obbligatorio in scrittura.`,
    code: 'BLOCK_VERSION_REQUIRED',
    details: { path, type },
  });
}

/** § 1.1 superato: nessun path, il colpevole è l'albero intero. */
function tooManyNodes(count: number): BadRequestException {
  return new BadRequestException({
    message: `Albero blocchi con troppi nodi (${count}, massimo ${MAX_NODES}).`,
    code: 'CONTENT_TREE_TOO_MANY_NODES',
    details: { count, max: MAX_NODES },
  });
}

/** § 1.2 superato: path del primo nodo oltre il limite. */
function tooDeep(path: string, depth: number): BadRequestException {
  return new BadRequestException({
    message: `Albero blocchi troppo profondo in "${path}" (profondità ${depth}, massimo ${MAX_DEPTH}).`,
    code: 'CONTENT_TREE_TOO_DEEP',
    details: { path, depth, max: MAX_DEPTH },
  });
}

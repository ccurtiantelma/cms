/**
 * Unit test di `template-io.utils.ts` (ADR-56 § 2): `exportSubtreeToJson` produce un
 * download client-side reale (`Blob`/`URL.createObjectURL`/click su `<a>`), quindi qui si
 * mockano solo quei tre punti di contatto col browser per catturare il testo serializzato
 * — nessun refactor della funzione sotto test, coerente col confine di ruolo Test Engineer.
 *
 * `importJsonFile` è invece puro: i suoi test non toccano il DOM. Copertura richiesta da
 * ADR-56 § Conformità: round-trip export→import, rigetto di JSON malformato/forma non
 * conforme/tipo non registrato/profondità oltre `CONTENT_TREE_LIMITS.maxDepth`/nodi oltre
 * `CONTENT_TREE_LIMITS.maxNodes`, rigenerazione GUID (nessun id importato sopravvive, mai
 * stabile fra due chiamate), rigetto dell'intero albero anche quando l'unico nodo non
 * conforme è annidato in profondità.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportSubtreeToJson, importJsonFile } from './template-io.utils';
import { CONTENT_TREE_LIMITS } from '../../../../types/blocks.types';
import type { BlockNode } from '../block-tree.utils';

/** Stessa forma di `BlockNode` meno `id`: comoda per costruire alberi grezzi da serializzare a mano. */
interface RawTestNode {
  type: string;
  props: Record<string, unknown>;
  children: RawTestNode[];
}

/**
 * Legge il testo di un `Blob` come farebbe il browser reale — `Blob.prototype.text()` non è
 * implementato dallo shim di jsdom (solo `slice`/`size`/`type`), quindi si passa da
 * `FileReader.readAsText`, che jsdom supporta per intero.
 */
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Ogni id presente in un `BlockNode` (o sottoalbero), radice inclusa, a qualunque profondità. */
function collectIds(node: BlockNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

/** Stessa struttura di `node`, spogliata dell'`id` a ogni livello — per confronti che ignorano gli id rigenerati. */
function withoutIds(node: BlockNode): RawTestNode {
  return {
    type: node.type,
    props: node.props,
    children: node.children.map(withoutIds),
  };
}

/** Catena di `container` innestati (`childrenAllow: '*'`, ADR-39 § 4): profondità = `depth`, radice inclusa. */
function buildContainerChain(depth: number): RawTestNode {
  let node: RawTestNode = { type: 'container', props: {}, children: [] };
  for (let i = 1; i < depth; i += 1) {
    node = { type: 'container', props: {}, children: [node] };
  }
  return node;
}

/** Radice `container` con `childCount` figli diretti `container` (senza figli propri): `childCount + 1` nodi totali. */
function buildWideTree(childCount: number): RawTestNode {
  const children: RawTestNode[] = [];
  for (let i = 0; i < childCount; i += 1) {
    children.push({ type: 'container', props: {}, children: [] });
  }
  return { type: 'container', props: {}, children };
}

describe('exportSubtreeToJson → importJsonFile — round-trip', () => {
  let capturedBlob: Blob | null;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    capturedBlob = null;
    createObjectURLSpy = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('un sottoalbero annidato esportato e poi reimportato produce lo stesso type/props/children, ignorando gli id', async () => {
    const original: BlockNode = {
      id: 'root-original-id',
      type: 'section',
      props: { columns: { default: '1' } },
      children: [
        {
          id: 'heading-original-id',
          type: 'heading',
          props: { level: 'h2', text: 'Benvenuto' },
          children: [],
        },
        {
          id: 'richtext-original-id',
          type: 'richText',
          props: { html: '<p>Contenuto</p>' },
          children: [],
        },
      ],
    };

    exportSubtreeToJson(original);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toBe('application/json');

    const serialized = await readBlobAsText(capturedBlob!);

    // Il file esportato non porta alcun id: `stripIds` (implementazione) spoglia radice e discendenti.
    expect(serialized).not.toContain('root-original-id');
    expect(serialized).not.toContain('heading-original-id');
    expect(serialized).not.toContain('richtext-original-id');

    const result = importJsonFile(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(withoutIds(result.subtree)).toEqual(withoutIds(original));
    // Il round-trip rigenera comunque id nuovi, mai quelli (assenti) del file esportato.
    expect(collectIds(result.subtree)).not.toContain('root-original-id');
    expect(collectIds(result.subtree)).not.toContain('heading-original-id');
    expect(collectIds(result.subtree)).not.toContain('richtext-original-id');
  });
});

describe('importJsonFile — JSON non parsabile', () => {
  it('rigetta una stringa che non è JSON valido, con un errore non vuoto', () => {
    const result = importJsonFile('non sono json {{{');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('importJsonFile — forma non conforme', () => {
  it('rigetta un nodo senza "type"', () => {
    const raw = JSON.stringify({ props: {}, children: [] });
    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
  });

  it('rigetta un nodo con "props" come array invece che oggetto', () => {
    const raw = JSON.stringify({ type: 'heading', props: [], children: [] });
    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
  });

  it('rigetta un nodo senza "children"', () => {
    const raw = JSON.stringify({ type: 'heading', props: {} });
    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
  });

  it('rigetta un nodo con "children" non-array', () => {
    const raw = JSON.stringify({ type: 'heading', props: {}, children: {} });
    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
  });
});

describe('importJsonFile — tipo non registrato', () => {
  it('rigetta un "type" assente da BLOCK_TYPES, nominandolo nel messaggio d\'errore', () => {
    const raw = JSON.stringify({ type: 'tipo-mai-esistito', props: {}, children: [] });
    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('tipo-mai-esistito');
  });
});

describe("importJsonFile — limiti dell'albero", () => {
  it(`rigetta un albero annidato oltre CONTENT_TREE_LIMITS.maxDepth (${CONTENT_TREE_LIMITS.maxDepth})`, () => {
    const tooDeep = buildContainerChain(CONTENT_TREE_LIMITS.maxDepth + 1);
    const result = importJsonFile(JSON.stringify(tooDeep));

    expect(result.ok).toBe(false);
  });

  it(`non rigetta per profondità un albero esattamente a CONTENT_TREE_LIMITS.maxDepth (${CONTENT_TREE_LIMITS.maxDepth})`, () => {
    const atLimit = buildContainerChain(CONTENT_TREE_LIMITS.maxDepth);
    const result = importJsonFile(JSON.stringify(atLimit));

    expect(result.ok).toBe(true);
  });

  it(`rigetta un albero con più nodi di CONTENT_TREE_LIMITS.maxNodes (${CONTENT_TREE_LIMITS.maxNodes})`, () => {
    // Radice + maxNodes figli = maxNodes + 1 nodi totali, un solo nodo oltre il limite.
    const tooWide = buildWideTree(CONTENT_TREE_LIMITS.maxNodes);
    const result = importJsonFile(JSON.stringify(tooWide));

    expect(result.ok).toBe(false);
  });
});

describe('importJsonFile — rigenerazione GUID', () => {
  it('nessun id presente nel file importato (anche annidato) sopravvive nel sottoalbero risultante', () => {
    const adversarial = {
      id: 'hacker-root-id',
      type: 'section',
      props: {},
      children: [
        {
          id: 'hacker-child-id',
          type: 'heading',
          props: { level: 'h2', text: 'Titolo' },
          children: [],
        },
      ],
    };
    const raw = JSON.stringify(adversarial);

    const result = importJsonFile(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = collectIds(result.subtree);
    expect(ids).not.toContain('hacker-root-id');
    expect(ids).not.toContain('hacker-child-id');
  });

  it('due importazioni dello stesso file producono id diversi ogni volta (nessun riuso memoizzato)', () => {
    const raw = JSON.stringify({
      type: 'section',
      props: {},
      children: [{ type: 'heading', props: { level: 'h2', text: 'Titolo' }, children: [] }],
    });

    const first = importJsonFile(raw);
    const second = importJsonFile(raw);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.subtree.id).not.toBe(second.subtree.id);
    expect(first.subtree.children[0].id).not.toBe(second.subtree.children[0].id);
  });
});

describe('importJsonFile — rigetto per intero, mai parziale', () => {
  it("un tipo sconosciuto annidato in profondità rigetta l'intero albero, non solo il ramo colpevole", () => {
    const raw = JSON.stringify({
      type: 'container',
      props: {},
      children: [
        {
          type: 'container',
          props: {},
          children: [
            {
              type: 'container',
              props: {},
              children: [{ type: 'tipo-non-registrato-in-profondita', props: {}, children: [] }],
            },
          ],
        },
      ],
    });

    const result = importJsonFile(raw);

    expect(result.ok).toBe(false);
  });
});

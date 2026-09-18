import {
  assertValidContentTreeShape,
  MAX_DEPTH,
  MAX_NODES,
  type BlockNode,
} from '../../../src/pages/content-tree';

/** Costruisce un ramo lineare (un solo figlio per nodo) di `depth` livelli, radice inclusa. */
function buildLinearTree(depth: number): BlockNode[] {
  function leaf(): BlockNode {
    return {
      id: 'leaf',
      type: 'heading',
      v: 1,
      props: { level: 'h2', text: 'foglia' },
      children: [],
    };
  }
  function wrap(node: BlockNode, remaining: number): BlockNode {
    if (remaining === 0) return node;
    return wrap(
      { id: `n${remaining}`, type: 'container', v: 2, props: {}, children: [node] },
      remaining - 1,
    );
  }
  return [wrap(leaf(), depth - 1)];
}

function buildFlatTree(count: number): BlockNode[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `n${index}`,
    type: 'heading',
    v: 1,
    props: { level: 'h2', text: `Nodo ${index}` },
    children: [],
  }));
}

/**
 * Test unitario di {@link assertValidContentTreeShape} per i nuovi limiti
 * `MAX_DEPTH`/`MAX_NODES` innalzati da ADR-82 § "Decisione" punto 5 (Sub-Task
 * S1.4): un albero già valido alle soglie storiche (profondità 5, 500 nodi)
 * resta valido dopo l'innalzamento (nessuna regressione, "si allenta soltanto,
 * mai si stringe"); un albero oltre le nuove soglie (profondità 9, 1501 nodi)
 * è respinto con lo stesso `tooDeep`/`tooManyNodes` già in uso.
 */
describe('content-tree — limiti MAX_DEPTH/MAX_NODES (ADR-82 § "Decisione" punto 5)', () => {
  it('le costanti correnti sono 8/1500 (ADR-82)', () => {
    expect(MAX_DEPTH).toBe(8);
    expect(MAX_NODES).toBe(1500);
  });

  it("un albero già valido alla profondità storica (5) resta valido dopo l'innalzamento a 8", () => {
    const tree = { version: 1, blocks: buildLinearTree(5) };
    expect(() => assertValidContentTreeShape(tree)).not.toThrow();
  });

  it("un albero già valido al numero di nodi storico (500) resta valido dopo l'innalzamento a 1500", () => {
    const tree = { version: 1, blocks: buildFlatTree(500) };
    expect(() => assertValidContentTreeShape(tree)).not.toThrow();
  });

  it('un albero a profondità 8 (= MAX_DEPTH) resta valido', () => {
    const tree = { version: 1, blocks: buildLinearTree(8) };
    expect(() => assertValidContentTreeShape(tree)).not.toThrow();
  });

  it('un albero a profondità 9 (> MAX_DEPTH) è respinto con CONTENT_TREE_TOO_DEEP', () => {
    const tree = { version: 1, blocks: buildLinearTree(9) };
    try {
      assertValidContentTreeShape(tree);
      fail('atteso un errore CONTENT_TREE_TOO_DEEP');
    } catch (error) {
      const response = (error as { getResponse: () => Record<string, unknown> }).getResponse();
      expect(response.code).toBe('CONTENT_TREE_TOO_DEEP');
      expect(response.details).toMatchObject({ depth: 9, max: 8 });
    }
  });

  it('un albero a 1500 nodi (= MAX_NODES) resta valido', () => {
    const tree = { version: 1, blocks: buildFlatTree(1500) };
    expect(() => assertValidContentTreeShape(tree)).not.toThrow();
  });

  it('un albero a 1501 nodi (> MAX_NODES) è respinto con CONTENT_TREE_TOO_MANY_NODES', () => {
    const tree = { version: 1, blocks: buildFlatTree(1501) };
    try {
      assertValidContentTreeShape(tree);
      fail('atteso un errore CONTENT_TREE_TOO_MANY_NODES');
    } catch (error) {
      const response = (error as { getResponse: () => Record<string, unknown> }).getResponse();
      expect(response.code).toBe('CONTENT_TREE_TOO_MANY_NODES');
      expect(response.details).toMatchObject({ count: 1501, max: 1500 });
    }
  });

  it('asserzione soft di performance: la validazione di forma di un albero sintetico a MAX_DEPTH/MAX_NODES resta sotto una soglia ragionevole (non un CI gate)', () => {
    const tree = { version: 1, blocks: buildFlatTree(MAX_NODES) };
    const start = Date.now();
    assertValidContentTreeShape(tree);
    const elapsedMs = Date.now() - start;
    // Soglia larga e non vincolante (nessun benchmark Playwright/CI gate qui,
    // fuori scope di questo Sub-Task): solo una rete di sicurezza contro una
    // regressione grossolana di complessità algoritmica.
    expect(elapsedMs).toBeLessThan(500);
  });
});

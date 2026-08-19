/**
 * Unit test del motore dell'albero di blocchi (PLAN-F04-editor-visivo.md T1, coperto da T6).
 *
 * Il fulcro non è "la funzione fa la cosa giusta" ma **come** la fa: `block-tree.utils.ts`
 * dichiara due invarianti su cui poggiano lo store, i selettori granulari e il vincolo NFR
 * di non ri-renderizzare l'intero albero a ogni modifica.
 *
 * 1. **Purezza**: l'albero passato in ingresso non cambia mai. Verificata congelando
 *    l'input in profondità (`deepFreeze`): in un modulo ES — sempre in strict mode — una
 *    scrittura su un oggetto congelato lancia `TypeError` invece di passare inosservata.
 *    Un confronto sul solo valore finale non lo direbbe.
 * 2. **Structural sharing**: i sottoalberi non toccati conservano lo **stesso riferimento**
 *    d'oggetto. È la proprietà che rende corretti i selettori per id dello store, e si
 *    verifica solo con `toBe` (identità), mai con `toEqual`.
 *
 * Terzo invariante verificato qui: un'operazione senza effetto (bordo della lista, id
 * inesistente) restituisce **lo stesso** riferimento d'albero, mai una copia identica —
 * altrimenti ogni no-op propagherebbe un re-render a tutto il canvas.
 */
import { describe, it, expect } from 'vitest';
import {
  addBlock,
  cloneTree,
  findLocation,
  findNode,
  generateBlockId,
  moveBlock,
  removeBlock,
  updateBlockProps,
  type BlockNode,
} from './block-tree.utils';

/** Congela ricorsivamente un albero: qualunque mutazione in strict mode lancia `TypeError`. */
function deepFreeze(tree: readonly BlockNode[]): readonly BlockNode[] {
  for (const node of tree) {
    Object.freeze(node.props);
    deepFreeze(node.children);
    Object.freeze(node.children);
    Object.freeze(node);
  }
  return Object.freeze(tree);
}

/** Nodo di comodo: `children` sempre presente, come pretende `BlockNode`. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/**
 * Albero di prova con la forma reale del dominio (profondità 2: `section` con figli, più
 * fratelli di radice), congelato: ogni test che lo tocca dimostra la purezza per costruzione.
 */
function makeTree(): readonly BlockNode[] {
  return deepFreeze([
    node('sec-1', 'section', {}, [
      node('head-1', 'heading', { level: 'h2', text: 'Primo' }),
      node('rich-1', 'richText', { html: '<p>uno</p>' }),
      node('btn-1', 'button', { label: 'Vai', href: 'https://esempio.it' }),
    ]),
    node('head-root', 'heading', { level: 'h3', text: 'Radice' }),
    node('sec-2', 'section', {}, [node('img-1', 'image', { mediaRef: '', alt: 'foto' })]),
  ]);
}

/** Ordine degli id fra i figli di `parentId` (radice se `null`), per asserire i riordini. */
function childIds(tree: readonly BlockNode[], parentId: string | null): string[] {
  const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? []);
  return siblings.map((child) => child.id);
}

describe('block-tree.utils — purezza dell’input', () => {
  it('addBlock non muta l’albero passato', () => {
    const tree = makeTree();
    const snapshot = JSON.stringify(tree);

    const next = addBlock(tree, 'sec-1', 'heading', 1, { level: 'h2', text: '' });

    expect(JSON.stringify(tree)).toBe(snapshot);
    expect(next).not.toBe(tree);
  });

  it('moveBlock non muta l’albero passato', () => {
    const tree = makeTree();
    const snapshot = JSON.stringify(tree);

    moveBlock(tree, 'rich-1', 'up');

    expect(JSON.stringify(tree)).toBe(snapshot);
  });

  it('removeBlock non muta l’albero passato', () => {
    const tree = makeTree();
    const snapshot = JSON.stringify(tree);

    removeBlock(tree, 'sec-1');

    expect(JSON.stringify(tree)).toBe(snapshot);
  });

  it('updateBlockProps non muta né l’albero né l’oggetto props del nodo toccato', () => {
    const tree = makeTree();
    const snapshot = JSON.stringify(tree);
    const originalProps = findNode(tree, 'head-1')!.props;

    const next = updateBlockProps(tree, 'head-1', { text: 'Cambiato' });

    expect(JSON.stringify(tree)).toBe(snapshot);
    expect(originalProps).toEqual({ level: 'h2', text: 'Primo' });
    expect(findNode(next, 'head-1')!.props).not.toBe(originalProps);
    expect(findNode(next, 'head-1')!.props).toEqual({ level: 'h2', text: 'Cambiato' });
  });

  it('cloneTree produce nuovi riferimenti a ogni livello (nessuna condivisione con l’originale)', () => {
    const tree = makeTree();
    const clone = cloneTree(tree);

    expect(clone).toEqual(tree);
    expect(clone).not.toBe(tree);
    expect(clone[0]).not.toBe(tree[0]);
    expect(clone[0].children[0]).not.toBe(tree[0].children[0]);
    expect(clone[0].children[0].props).not.toBe(tree[0].children[0].props);
  });
});

describe('block-tree.utils — structural sharing', () => {
  it('updateBlockProps ricostruisce solo il percorso fino al nodo toccato', () => {
    const tree = makeTree();

    const next = updateBlockProps(tree, 'head-1', { text: 'Cambiato' });

    // Ricostruiti: radice, la sezione che contiene il nodo, il nodo.
    expect(next).not.toBe(tree);
    expect(next[0]).not.toBe(tree[0]);
    expect(next[0].children[0]).not.toBe(tree[0].children[0]);
    // Conservati per identità: fratelli del nodo, e ogni altro ramo della radice.
    expect(next[0].children[1]).toBe(tree[0].children[1]);
    expect(next[0].children[2]).toBe(tree[0].children[2]);
    expect(next[1]).toBe(tree[1]);
    expect(next[2]).toBe(tree[2]);
    expect(next[2].children[0]).toBe(tree[2].children[0]);
  });

  it('addBlock dentro una section lascia intatti per identità gli altri rami', () => {
    const tree = makeTree();

    const next = addBlock(tree, 'sec-1', 'heading', 0, { level: 'h2', text: '' });

    expect(next[0]).not.toBe(tree[0]);
    expect(next[1]).toBe(tree[1]);
    expect(next[2]).toBe(tree[2]);
    // I figli preesistenti sono gli stessi oggetti, solo traslati di una posizione.
    expect(next[0].children[1]).toBe(tree[0].children[0]);
    expect(next[0].children[2]).toBe(tree[0].children[1]);
  });

  it('moveBlock fra fratelli non tocca gli altri rami né i nodi spostati', () => {
    const tree = makeTree();

    const next = moveBlock(tree, 'rich-1', 'up');

    expect(next[0]).not.toBe(tree[0]);
    expect(next[1]).toBe(tree[1]);
    expect(next[2]).toBe(tree[2]);
    // Riordino, non ricostruzione: i due nodi scambiati sono gli stessi oggetti.
    expect(next[0].children[0]).toBe(tree[0].children[1]);
    expect(next[0].children[1]).toBe(tree[0].children[0]);
  });

  it('removeBlock conserva per identità i rami non toccati', () => {
    const tree = makeTree();

    const next = removeBlock(tree, 'rich-1');

    expect(next[0]).not.toBe(tree[0]);
    expect(next[0].children[0]).toBe(tree[0].children[0]);
    expect(next[0].children[1]).toBe(tree[0].children[2]);
    expect(next[1]).toBe(tree[1]);
    expect(next[2]).toBe(tree[2]);
  });
});

describe('block-tree.utils — no-op: stesso riferimento, mai una copia', () => {
  it('moveBlock “up” sul primo fratello è un no-op', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'head-1', 'up')).toBe(tree);
  });

  it('moveBlock “down” sull’ultimo fratello è un no-op', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'btn-1', 'down')).toBe(tree);
  });

  it('moveBlock “up” sul primo nodo di radice è un no-op', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'sec-1', 'up')).toBe(tree);
  });

  it('moveBlock “down” sull’ultimo nodo di radice è un no-op', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'sec-2', 'down')).toBe(tree);
  });

  it('un solo figlio: né su né giù producono un nuovo albero', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'img-1', 'up')).toBe(tree);
    expect(moveBlock(tree, 'img-1', 'down')).toBe(tree);
  });

  it('id inesistente: move/remove/update sono no-op, mai eccezioni', () => {
    const tree = makeTree();
    expect(moveBlock(tree, 'non-esiste', 'up')).toBe(tree);
    expect(removeBlock(tree, 'non-esiste')).toBe(tree);
    expect(updateBlockProps(tree, 'non-esiste', { text: 'x' })).toBe(tree);
  });

  it('addBlock con un parentId inesistente non inserisce nulla e restituisce lo stesso albero', () => {
    const tree = makeTree();
    expect(addBlock(tree, 'non-esiste', 'heading', 0, {})).toBe(tree);
  });
});

describe('block-tree.utils — aggiunta', () => {
  it('inserisce alla radice all’indice richiesto', () => {
    const tree = makeTree();

    const next = addBlock(tree, null, 'heading', 1, { level: 'h2', text: '' });

    expect(next).toHaveLength(4);
    expect(next[1].type).toBe('heading');
    expect(childIds(next, null)[0]).toBe('sec-1');
    expect(childIds(next, null)[2]).toBe('head-root');
  });

  it('inserisce dentro una section come figlio diretto, non alla radice', () => {
    const tree = makeTree();

    const next = addBlock(tree, 'sec-1', 'button', 3, { label: '', href: '' });

    expect(next).toHaveLength(3);
    expect(childIds(next, 'sec-1')).toHaveLength(4);
    expect(findNode(next, 'sec-1')!.children[3].type).toBe('button');
    expect(findLocation(next, findNode(next, 'sec-1')!.children[3].id)!.parentId).toBe('sec-1');
  });

  it('restringe (clamp) un indice oltre la fine e uno negativo ai bordi validi', () => {
    const tree = makeTree();

    const inCoda = addBlock(tree, 'sec-1', 'heading', 99, {});
    const inTesta = addBlock(tree, 'sec-1', 'heading', -5, {});

    expect(findNode(inCoda, 'sec-1')!.children[3].type).toBe('heading');
    expect(findNode(inTesta, 'sec-1')!.children[0].type).toBe('heading');
  });

  it('copia le props di default invece di condividerne l’oggetto con il chiamante', () => {
    const tree = makeTree();
    const defaults = { level: 'h2', text: '' };

    const next = addBlock(tree, null, 'heading', 0, defaults);

    expect(next[0].props).toEqual(defaults);
    expect(next[0].props).not.toBe(defaults);
    expect(next[0].children).toEqual([]);
  });

  it('assegna a ogni nodo aggiunto un id distinto', () => {
    const tree = makeTree();

    const uno = addBlock(tree, null, 'heading', 0, {});
    const due = addBlock(uno, null, 'heading', 0, {});

    expect(due[0].id).not.toBe(due[1].id);
    expect(generateBlockId()).not.toBe(generateBlockId());
  });
});

describe('block-tree.utils — riordino fra fratelli', () => {
  it('scambia con il fratello precedente, mai attraversando il genitore', () => {
    const tree = makeTree();

    const next = moveBlock(tree, 'btn-1', 'up');

    expect(childIds(next, 'sec-1')).toEqual(['head-1', 'btn-1', 'rich-1']);
    expect(childIds(next, null)).toEqual(['sec-1', 'head-root', 'sec-2']);
    expect(findLocation(next, 'btn-1')!.parentId).toBe('sec-1');
  });

  it('riordina anche i nodi di radice', () => {
    const tree = makeTree();

    const next = moveBlock(tree, 'head-root', 'down');

    expect(childIds(next, null)).toEqual(['sec-1', 'sec-2', 'head-root']);
  });

  it('su e giù in sequenza riportano all’ordine di partenza', () => {
    const tree = makeTree();

    const next = moveBlock(moveBlock(tree, 'rich-1', 'up'), 'rich-1', 'down');

    expect(childIds(next, 'sec-1')).toEqual(childIds(tree, 'sec-1'));
  });
});

describe('block-tree.utils — eliminazione', () => {
  it('eliminare una section porta via tutti i suoi figli', () => {
    const tree = makeTree();

    const next = removeBlock(tree, 'sec-1');

    expect(childIds(next, null)).toEqual(['head-root', 'sec-2']);
    expect(findNode(next, 'sec-1')).toBeUndefined();
    for (const orfano of ['head-1', 'rich-1', 'btn-1']) {
      expect(findNode(next, orfano)).toBeUndefined();
      expect(findLocation(next, orfano)).toBeUndefined();
    }
  });

  it('eliminare un figlio non tocca il genitore né i fratelli', () => {
    const tree = makeTree();

    const next = removeBlock(tree, 'rich-1');

    expect(childIds(next, 'sec-1')).toEqual(['head-1', 'btn-1']);
    expect(findNode(next, 'sec-1')).toBeDefined();
    expect(findNode(next, 'rich-1')).toBeUndefined();
  });

  it('eliminare l’ultimo figlio lascia il contenitore vivo e vuoto', () => {
    const tree = makeTree();

    const next = removeBlock(tree, 'img-1');

    expect(findNode(next, 'sec-2')).toBeDefined();
    expect(findNode(next, 'sec-2')!.children).toEqual([]);
  });
});

describe('block-tree.utils — ricerca e localizzazione', () => {
  it('findNode trova a ogni profondità e restituisce undefined per un id assente', () => {
    const tree = makeTree();

    expect(findNode(tree, 'sec-1')!.type).toBe('section');
    expect(findNode(tree, 'btn-1')!.type).toBe('button');
    expect(findNode(tree, 'img-1')!.type).toBe('image');
    expect(findNode(tree, 'mai-esistito')).toBeUndefined();
  });

  it('findLocation distingue radice e figli, e conta i fratelli', () => {
    const tree = makeTree();

    expect(findLocation(tree, 'head-root')).toEqual({ parentId: null, index: 1, siblingsCount: 3 });
    expect(findLocation(tree, 'btn-1')).toEqual({ parentId: 'sec-1', index: 2, siblingsCount: 3 });
    expect(findLocation(tree, 'img-1')).toEqual({ parentId: 'sec-2', index: 0, siblingsCount: 1 });
    expect(findLocation(tree, 'mai-esistito')).toBeUndefined();
  });
});

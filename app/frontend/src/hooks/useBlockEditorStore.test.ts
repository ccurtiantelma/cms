/**
 * Unit test dello store della sessione di editing (PLAN-F04-editor-visivo.md T1, coperto
 * da T6), con il peso sulla history undo/redo.
 *
 * La history non conserva snapshot dell'albero: ogni azione registra un comando
 * invertibile (id, posizione, props precedenti). È una scelta che si paga in correttezza
 * — un `invert` sbagliato non produce un errore, produce un albero plausibile e diverso —
 * quindi i test qui confrontano l'albero **intero** dopo le sequenze di annullamento, non
 * solo il nodo toccato.
 *
 * Lo store è un singleton di modulo (come `useAuth`): ogni test riparte da `initTree`, che
 * per contratto azzera anche selezione e history.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useBlockEditorStore } from './useBlockEditorStore';
import type { BlockNode } from '../pages/pages/editor/block-tree.utils';

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/** Albero di partenza di ogni test: una `section` con due figli, più un fratello di radice. */
function initialTree(): BlockNode[] {
  return [
    node('sec-1', 'section', {}, [
      node('head-1', 'heading', { level: 'h2', text: 'Primo' }),
      node('rich-1', 'richText', { html: '<p>uno</p>' }),
    ]),
    node('head-root', 'heading', { level: 'h3', text: 'Radice' }),
  ];
}

/** Stato corrente dello store, per brevità nelle asserzioni. */
function state() {
  return useBlockEditorStore.getState();
}

/** L'albero corrente serializzato: confronto di valore indipendente dai riferimenti. */
function snapshot(): string {
  return JSON.stringify(state().tree);
}

describe('useBlockEditorStore — inizializzazione', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('clona l’albero in ingresso senza riordinare né perdere nodi', () => {
    const source = initialTree();
    state().initTree(source);

    expect(state().tree).toEqual(source);
    expect(state().tree).not.toBe(source);
    expect(state().tree[0].children.map((child) => child.id)).toEqual(['head-1', 'rich-1']);
  });

  it('azzera selezione e history, e incrementa la generazione', () => {
    const generationBefore = state().generation;
    state().selectNode('head-1');
    state().removeBlockAction('rich-1');

    state().initTree(initialTree());

    expect(state().selectedId).toBeNull();
    expect(state().undoStack).toHaveLength(0);
    expect(state().redoStack).toHaveLength(0);
    expect(state().generation).toBe(generationBefore + 1);
  });
});

describe('useBlockEditorStore — undo/redo: ritorno allo stato iniziale', () => {
  let iniziale: string;

  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
    iniziale = snapshot();
  });

  it('aggiunta → undo riporta esattamente all’albero iniziale', () => {
    state().addBlockAction('sec-1', 'button', 99, { label: '', href: '' });
    expect(snapshot()).not.toBe(iniziale);

    state().undo();

    expect(snapshot()).toBe(iniziale);
  });

  it('modifica di una prop → undo ripristina il valore precedente, non un valore vuoto', () => {
    state().updateBlockPropsAction('head-1', { text: 'Cambiato' });

    state().undo();

    expect(snapshot()).toBe(iniziale);
  });

  it('riordino → undo rimette il nodo nella posizione di partenza', () => {
    state().moveBlockAction('rich-1', 'up');

    state().undo();

    expect(snapshot()).toBe(iniziale);
  });

  it('eliminazione di una section → undo la reinserisce con i figli, alla stessa posizione', () => {
    state().removeBlockAction('sec-1');
    expect(state().tree.map((n) => n.id)).toEqual(['head-root']);

    state().undo();

    expect(snapshot()).toBe(iniziale);
    expect(state().tree[0].children.map((child) => child.id)).toEqual(['head-1', 'rich-1']);
  });

  it('sequenza mista di cinque azioni → cinque undo riportano all’albero iniziale', () => {
    state().addBlockAction(null, 'heading', 0, { level: 'h2', text: '' });
    state().updateBlockPropsAction('head-1', { text: 'Modificato' });
    state().moveBlockAction('rich-1', 'up');
    state().removeBlockAction('head-root');
    state().addBlockAction('sec-1', 'button', 0, { label: 'X', href: '' });

    expect(state().undoStack).toHaveLength(5);
    for (let i = 0; i < 5; i += 1) state().undo();

    expect(snapshot()).toBe(iniziale);
    expect(state().undoStack).toHaveLength(0);
    expect(state().redoStack).toHaveLength(5);
  });

  it('undo integrale seguito da redo integrale ritorna all’albero modificato', () => {
    state().addBlockAction(null, 'heading', 0, { level: 'h2', text: '' });
    state().updateBlockPropsAction('head-1', { text: 'Modificato' });
    state().moveBlockAction('rich-1', 'up');
    const modificato = snapshot();

    for (let i = 0; i < 3; i += 1) state().undo();
    expect(snapshot()).toBe(iniziale);
    for (let i = 0; i < 3; i += 1) state().redo();

    expect(snapshot()).toBe(modificato);
  });

  it('undo su history vuota non fa nulla (nessuna eccezione, albero invariato)', () => {
    const treeBefore = state().tree;

    state().undo();
    state().undo();

    expect(state().tree).toBe(treeBefore);
    expect(state().undoStack).toHaveLength(0);
  });

  it('redo senza un undo precedente non fa nulla', () => {
    state().addBlockAction(null, 'heading', 0, {});
    const treeBefore = state().tree;

    state().redo();

    expect(state().tree).toBe(treeBefore);
  });
});

describe('useBlockEditorStore — redo invalidato da una nuova modifica', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('una nuova azione dopo un undo svuota il redo stack', () => {
    state().updateBlockPropsAction('head-1', { text: 'Prima' });
    state().undo();
    expect(state().redoStack).toHaveLength(1);

    state().updateBlockPropsAction('head-1', { text: 'Seconda' });

    expect(state().redoStack).toHaveLength(0);
  });

  it('dopo l’invalidazione il redo non resuscita il ramo abbandonato', () => {
    state().updateBlockPropsAction('head-1', { text: 'Ramo abbandonato' });
    state().undo();
    state().updateBlockPropsAction('head-1', { text: 'Ramo nuovo' });

    state().redo();

    expect(state().tree[0].children[0].props.text).toBe('Ramo nuovo');
  });

  it('l’invalidazione vale per qualunque tipo di azione, non solo per la stessa prop', () => {
    state().addBlockAction(null, 'heading', 0, {});
    state().undo();
    expect(state().redoStack).toHaveLength(1);

    state().removeBlockAction('rich-1');

    expect(state().redoStack).toHaveLength(0);
    state().redo();
    expect(state().tree[0].children.map((child) => child.id)).toEqual(['head-1']);
  });
});

describe('useBlockEditorStore — azioni senza effetto e selezione', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('un riordino al bordo non entra nella history', () => {
    state().moveBlockAction('head-1', 'up');

    expect(state().undoStack).toHaveLength(0);
    expect(state().tree[0].children.map((child) => child.id)).toEqual(['head-1', 'rich-1']);
  });

  it('un’azione su un id inesistente non entra nella history', () => {
    state().removeBlockAction('mai-esistito');
    state().updateBlockPropsAction('mai-esistito', { text: 'x' });
    state().moveBlockAction('mai-esistito', 'down');

    expect(state().undoStack).toHaveLength(0);
  });

  it('eliminare il nodo selezionato lo deseleziona; eliminarne un altro lascia la selezione', () => {
    state().selectNode('rich-1');
    state().removeBlockAction('rich-1');
    expect(state().selectedId).toBeNull();

    state().selectNode('head-1');
    state().removeBlockAction('head-root');
    expect(state().selectedId).toBe('head-1');
  });

  it('eliminare la section selezionata la deseleziona anche se la selezione è sul contenitore', () => {
    state().selectNode('sec-1');

    state().removeBlockAction('sec-1');

    expect(state().selectedId).toBeNull();
  });

  it('updateBlockPropsAction fa merge, non sostituzione integrale delle props', () => {
    state().updateBlockPropsAction('head-1', { text: 'Solo il testo' });

    expect(state().tree[0].children[0].props).toEqual({ level: 'h2', text: 'Solo il testo' });
  });
});

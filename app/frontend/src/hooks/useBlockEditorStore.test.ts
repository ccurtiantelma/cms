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
 *
 * Round F04b (voce TODO 3.11): aggiunte qui le sezioni "savePoint/isDirty",
 * "useCanUndo/useCanRedo/useHasUnsavedChanges" e "moveNodeToAction" — la prima
 * implementazione arrivata senza alcun test. `moveNodeTo` come funzione pura (spostamento
 * strutturale, indipendente dal registro dei tipi) è coperta invece in
 * `block-tree.utils.test.ts`: qui si copre solo il punto in cui `moveNodeToAction`
 * interroga `canContainType` prima di invocarla, e l'undo/redo del comando risultante.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBlockEditorStore, useCanRedo, useCanUndo, useHasUnsavedChanges } from './useBlockEditorStore';
import { renderHook, act } from '@testing-library/react';
import type { BlockNode } from '../pages/pages/editor/block-tree.utils';

// `duplicateNodeAction` avvisa via `notifications.show` quando la duplicazione
// supererebbe `CONTENT_TREE_LIMITS.maxNodes` (PLAN-F04c-editor-maturo.md T7): mockato per
// non dipendere da un `<Notifications />` montato e per poter asserire sulla chiamata.
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
const { notifications } = await import('@mantine/notifications');

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

/** Ogni id presente nell'albero, radice inclusa, a qualunque profondità. */
function collectIds(nodes: readonly BlockNode[]): string[] {
  const ids: string[] = [];
  for (const n of nodes) {
    ids.push(n.id);
    ids.push(...collectIds(n.children));
  }
  return ids;
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

describe('useBlockEditorStore — savePoint e isDirty (useHasUnsavedChanges)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('appena inizializzato non è sporco', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());
    expect(result.current).toBe(false);
  });

  it('una modifica sporca lo stato', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => state().updateBlockPropsAction('head-1', { text: 'Cambiato' }));

    expect(result.current).toBe(true);
  });

  it('markSaved sul punto corrente riporta lo stato a pulito', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'Cambiato' });
      const point = state().currentSavePoint();
      state().markSaved(point);
    });

    expect(result.current).toBe(false);
  });

  it('una modifica successiva al salvataggio risporca lo stato', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'Prima' });
      state().markSaved(state().currentSavePoint());
      state().updateBlockPropsAction('head-1', { text: 'Seconda' });
    });

    expect(result.current).toBe(true);
  });

  it('un undo che riporta esattamente al savePoint torna pulito, anche senza passare dalla depth 0', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'Salvato' });
      state().markSaved(state().currentSavePoint());
      state().updateBlockPropsAction('head-1', { text: 'Non salvato' });
    });
    expect(result.current).toBe(true);

    act(() => state().undo());

    expect(result.current).toBe(false);
  });

  it('stessa profondità del savePoint ma ramo diverso (due undo oltre il savePoint, poi due azioni nuove): resta sporco', () => {
    // Guardia sul motivo per cui `isDirty` confronta l'identità del comando in cima, non
    // solo `undoStack.length`: si salva a profondità 2, si torna a 0 con due undo, e due
    // azioni nuove (diverse dalle originali) riportano la pila alla stessa profondità 2 —
    // ma il comando in cima non è quello salvato.
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'A' });
      state().updateBlockPropsAction('head-1', { text: 'B' });
      state().markSaved(state().currentSavePoint());
    });
    expect(state().savePoint.depth).toBe(2);
    expect(result.current).toBe(false);

    act(() => {
      state().undo();
      state().undo();
      state().updateBlockPropsAction('head-1', { text: "A'" });
      state().updateBlockPropsAction('head-1', { text: "B'" });
    });

    expect(state().undoStack).toHaveLength(state().savePoint.depth);
    expect(result.current).toBe(true);
  });

  it('redo che ripassa dal savePoint torna pulito, poi risporca oltre', () => {
    const { result } = renderHook(() => useHasUnsavedChanges());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'Salvato' });
      state().markSaved(state().currentSavePoint());
      state().updateBlockPropsAction('head-1', { text: 'Oltre' });
      state().undo();
      state().undo();
    });
    expect(result.current).toBe(true);

    act(() => state().redo());
    expect(result.current).toBe(false);

    act(() => state().redo());
    expect(result.current).toBe(true);
  });

  it('initTree azzera anche il savePoint (una nuova bozza caricata è per definizione pulita)', () => {
    state().updateBlockPropsAction('head-1', { text: 'x' });
    state().markSaved(state().currentSavePoint());

    state().initTree(initialTree());

    expect(state().savePoint).toEqual({ depth: 0, top: null });
    expect(useBlockEditorStore.getState().undoStack).toHaveLength(0);
  });
});

describe('useBlockEditorStore — useCanUndo/useCanRedo', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('storia vuota: né annullare né ripristinare', () => {
    const undoHook = renderHook(() => useCanUndo());
    const redoHook = renderHook(() => useCanRedo());

    expect(undoHook.result.current).toBe(false);
    expect(redoHook.result.current).toBe(false);
  });

  it('dopo un’azione: si può annullare, non ripristinare', () => {
    const undoHook = renderHook(() => useCanUndo());
    const redoHook = renderHook(() => useCanRedo());

    act(() => state().updateBlockPropsAction('head-1', { text: 'x' }));

    expect(undoHook.result.current).toBe(true);
    expect(redoHook.result.current).toBe(false);
  });

  it('dopo un annulla: si può ripristinare; se era l’unica azione, non si può più annullare', () => {
    const undoHook = renderHook(() => useCanUndo());
    const redoHook = renderHook(() => useCanRedo());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'x' });
      state().undo();
    });

    expect(undoHook.result.current).toBe(false);
    expect(redoHook.result.current).toBe(true);
  });

  it('redo esaurito (nessun altro comando disfatto): torna a non poter ripristinare', () => {
    const redoHook = renderHook(() => useCanRedo());

    act(() => {
      state().updateBlockPropsAction('head-1', { text: 'x' });
      state().undo();
      state().redo();
    });

    expect(redoHook.result.current).toBe(false);
  });
});

describe('useBlockEditorStore — moveNodeToAction: rispetta il registro (canContainType)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
  });

  it('sposta un nodo di radice dentro un contenitore che lo ammette, e l’undo lo riporta esattamente al suo posto', () => {
    // `head-root` (heading) alla radice → dentro `sec-1` (section, che ammette heading),
    // in testa ai suoi figli.
    state().moveNodeToAction('head-root', 'sec-1', 0);

    expect(state().tree.map((n) => n.id)).toEqual(['sec-1']);
    expect(state().tree[0].children.map((n) => n.id)).toEqual(['head-root', 'head-1', 'rich-1']);
    expect(state().undoStack).toHaveLength(1);

    state().undo();

    expect(state().tree.map((n) => n.id)).toEqual(['sec-1', 'head-root']);
    expect(state().tree[0].children.map((n) => n.id)).toEqual(['head-1', 'rich-1']);
    expect(state().undoStack).toHaveLength(0);
  });

  it('rifiuta lo spostamento quando il contenitore di destinazione non ammette quel tipo: no-op, nessuna voce in history', () => {
    // `head-1` è un heading; il registro dichiara `heading.childrenAllow: []` — non può
    // ospitare un altro heading. Bug applicativo nel registro NON è sotto test qui: si
    // verifica solo che `moveNodeToAction` rispetti il verdetto di `canContainType`.
    const treeBefore = state().tree;

    state().moveNodeToAction('head-root', 'head-1', 0);

    expect(state().tree).toBe(treeBefore);
    expect(state().undoStack).toHaveLength(0);
  });

  it('rifiuta lo spostamento verso un contenitore inesistente: no-op, nessuna eccezione', () => {
    const treeBefore = state().tree;

    state().moveNodeToAction('head-root', 'mai-esistito', 0);

    expect(state().tree).toBe(treeBefore);
    expect(state().undoStack).toHaveLength(0);
  });

  it('un movimento respinto non entra nel redo dopo un annullamento di un’altra azione', () => {
    // Copertura dell’interazione fra `pushCommand` e il rifiuto anticipato di
    // `moveNodeToAction`: un tentativo di spostamento respinto prima di costruire il
    // comando non deve mai apparire nella history, nemmeno indirettamente via redo.
    state().updateBlockPropsAction('head-1', { text: 'x' });
    state().moveNodeToAction('head-root', 'head-1', 0);

    expect(state().undoStack).toHaveLength(1);
    state().undo();
    expect(state().redoStack).toHaveLength(1);
  });
});

/**
 * `duplicateNodeAction` (PLAN-F04c-editor-maturo.md T7 § Parte 1). Il rischio dichiarato
 * (§ Falle evitate 4) è la rigenerazione dell'id limitata alla radice della copia:
 * `duplicateSubtree` è già coperta in isolamento da `block-tree.utils.test.ts`, qui si
 * verifica il comando invertibile che la usa — selezione del duplicato, storia undo/redo,
 * e il rifiuto quando la copia supererebbe `MAX_NODES` (500, `CONTENT_TREE_LIMITS`).
 */
describe('useBlockEditorStore — duplicateNodeAction', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree(initialTree());
    vi.mocked(notifications.show).mockClear();
  });

  it('duplica un sottoalbero a più livelli con id tutti nuovi, seleziona il duplicato, e l’undo lo rimuove per intero', () => {
    const deepTree: BlockNode[] = [
      node('root-x', 'section', {}, [
        node('mid-a', 'section', {}, [
          node('leaf-a1', 'heading', { level: 'h2', text: 'A1' }),
          node('leaf-a2', 'heading', { level: 'h2', text: 'A2' }),
        ]),
        node('mid-b', 'section', {}, [
          node('leaf-b1', 'heading', { level: 'h2', text: 'B1' }),
        ]),
      ]),
      node('head-root', 'heading', { level: 'h3', text: 'Radice' }),
    ];
    useBlockEditorStore.getState().initTree(deepTree);
    const originalIds = collectIds(state().tree);
    expect(originalIds).toHaveLength(7); // root-x, mid-a, leaf-a1, leaf-a2, mid-b, leaf-b1, head-root

    state().duplicateNodeAction('root-x');

    const idsAfter = collectIds(state().tree);
    const newIds = idsAfter.filter((id) => !originalIds.includes(id));
    // Sei nodi duplicati (root-x + i suoi cinque discendenti), tutti nuovi e distinti fra loro.
    expect(newIds).toHaveLength(6);
    expect(new Set(newIds).size).toBe(6);

    // Il duplicato è inserito subito dopo l'originale ed è il nodo selezionato.
    const duplicateRootId = state().tree[1].id;
    expect(duplicateRootId).not.toBe('root-x');
    expect(newIds).toContain(duplicateRootId);
    expect(state().selectedId).toBe(duplicateRootId);
    expect(state().tree.map((n) => n.id)).toEqual(['root-x', duplicateRootId, 'head-root']);

    // L'undo rimuove il duplicato per intero: l'albero torna bit-per-bit quello di partenza.
    state().undo();
    expect(collectIds(state().tree)).toEqual(originalIds);
    expect(JSON.stringify(state().tree)).toBe(JSON.stringify(deepTree));
  });

  it('id inesistente: no-op, nessuna eccezione, nessuna voce in history', () => {
    const treeBefore = state().tree;

    state().duplicateNodeAction('mai-esistito');

    expect(state().tree).toBe(treeBefore);
    expect(state().undoStack).toHaveLength(0);
  });

  it('rifiuta la duplicazione che supererebbe MAX_NODES: avviso, albero invariato, nessuna voce in history', () => {
    // 500 nodi di radice (= CONTENT_TREE_LIMITS.maxNodes): un duplicato in più li porterebbe a 501.
    const cinquecentoNodi = Array.from({ length: 499 }, (_, i) =>
      node(`n-${i}`, 'heading', { level: 'h2', text: 'x' }),
    );
    const daDuplicare = node('dup-me', 'heading', { level: 'h2', text: 'y' });
    useBlockEditorStore.getState().initTree([...cinquecentoNodi, daDuplicare]);
    const treeBefore = state().tree;
    expect(treeBefore).toHaveLength(500);

    state().duplicateNodeAction('dup-me');

    expect(state().tree).toBe(treeBefore);
    expect(state().undoStack).toHaveLength(0);
    expect(state().selectedId).toBeNull();
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', title: 'Duplicazione non eseguita' }),
    );
  });
});

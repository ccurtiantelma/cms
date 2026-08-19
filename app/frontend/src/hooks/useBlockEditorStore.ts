/**
 * Store Zustand della sessione di editing dell'albero di blocchi (PLAN-F04-editor-visivo.md
 * T1). Pattern ricalcato su `useAuth.ts`: ogni consumer seleziona solo la fetta di stato
 * che gli serve — un cambio di props su un nodo non deve ri-renderizzare componenti che
 * leggono un altro nodo (NFR § Performance — editor, CLAUDE.md § Frontend Developer).
 *
 * Stabilità dei riferimenti: `block-tree.utils.ts` ricostruisce solo il percorso
 * dell'albero effettivamente modificato (structural sharing) — i nodi non toccati da
 * una mutazione conservano lo stesso riferimento d'oggetto anche dopo che `tree` è stato
 * sostituito. È la ragione per cui `useNodeById`/`useSelectedNode` possono usare
 * l'uguaglianza di riferimento di default di Zustand ed evitare re-render spuri, senza
 * bisogno di un comparatore custom su ogni nodo.
 *
 * Undo/redo per patch: la history non duplica l'intero albero ad ogni azione. Ogni
 * comando invertibile porta con sé solo i dati minimi per rifare/disfare l'operazione
 * (id, indice, props precedenti, ecc.) — mai uno snapshot completo di `tree`.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  addBlock,
  cloneTree,
  findLocation,
  findNode,
  moveBlock,
  removeBlock,
  updateBlockProps,
  type BlockNode,
} from '../pages/pages/editor/block-tree.utils';

/** Direzione opposta, usata per costruire l'inverso di un comando `move`. */
function oppositeDirection(direction: 'up' | 'down'): 'up' | 'down' {
  return direction === 'up' ? 'down' : 'up';
}

/**
 * Un comando invertibile della history undo/redo. `apply` produce il nuovo albero dato
 * quello corrente; `invert` produce l'albero che precede l'applicazione di `apply`.
 * Nessuno dei due porta uno snapshot: sono funzioni pure chiuse sui soli parametri
 * necessari all'operazione (patch), non sull'albero intero.
 */
interface EditorCommand {
  apply: (tree: BlockNode[]) => BlockNode[];
  invert: (tree: BlockNode[]) => BlockNode[];
}

interface BlockEditorState {
  tree: BlockNode[];
  selectedId: string | null;
  /** Pila dei comandi applicati, disponibili per `undo()`. */
  undoStack: EditorCommand[];
  /** Pila dei comandi disfatti, disponibili per `redo()`. */
  redoStack: EditorCommand[];

  /** Inizializza l'albero da `draftContent.blocks` esistente (nessun riordino spurio: ordine e struttura conservati com'è). Azzera history e selezione. */
  initTree: (blocks: BlockNode[]) => void;
  /** Seleziona un nodo per id, o deseleziona con `null`. */
  selectNode: (id: string | null) => void;
  /** Aggiunge un blocco `type` a `index` fra i figli di `parentId` (radice se `null`). */
  addBlockAction: (
    parentId: string | null,
    type: string,
    index: number,
    defaultProps: Record<string, unknown>,
  ) => void;
  /** Sposta il nodo `id` di una posizione fra i suoi fratelli diretti. No-op ai bordi. */
  moveBlockAction: (id: string, direction: 'up' | 'down') => void;
  /** Rimuove il nodo `id` e i suoi discendenti. Deseleziona se il nodo rimosso era selezionato. */
  removeBlockAction: (id: string) => void;
  /** Merge delle `props` fornite sul nodo `id`. */
  updateBlockPropsAction: (id: string, props: Record<string, unknown>) => void;
  /** Disfa l'ultimo comando applicato, se presente. */
  undo: () => void;
  /** Rifà l'ultimo comando disfatto, se presente. */
  redo: () => void;
}

/**
 * Esegue un comando sull'albero corrente, lo spinge sull'undo stack e svuota il redo
 * stack (una nuova azione dopo un undo invalida i redo pendenti — comportamento standard).
 */
function pushCommand(state: BlockEditorState, command: EditorCommand): Partial<BlockEditorState> {
  const nextTree = command.apply(state.tree);
  if (nextTree === state.tree) {
    // No-op (es. move ai bordi): nessuna mutazione, nessuna voce di history.
    return {};
  }
  return {
    tree: nextTree,
    undoStack: [...state.undoStack, command],
    redoStack: [],
  };
}

export const useBlockEditorStore = create<BlockEditorState>((set) => ({
  tree: [],
  selectedId: null,
  undoStack: [],
  redoStack: [],

  initTree: (blocks) => {
    set({
      tree: cloneTree(blocks),
      selectedId: null,
      undoStack: [],
      redoStack: [],
    });
  },

  selectNode: (id) => set({ selectedId: id }),

  addBlockAction: (parentId, type, index, defaultProps) => {
    set((state) => {
      const provisionalTree = addBlock(state.tree, parentId, type, index, defaultProps);
      if (provisionalTree === state.tree) return {};

      // Il nodo appena inserito si trova alla posizione clampata: lo si individua qui
      // (una sola volta) per costruire un comando invertibile senza portarsi dietro uno
      // snapshot dell'intero albero — solo id/posizione/contenuto del nodo aggiunto.
      const siblings =
        parentId === null ? provisionalTree : (findNode(provisionalTree, parentId)?.children ?? []);
      const clampedIndex = Math.max(0, Math.min(index, siblings.length - 1));
      const insertedNode = siblings[clampedIndex];
      if (!insertedNode) return {};

      const command: EditorCommand = {
        apply: (tree) => addBlockAtExact(tree, parentId, clampedIndex, insertedNode),
        invert: (tree) => removeBlock(tree, insertedNode.id),
      };

      return {
        tree: provisionalTree,
        undoStack: [...state.undoStack, command],
        redoStack: [],
      };
    });
  },

  moveBlockAction: (id, direction) => {
    const command: EditorCommand = {
      apply: (tree) => moveBlock(tree, id, direction),
      invert: (tree) => moveBlock(tree, id, oppositeDirection(direction)),
    };
    set((state) => pushCommand(state, command));
  },

  removeBlockAction: (id) => {
    set((state) => {
      const removedNode = findNode(state.tree, id);
      const location = findLocation(state.tree, id);
      if (!removedNode || !location) return {};
      const command: EditorCommand = {
        apply: (tree) => removeBlock(tree, id),
        invert: (tree) => addBlockAtExact(tree, location.parentId, location.index, removedNode),
      };
      const patch = pushCommand(state, command);
      if (!patch.tree) return patch;
      return {
        ...patch,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    });
  },

  updateBlockPropsAction: (id, props) => {
    set((state) => {
      const node = findNode(state.tree, id);
      if (!node) return {};
      const changedKeys = Object.keys(props);
      const previousProps: Record<string, unknown> = {};
      for (const key of changedKeys) {
        previousProps[key] = node.props[key];
      }
      const command: EditorCommand = {
        apply: (tree) => updateBlockProps(tree, id, props),
        invert: (tree) => updateBlockProps(tree, id, previousProps),
      };
      return pushCommand(state, command);
    });
  },

  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return {};
      const command = state.undoStack[state.undoStack.length - 1];
      const nextTree = command.invert(state.tree);
      return {
        tree: nextTree,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.redoStack.length === 0) return {};
      const command = state.redoStack[state.redoStack.length - 1];
      const nextTree = command.apply(state.tree);
      return {
        tree: nextTree,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command],
      };
    });
  },
}));

/**
 * Reinserisce un nodo completo (con id e children originali) a una posizione esatta —
 * usato solo dall'inverso di `removeBlockAction` (undo di una rimozione), dove servono
 * l'id e l'intero sottoalbero rimosso, non un nodo generato ex novo come farebbe `addBlock`.
 */
function addBlockAtExact(
  tree: readonly BlockNode[],
  parentId: string | null,
  index: number,
  node: BlockNode,
): BlockNode[] {
  if (parentId === null) {
    const next = tree.slice();
    next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
    return next;
  }
  return tree.map((current) => {
    if (current.id === parentId) {
      const next = current.children.slice();
      next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
      return { ...current, children: next };
    }
    if (current.children.length === 0) return current;
    const nextChildren = addBlockAtExact(current.children, parentId, index, node);
    return nextChildren === current.children ? current : { ...current, children: nextChildren };
  });
}

/** Selettore granulare: solo il nodo selezionato (o `undefined` se nessuna selezione). */
export function useSelectedNode(): BlockNode | undefined {
  return useBlockEditorStore(
    useShallow((state) => {
      if (!state.selectedId) return undefined;
      return findNode(state.tree, state.selectedId);
    }),
  );
}

/** Selettore granulare: un nodo specifico per id (o `undefined` se non esiste/non più nell'albero). */
export function useNodeById(id: string | null | undefined): BlockNode | undefined {
  return useBlockEditorStore((state) => (id ? findNode(state.tree, id) : undefined));
}

/** Selettore granulare: solo l'id selezionato, senza sottoscrivere l'intero nodo. */
export function useSelectedId(): string | null {
  return useBlockEditorStore((state) => state.selectedId);
}

/** Selettore granulare: solo la radice dell'albero (uso raro — canvas T4 la consuma per iterare i nodi di primo livello). */
export function useRootBlocks(): BlockNode[] {
  return useBlockEditorStore((state) => state.tree);
}

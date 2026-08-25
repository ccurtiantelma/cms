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
import { notifications } from '@mantine/notifications';
import {
  addBlock,
  cloneTree,
  countNodes,
  duplicateSubtree,
  findLocation,
  findNode,
  moveBlock,
  moveNodeTo,
  removeBlock,
  updateBlockProps,
  type BlockNode,
} from '../pages/pages/editor/block-tree.utils';
import { canContainType } from '../pages/pages/editor/block-registry.utils';
import { CONTENT_TREE_LIMITS } from '../types/blocks.types';

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
export interface EditorCommand {
  apply: (tree: BlockNode[]) => BlockNode[];
  invert: (tree: BlockNode[]) => BlockNode[];
}

/**
 * Il punto della history che corrisponde a ciò che il server ha davvero salvato.
 * Non è solo una profondità: dopo un undo seguito da una modifica nuova la pila torna alla
 * stessa lunghezza pur contenendo un ramo diverso, e la sola profondità direbbe "nessuna
 * modifica da salvare" su un albero che invece è cambiato. Il comando in cima al momento
 * del salvataggio identifica il ramo, e il confronto è per riferimento.
 */
export interface SavePoint {
  depth: number;
  top: EditorCommand | null;
}

/**
 * `true` se l'albero in editing diverge da ciò che è stato salvato per ultimo.
 * Costo O(1): nessun confronto dell'albero, solo lunghezza della pila e identità del
 * comando in cima.
 */
function isDirty(state: BlockEditorState): boolean {
  if (state.undoStack.length !== state.savePoint.depth) return true;
  if (state.savePoint.depth === 0) return false;
  return state.undoStack[state.savePoint.depth - 1] !== state.savePoint.top;
}

/** Viewport simulato dal Viewport Switcher dell'editor full-screen (`FullScreenEditorLayout`). */
export type EditorViewport = 'desktop' | 'tablet' | 'mobile';

/** Scheda attiva della sidebar sinistra dell'editor full-screen (`EditorSidebar`). */
export type EditorSidebarTab = 'widgets' | 'properties';

interface BlockEditorState {
  tree: BlockNode[];
  selectedId: string | null;
  /**
   * Viewport correntemente simulato nel canvas dell'editor full-screen — governa solo la
   * larghezza del contenitore di anteprima (`FullScreenEditorLayout`), non altera l'albero
   * né i breakpoint effettivi del rendering pubblico.
   */
  activeViewport: EditorViewport;
  /** Il pannello "Struttura/Navigator" dell'editor full-screen è aperto. */
  isStructurePanelOpen: boolean;
  /**
   * Scheda attiva della sidebar sinistra (`EditorSidebar`, stile Elementor). Vive qui e non
   * come stato locale del componente perché deve poter essere cambiata da fuori — quando si
   * seleziona un blocco nel canvas la sidebar deve saltare su "Proprietà" da sola (vedi
   * `selectNode`), cosa che uno `useState` interno alla sidebar non potrebbe fare.
   */
  activeSidebarTab: EditorSidebarTab;
  /**
   * Contatore delle inizializzazioni dell'albero. Serve a distinguere "stesso nodo, stesso
   * id" da "stesso nodo ricaricato dal server": gli id dei nodi sopravvivono a un
   * salvataggio, quindi da soli non dicono a un form di editing che il valore sotto di lui
   * è cambiato — ed è cambiato davvero, perché il server sanitizza il rich text prima di
   * persistere e restituisce il contenuto ripulito. Chi tiene una bozza locale di una prop
   * (`PropertyInspector`) la butta via quando questo valore cambia.
   */
  generation: number;
  /** Pila dei comandi applicati, disponibili per `undo()`. */
  undoStack: EditorCommand[];
  /** Pila dei comandi disfatti, disponibili per `redo()`. */
  redoStack: EditorCommand[];
  /** Punto della history corrispondente all'ultimo contenuto salvato (vedi {@link SavePoint}). */
  savePoint: SavePoint;

  /** Inizializza l'albero da `draftContent.blocks` esistente (nessun riordino spurio: ordine e struttura conservati com'è). Azzera history e selezione. */
  initTree: (blocks: BlockNode[]) => void;
  /** Seleziona un nodo per id, o deseleziona con `null`. */
  selectNode: (id: string | null) => void;
  /** Cambia il viewport simulato nel canvas dell'editor full-screen. */
  setActiveViewport: (viewport: EditorViewport) => void;
  /** Apre/chiude il pannello "Struttura/Navigator" dell'editor full-screen. */
  setStructurePanelOpen: (opened: boolean) => void;
  /** Alterna l'apertura del pannello "Struttura/Navigator". */
  toggleStructurePanel: () => void;
  /** Cambia la scheda attiva della sidebar sinistra ("Widgets"/"Proprietà"). */
  setActiveSidebarTab: (tab: EditorSidebarTab) => void;
  /** Aggiunge un blocco `type` a `index` fra i figli di `parentId` (radice se `null`). */
  addBlockAction: (
    parentId: string | null,
    type: string,
    index: number,
    defaultProps: Record<string, unknown>,
  ) => void;
  /**
   * Inserisce `subtree` — un sottoalbero esterno all'albero in editing, tipicamente un
   * preset della libreria (`TemplateLibraryModal`, ADR-34) — fra i figli di `parentId`
   * (radice se `null`) all'indice `index`. Rigenera l'id di radice e di ogni discendente
   * (mai un id duplicato con la fonte del preset, riusato più volte). No-op con avviso
   * (`notifications.show`, mai un salvataggio fallito con `400`) se il registro non ammette
   * `subtree.type` nel contenitore di destinazione, o se l'inserimento porterebbe l'albero
   * oltre `CONTENT_TREE_LIMITS.maxNodes`. Il sottoalbero inserito diventa il nodo selezionato.
   */
  insertSubtreeAction: (parentId: string | null, index: number, subtree: BlockNode) => void;
  /** Sposta il nodo `id` di una posizione fra i suoi fratelli diretti. No-op ai bordi. */
  moveBlockAction: (id: string, direction: 'up' | 'down') => void;
  /**
   * Sposta il nodo `id` dentro `targetParentId` (radice se `null`) alla posizione `index`.
   * No-op se il registro non ammette quel tipo in quel contenitore, o se lo spostamento è
   * strutturalmente impossibile (dentro sé stesso o un proprio discendente).
   */
  moveNodeToAction: (id: string, targetParentId: string | null, index: number) => void;
  /** Rimuove il nodo `id` e i suoi discendenti. Deseleziona se il nodo rimosso era selezionato. */
  removeBlockAction: (id: string) => void;
  /**
   * Duplica il sottoalbero del nodo `id`, inserendo la copia subito dopo l'originale fra
   * gli stessi fratelli, con id rigenerati a ogni profondità (mai solo in radice). No-op con
   * avviso (`notifications.show`, mai un salvataggio fallito con `400`) se la copia
   * porterebbe l'albero oltre `CONTENT_TREE_LIMITS.maxNodes`. Il duplicato diventa il nodo
   * selezionato.
   */
  duplicateNodeAction: (id: string) => void;
  /** Merge delle `props` fornite sul nodo `id`. */
  updateBlockPropsAction: (id: string, props: Record<string, unknown>) => void;
  /** Disfa l'ultimo comando applicato, se presente. */
  undo: () => void;
  /** Rifà l'ultimo comando disfatto, se presente. */
  redo: () => void;
  /** Fotografa il punto di history corrispondente all'albero che si sta per inviare al server. */
  currentSavePoint: () => SavePoint;
  /**
   * Dichiara salvato il punto fotografato **prima** della richiesta: le modifiche fatte
   * mentre il salvataggio era in volo restano segnalate come non salvate, che è l'unico
   * verso in cui vale la pena sbagliare.
   */
  markSaved: (point: SavePoint) => void;
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

const CLEAN_SAVE_POINT: SavePoint = { depth: 0, top: null };

export const useBlockEditorStore = create<BlockEditorState>((set, get) => ({
  tree: [],
  selectedId: null,
  activeViewport: 'desktop',
  isStructurePanelOpen: false,
  activeSidebarTab: 'widgets',
  generation: 0,
  undoStack: [],
  redoStack: [],
  savePoint: CLEAN_SAVE_POINT,

  initTree: (blocks) => {
    set((state) => ({
      tree: cloneTree(blocks),
      selectedId: null,
      generation: state.generation + 1,
      undoStack: [],
      redoStack: [],
      savePoint: CLEAN_SAVE_POINT,
    }));
  },

  selectNode: (id) =>
    set(id !== null ? { selectedId: id, activeSidebarTab: 'properties' } : { selectedId: id }),

  setActiveViewport: (viewport) => set({ activeViewport: viewport }),

  setStructurePanelOpen: (opened) => set({ isStructurePanelOpen: opened }),

  toggleStructurePanel: () =>
    set((state) => ({ isStructurePanelOpen: !state.isStructurePanelOpen })),

  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

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

  moveNodeToAction: (id, targetParentId, index) => {
    set((state) => {
      const node = findNode(state.tree, id);
      const origin = findLocation(state.tree, id);
      if (!node || !origin) return {};

      // Il tipo del contenitore di destinazione decide l'ammissibilità: `undefined` alla
      // radice, dove vale `ROOT_ALLOWED`. Un contenitore che non esiste più non è un errore
      // da segnalare, è un'azione senza bersaglio.
      const targetParent =
        targetParentId === null ? undefined : findNode(state.tree, targetParentId);
      if (targetParentId !== null && !targetParent) return {};
      if (!canContainType(targetParent?.type, node.type)) return {};

      const command: EditorCommand = {
        apply: (tree) => moveNodeTo(tree, id, targetParentId, index),
        invert: (tree) => moveNodeTo(tree, id, origin.parentId, origin.index),
      };
      return pushCommand(state, command);
    });
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

  duplicateNodeAction: (id) => {
    set((state) => {
      const node = findNode(state.tree, id);
      const location = findLocation(state.tree, id);
      if (!node || !location) return {};

      const copy = duplicateSubtree(node);
      // Verificato PRIMA di inserire: MAX_NODES è quello di
      // `app/backend/src/pages/content-tree.ts` (fonte di verità), riesposto qui via
      // `CONTENT_TREE_LIMITS` generato dal registro — nessuna copia manuale del numero.
      const projectedTotal = countNodes(state.tree) + countNodes([copy]);
      if (projectedTotal > CONTENT_TREE_LIMITS.maxNodes) {
        notifications.show({
          color: 'red',
          title: 'Duplicazione non eseguita',
          message: `Il blocco duplicato porterebbe la pagina a ${projectedTotal} blocchi, oltre il limite di ${CONTENT_TREE_LIMITS.maxNodes}.`,
        });
        return {};
      }

      const command: EditorCommand = {
        apply: (tree) => addBlockAtExact(tree, location.parentId, location.index + 1, copy),
        invert: (tree) => removeBlock(tree, copy.id),
      };
      const patch = pushCommand(state, command);
      if (!patch.tree) return patch;
      return { ...patch, selectedId: copy.id };
    });
  },

  insertSubtreeAction: (parentId, index, subtree) => {
    set((state) => {
      // Il tipo del contenitore di destinazione decide l'ammissibilità (stesso principio di
      // `moveNodeToAction`): `undefined` alla radice, dove vale `ROOT_ALLOWED`. Un `parentId`
      // che non esiste più non è un errore da segnalare, è un'azione senza bersaglio.
      const parentNode = parentId === null ? undefined : findNode(state.tree, parentId);
      if (parentId !== null && !parentNode) return {};
      if (!canContainType(parentNode?.type, subtree.type)) {
        notifications.show({
          color: 'red',
          title: 'Inserimento non eseguito',
          message: `Il blocco "${subtree.type}" non è ammesso in questo contenitore.`,
        });
        return {};
      }

      // Rigenerazione ricorsiva degli id: stessa funzione pura usata da
      // `duplicateNodeAction` per un nodo già nell'albero, qui applicata a un sottoalbero
      // esterno (ADR-34 § 2) — un solo punto di rigenerazione UUID nel codebase.
      const copy = duplicateSubtree(subtree);
      // Verificato PRIMA di inserire: MAX_NODES è quello di
      // `app/backend/src/pages/content-tree.ts` (fonte di verità), riesposto qui via
      // `CONTENT_TREE_LIMITS` generato dal registro — nessuna copia manuale del numero.
      const projectedTotal = countNodes(state.tree) + countNodes([copy]);
      if (projectedTotal > CONTENT_TREE_LIMITS.maxNodes) {
        notifications.show({
          color: 'red',
          title: 'Inserimento non eseguito',
          message: `La sezione inserita porterebbe la pagina a ${projectedTotal} blocchi, oltre il limite di ${CONTENT_TREE_LIMITS.maxNodes}.`,
        });
        return {};
      }

      const command: EditorCommand = {
        apply: (tree) => addBlockAtExact(tree, parentId, index, copy),
        invert: (tree) => removeBlock(tree, copy.id),
      };
      const patch = pushCommand(state, command);
      if (!patch.tree) return patch;
      return { ...patch, selectedId: copy.id };
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

  currentSavePoint: () => {
    const { undoStack } = get();
    return { depth: undoStack.length, top: undoStack[undoStack.length - 1] ?? null };
  },

  markSaved: (point) => set({ savePoint: point }),
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

/** Selettore granulare: solo il viewport simulato nel canvas full-screen. */
export function useActiveViewport(): EditorViewport {
  return useBlockEditorStore((state) => state.activeViewport);
}

/** Selettore granulare: solo lo stato di apertura del pannello "Struttura/Navigator". */
export function useIsStructurePanelOpen(): boolean {
  return useBlockEditorStore((state) => state.isStructurePanelOpen);
}

/** Selettore granulare: solo la scheda attiva della sidebar sinistra ("Widgets"/"Proprietà"). */
export function useActiveSidebarTab(): EditorSidebarTab {
  return useBlockEditorStore((state) => state.activeSidebarTab);
}

/** Selettore granulare: il contatore delle inizializzazioni dell'albero (vedi `generation`). */
export function useTreeGeneration(): number {
  return useBlockEditorStore((state) => state.generation);
}

/** Selettore granulare: solo la radice dell'albero (uso raro — canvas T4 la consuma per iterare i nodi di primo livello). */
export function useRootBlocks(): BlockNode[] {
  return useBlockEditorStore((state) => state.tree);
}

/** Selettore granulare: c'è almeno un comando da annullare. */
export function useCanUndo(): boolean {
  return useBlockEditorStore((state) => state.undoStack.length > 0);
}

/** Selettore granulare: c'è almeno un comando da ripristinare. */
export function useCanRedo(): boolean {
  return useBlockEditorStore((state) => state.redoStack.length > 0);
}

/**
 * Selettore granulare: l'albero in editing diverge da ciò che è stato salvato per ultimo.
 * È il segnale che l'editor non aveva — finora l'unico modo di sapere se una modifica era
 * al sicuro era ricordarselo.
 */
export function useHasUnsavedChanges(): boolean {
  return useBlockEditorStore(isDirty);
}

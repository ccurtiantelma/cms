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
import { canContainType, nestingRejectionMessage } from '../pages/pages/editor/block-registry.utils';
import {
  CONTAINER_WIDTH_PROP,
  toContainerWidthValue,
} from '../pages/pages/editor/container-resize.utils';
import { BLOCK_TYPES, CONTENT_TREE_LIMITS } from '../types/blocks.types';
import {
  compileTokensToCss,
  GLOBAL_TOKENS_CANVAS_SCOPE_CLASS,
  GLOBAL_TOKENS_STYLE_TAG_ID,
  type GlobalTokens,
} from '../libs/globalTokensCompiler';

/** Selettore CSS su cui i Global Design Tokens vengono scopati — mai `:root` (vedi {@link GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}). */
const GLOBAL_TOKENS_SCOPE_SELECTOR = `.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}`;

/** Direzione opposta, usata per costruire l'inverso di un comando `move`. */
function oppositeDirection(direction: 'up' | 'down'): 'up' | 'down' {
  return direction === 'up' ? 'down' : 'up';
}

/**
 * Un comando invertibile che opera sull'albero di blocchi. `apply` produce il nuovo
 * albero dato quello corrente; `invert` produce l'albero che precede l'applicazione di
 * `apply`. Nessuno dei due porta uno snapshot: sono funzioni pure chiuse sui soli
 * parametri necessari all'operazione (patch), non sull'albero intero.
 */
interface TreeCommand {
  kind: 'tree';
  apply: (tree: BlockNode[]) => BlockNode[];
  invert: (tree: BlockNode[]) => BlockNode[];
}

/**
 * Un comando invertibile che opera sui Global Design Tokens (F04 step 1, libs/
 * globalTokensCompiler.ts) — stesso principio dei comandi sull'albero: `apply`/`invert`
 * sono chiusure sul valore precedente/nuovo, mai uno snapshot dell'intero stato dello
 * store. Vive sulla stessa history di `TreeCommand` (stessa pila undo/redo) perché i
 * Global Tokens sono un'altra proprietà modificabile della sessione di editing, non un
 * meccanismo di annullamento a sé stante.
 */
interface GlobalTokensCommand {
  kind: 'globalTokens';
  apply: (tokens: GlobalTokens | null) => GlobalTokens | null;
  invert: (tokens: GlobalTokens | null) => GlobalTokens | null;
}

/**
 * Un comando invertibile della history undo/redo. Union discriminata da `kind`: la
 * stessa pila (`undoStack`/`redoStack`) accoglie sia patch sull'albero di blocchi sia
 * patch sui Global Design Tokens, applicate ciascuna alla propria fetta di stato — un
 * unico timeline di Ctrl+Z per l'intera sessione di editing, non due meccanismi
 * paralleli.
 */
export type EditorCommand = TreeCommand | GlobalTokensCommand;

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

/** Stato dell'albero dopo un'azione, mostrato dalla cronologia visuale dell'editor. */
export interface HistoryEntry {
  label: string;
  tree: BlockNode[];
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

/**
 * Ampiezza che un nodo `container` sta assumendo **mentre** il puntatore trascina la sua
 * maniglia di ridimensionamento (E03, `ContainerResizeHandle.tsx`). Un solo nodo per volta:
 * il gesto è esclusivo per costruzione (`setPointerCapture`), quindi un solo slot invece di
 * una mappa per id.
 */
export interface ContainerResizeState {
  id: string;
  /** Percentuale della larghezza del contenitore padre, gia clampata nell'intervallo del registro. */
  percent: number;
}

/** Prop di stile copiate temporaneamente durante la sessione dell'editor. */
export type StyleClipboard = Record<string, unknown>;

function extractStyleProps(props: Record<string, unknown>): StyleClipboard {
  return Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('style')));
}

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
   * La sidebar sinistra ("Widgets"/"Proprietà", `EditorSidebar`) è montata e visibile.
   * Default `true` (comportamento storico, sidebar sempre presente): il collasso è
   * un'aggiunta pensata per liberare spazio canvas su schermi stretti o durante un editing
   * fine dei blocchi, non un cambio del comportamento atteso di apertura.
   */
  isSidebarOpen: boolean;
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
  /** Cronologia visuale degli stati del tree, parallela alla history dei comandi. */
  history: HistoryEntry[];
  /** Indice dello stato corrente nella cronologia, `-1` per l'albero iniziale. */
  historyIndex: number;
  /** Punto della history corrispondente all'ultimo contenuto salvato (vedi {@link SavePoint}). */
  savePoint: SavePoint;
  /**
   * Nodi nascosti nel canvas dell'editor full-screen ("occhio" del pannello
   * Struttura/Navigator, `EditorStructureNavigator.tsx`): stato UI puramente effimero,
   * mai persistito su `draftContent.blocks` e distinto dalla visibilità per-viewport
   * (`styleHideDesktop`/`styleHideTablet`/`styleHideMobile`, ADR-37 § 3), che è una prop di
   * stile del blocco e sopravvive al salvataggio. Un nodo qui dentro sparisce dal
   * rendering del canvas (`display: none`) ma resta nell'albero e nella riga del
   * navigator, sempre riselezionabile/ri-mostrabile.
   */
  hiddenInCanvasIds: ReadonlySet<string>;
  /**
   * Global Design Tokens correnti (F04 step 1, `libs/globalTokensCompiler.ts`) — palette
   * di brand, font di base, unità di spaziatura, esposti come variabili CSS al canvas.
   * `null` finché nessuno li ha impostati in questa sessione: né persistenza né UI di
   * gestione esistono ancora (fuori scope di questo step), quindi non c'è un default
   * "di fabbrica" da precaricare — solo `setGlobalTokens` lo popola.
   */
  globalTokens: GlobalTokens | null;
  /**
   * Ridimensionamento di un `container` in corso (E03), oppure `null` a riposo. Stato
   * **visivo ed effimero**: nessun comando sulla history mentre il puntatore si muove —
   * un'unica voce di undo/redo viene registrata al rilascio, da
   * {@link commitContainerWidthAction}. Vive nello store e non in uno stato locale del
   * wrapper perche il valore in corso deve poter essere letto da un componente diverso da
   * quello che lo produce (badge, ispettore), cosa che uno `useState` interno non
   * permetterebbe; il selettore {@link useContainerResizePercent} lo sottoscrive per id, cosi
   * il trascinamento di un container non ri-renderizza i wrapper degli altri.
   */
  containerResize: ContainerResizeState | null;
  styleClipboard: StyleClipboard | null;

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
  /** Apre/chiude (monta/smonta) la sidebar sinistra "Widgets"/"Proprietà". */
  setSidebarOpen: (opened: boolean) => void;
  /** Alterna l'apertura della sidebar sinistra "Widgets"/"Proprietà". */
  toggleSidebar: () => void;
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
  copyStyleAction: (id: string) => void;
  pasteStyleAction: (id: string) => void;
  /** Merge delle `props` fornite sul nodo `id`. */
  updateBlockPropsAction: (id: string, props: Record<string, unknown>) => void;
  /**
   * Alterna la visibilità del nodo `id` nel canvas dell'editor (vedi {@link
   * hiddenInCanvasIds}: mai persistito, mai una prop del blocco). Non passa da
   * `pushCommand`/l'undo stack: è uno stato dell'interfaccia, non una modifica di
   * contenuto — annullarla con "Ctrl+Z" sorprenderebbe più di quanto aiuterebbe.
   */
  toggleHiddenInCanvas: (id: string) => void;
  /** Disfa l'ultimo comando applicato, se presente. */
  undo: () => void;
  /** Rifà l'ultimo comando disfatto, se presente. */
  redo: () => void;
  /** Ripristina uno stato della cronologia visuale e conserva il ramo successivo come redo. */
  restoreHistory: (index: number) => void;
  /** Fotografa il punto di history corrispondente all'albero che si sta per inviare al server. */
  currentSavePoint: () => SavePoint;
  /**
   * Dichiara salvato il punto fotografato **prima** della richiesta: le modifiche fatte
   * mentre il salvataggio era in volo restano segnalate come non salvate, che è l'unico
   * verso in cui vale la pena sbagliare.
   */
  markSaved: (point: SavePoint) => void;
  /**
   * Sostituisce i Global Design Tokens correnti, registra un comando invertibile sulla
   * stessa history undo/redo dell'albero (vedi {@link GlobalTokensCommand}) e aggiorna
   * subito il tag `<style id="eaidos-global-tokens">` del `document` principale
   * (`applyGlobalTokensToDocument`), scopato su `.eaidos-canvas-theme-scope`
   * (`GLOBAL_TOKENS_CANVAS_SCOPE_CLASS`) — la classe stabile della radice di
   * `EditorCanvas.tsx` — mai su `:root`: il tag vive nello `head` del documento
   * principale (non c'è un `contentDocument` di un canvas in iframe, oggi inesistente),
   * ma lo scope del selettore impedisce che le variabili raggiungano la chrome
   * amministrativa attorno al canvas. Nessuna persistenza verso il server: quel
   * passaggio resta fuori da questo step.
   */
  setGlobalTokens: (tokens: GlobalTokens) => void;
  /**
   * Idrata i Global Design Tokens da una fonte non annullabile (F07 step 2: la lettura
   * iniziale di `GET app/settings/global-tokens` all'apertura dell'editor,
   * `FullScreenEditorLayout.tsx`) e applica subito il CSS, scopato allo stesso modo di
   * `setGlobalTokens` — **senza** spingere un `GlobalTokensCommand` sulla history
   * undo/redo: è un caricamento di stato dal server, non un'azione dell'utente da poter
   * annullare con Ctrl+Z (stesso principio di `initTree` rispetto ad `addBlockAction`).
   */
  hydrateGlobalTokens: (tokens: GlobalTokens) => void;
  /**
   * Aggiorna l'ampiezza visiva del `container` `id` durante il trascinamento della maniglia.
   * Non tocca l'albero e non tocca la history: e' un'anteprima, e una voce di undo per pixel
   * mosso renderebbe Ctrl+Z inutilizzabile.
   */
  setContainerResizePreview: (id: string, percent: number) => void;
  /** Abbandona l'anteprima senza scrivere nulla (`pointercancel`, gesto interrotto). */
  clearContainerResizePreview: () => void;
  /**
   * Chiude il gesto: scrive la percentuale finale sulla prop di larghezza del nodo `id` e
   * registra **un solo** punto nella history di undo/redo per l'intero trascinamento.
   * Azzera sempre l'anteprima, anche quando non c'e' nulla da scrivere (valore invariato,
   * nodo sparito): il gesto e' finito comunque.
   */
  commitContainerWidthAction: (id: string, percent: number) => void;
}

/**
 * Esegue un comando `tree` sull'albero corrente, lo spinge sull'undo stack e svuota il
 * redo stack (una nuova azione dopo un undo invalida i redo pendenti — comportamento
 * standard). Solo per comandi `kind: 'tree'`: `setGlobalTokens` spinge il proprio
 * comando `kind: 'globalTokens'` direttamente, perché non c'è un albero da confrontare
 * per rilevare un no-op.
 */
function pushCommand(
  state: BlockEditorState,
  command: TreeCommand,
  label: string,
): Partial<BlockEditorState> {
  const nextTree = command.apply(state.tree);
  if (nextTree === state.tree) {
    // No-op (es. move ai bordi): nessuna mutazione, nessuna voce di history.
    return {};
  }
  return {
    tree: nextTree,
    undoStack: [...state.undoStack, command],
    redoStack: [],
    history: [
      ...state.history.slice(0, state.historyIndex + 1),
      { label, tree: cloneTree(nextTree) },
    ],
    historyIndex: state.historyIndex + 1,
  };
}

/**
 * Aggiorna (creandolo se assente) il tag `<style id="eaidos-global-tokens">` di `doc`
 * col CSS compilato dei Global Design Tokens. Funzione standalone ed esportata — non
 * solo uso interno allo store — perché lo stesso CSS va applicato sia al `document`
 * principale (chiamato qui sotto) sia, quando esisterà un componente canvas in
 * `<iframe>`, al `contentDocument` di quell'iframe: al momento nessun componente del
 * codebase renderizza il canvas in un iframe (`EditorCanvas.tsx` monta i blocchi
 * direttamente nel DOM della pagina host), quindi non c'è un riferimento del genere da
 * riusare qui — questo helper resta minimale e indipendente in attesa che un futuro
 * componente canvas lo richiami con il proprio `contentDocument`.
 * @param css Blocco CSS già compilato (`compileTokensToCss`).
 * @param doc Documento su cui applicare/aggiornare il tag `<style>`.
 */
export function applyGlobalTokensToDocument(css: string, doc: Document): void {
  let styleTag = doc.getElementById(GLOBAL_TOKENS_STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = doc.createElement('style');
    styleTag.id = GLOBAL_TOKENS_STYLE_TAG_ID;
    doc.head.appendChild(styleTag);
  }
  styleTag.textContent = css;
}

/**
 * Compila i token per il tag `<style>`, oppure svuota il CSS se `tokens` è `null` — caso
 * dello stato iniziale o di un undo che torna indietro fino a "nessun token impostato in
 * questa sessione" (nessun default di fabbrica reintrodotto di nascosto: se l'utente
 * annulla fino a lì, il canvas torna esattamente come prima di ogni impostazione).
 */
function compileOrEmpty(tokens: GlobalTokens | null): string {
  return tokens ? compileTokensToCss(tokens, GLOBAL_TOKENS_SCOPE_SELECTOR) : '';
}

const CLEAN_SAVE_POINT: SavePoint = { depth: 0, top: null };

export const useBlockEditorStore = create<BlockEditorState>((set, get) => ({
  tree: [],
  selectedId: null,
  activeViewport: 'desktop',
  isStructurePanelOpen: false,
  isSidebarOpen: true,
  activeSidebarTab: 'widgets',
  generation: 0,
  undoStack: [],
  redoStack: [],
  history: [],
  historyIndex: -1,
  savePoint: CLEAN_SAVE_POINT,
  hiddenInCanvasIds: new Set(),
  globalTokens: null,
  containerResize: null,
  styleClipboard: null,

  initTree: (blocks) => {
    set((state) => ({
      tree: cloneTree(blocks),
      selectedId: null,
      generation: state.generation + 1,
      undoStack: [],
      redoStack: [],
      history: [],
      historyIndex: -1,
      savePoint: CLEAN_SAVE_POINT,
      // Stato UI del canvas legato alla sessione di editing precedente: un nodo
      // "nascosto" nella bozza appena sostituita non ha più motivo di restarlo qui.
      hiddenInCanvasIds: new Set(),
      // Stesso principio per un ridimensionamento eventualmente rimasto aperto: l'albero
      // sotto di lui non esiste più.
      containerResize: null,
      styleClipboard: null,
    }));
  },

  selectNode: (id) =>
    set(id !== null ? { selectedId: id, activeSidebarTab: 'properties' } : { selectedId: id }),

  setActiveViewport: (viewport) => set({ activeViewport: viewport }),

  setStructurePanelOpen: (opened) => set({ isStructurePanelOpen: opened }),

  toggleStructurePanel: () =>
    set((state) => ({ isStructurePanelOpen: !state.isStructurePanelOpen })),

  setSidebarOpen: (opened) => set({ isSidebarOpen: opened }),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  addBlockAction: (parentId, type, index, defaultProps) => {
    set((state) => {
      // Il tipo del contenitore di destinazione decide l'ammissibilità (stesso principio di
      // `insertSubtreeAction`/`moveNodeToAction`): `undefined` alla radice, dove vale
      // `ROOT_ALLOWED`. Un `parentId` che non esiste più non è un errore da segnalare, è
      // un'azione senza bersaglio.
      const parentNode = parentId === null ? undefined : findNode(state.tree, parentId);
      if (parentId !== null && !parentNode) return {};
      if (!canContainType(parentNode?.type, type)) {
        notifications.show({
          color: 'red',
          title: 'Inserimento non eseguito',
          message: nestingRejectionMessage(parentNode?.type, type),
        });
        return {};
      }

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

      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => addBlockAtExact(tree, parentId, clampedIndex, insertedNode),
        invert: (tree) => removeBlock(tree, insertedNode.id),
      };

      return {
        tree: provisionalTree,
        undoStack: [...state.undoStack, command],
        redoStack: [],
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { label: `Aggiunto blocco ${type}`, tree: cloneTree(provisionalTree) },
        ],
        historyIndex: state.historyIndex + 1,
        selectedId: insertedNode.id,
      };
    });
  },

  moveBlockAction: (id, direction) => {
    const command: TreeCommand = {
      kind: 'tree',
      apply: (tree) => moveBlock(tree, id, direction),
      invert: (tree) => moveBlock(tree, id, oppositeDirection(direction)),
    };
    set((state) => pushCommand(state, command, `Spostato nodo ${id}`));
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
      if (!canContainType(targetParent?.type, node.type)) {
        notifications.show({
          color: 'red',
          title: 'Spostamento non eseguito',
          message: nestingRejectionMessage(targetParent?.type, node.type),
        });
        return {};
      }

      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => moveNodeTo(tree, id, targetParentId, index),
        invert: (tree) => moveNodeTo(tree, id, origin.parentId, origin.index),
      };
      return pushCommand(state, command, `Spostato nodo ${id}`);
    });
  },

  removeBlockAction: (id) => {
    set((state) => {
      const removedNode = findNode(state.tree, id);
      const location = findLocation(state.tree, id);
      if (!removedNode || !location) return {};
      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => removeBlock(tree, id),
        invert: (tree) => addBlockAtExact(tree, location.parentId, location.index, removedNode),
      };
      const patch = pushCommand(state, command, `Eliminato blocco ${id}`);
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

      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => addBlockAtExact(tree, location.parentId, location.index + 1, copy),
        invert: (tree) => removeBlock(tree, copy.id),
      };
      const patch = pushCommand(state, command, `Duplicato blocco ${id}`);
      if (!patch.tree) return patch;
      return { ...patch, selectedId: copy.id };
    });
  },

  copyStyleAction: (id) => {
    set((state) => {
      const node = findNode(state.tree, id);
      return node ? { styleClipboard: extractStyleProps(node.props) } : {};
    });
  },

  pasteStyleAction: (id) => {
    set((state) => {
      const node = findNode(state.tree, id);
      if (!node || !state.styleClipboard) return {};
      const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
      const declaredNames = new Set((descriptor?.props ?? []).map((prop) => prop.name));
      const applicable = Object.fromEntries(
        Object.entries(state.styleClipboard).filter(([key]) => declaredNames.has(key)),
      );
      if (Object.keys(applicable).length === 0) return {};
      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => updateBlockProps(tree, id, applicable),
        invert: (tree) => updateBlockProps(tree, id, Object.fromEntries(
          Object.keys(applicable).map((key) => [key, node.props[key]]),
        )),
      };
      return pushCommand(state, command, `Modificato stile ${id}`);
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

      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => addBlockAtExact(tree, parentId, index, copy),
        invert: (tree) => removeBlock(tree, copy.id),
      };
      const patch = pushCommand(state, command, `Aggiunto blocco ${subtree.type}`);
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
      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => updateBlockProps(tree, id, props),
        invert: (tree) => updateBlockProps(tree, id, previousProps),
      };
      return pushCommand(state, command, `Modificate proprietà ${id}`);
    });
  },

  toggleHiddenInCanvas: (id) =>
    set((state) => {
      const next = new Set(state.hiddenInCanvasIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { hiddenInCanvasIds: next };
    }),

  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return {};
      const command = state.undoStack[state.undoStack.length - 1];
      if (command.kind === 'tree') {
        return {
          tree: command.invert(state.tree),
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, command],
          historyIndex: state.historyIndex - 1,
        };
      }
      // `kind === 'globalTokens'`: il tag <style> del documento principale va
      // riallineato subito, esattamente come fa `setGlobalTokens` — l'undo non è un
      // altro meccanismo, è lo stesso comando eseguito all'indietro.
      const nextTokens = command.invert(state.globalTokens);
      applyGlobalTokensToDocument(compileOrEmpty(nextTokens), document);
      return {
        globalTokens: nextTokens,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        historyIndex: state.historyIndex - 1,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.redoStack.length === 0) return {};
      const command = state.redoStack[state.redoStack.length - 1];
      if (command.kind === 'tree') {
        return {
          tree: command.apply(state.tree),
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, command],
          historyIndex: state.historyIndex + 1,
        };
      }
      const nextTokens = command.apply(state.globalTokens);
      applyGlobalTokensToDocument(compileOrEmpty(nextTokens), document);
      return {
        globalTokens: nextTokens,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command],
        historyIndex: state.historyIndex + 1,
      };
    });
  },

  currentSavePoint: () => {
    const { undoStack } = get();
    return { depth: undoStack.length, top: undoStack[undoStack.length - 1] ?? null };
  },

  markSaved: (point) => set({ savePoint: point }),

  restoreHistory: (index) => {
    set((state) => {
      const entry = state.history[index];
      if (!entry) return {};
      return {
        tree: cloneTree(entry.tree),
        undoStack: state.undoStack.slice(0, index + 1),
        redoStack: state.undoStack.slice(index + 1).reverse(),
        historyIndex: index,
      };
    });
  },

  setGlobalTokens: (tokens) => {
    set((state) => {
      const previous = state.globalTokens;
      const command: GlobalTokensCommand = {
        kind: 'globalTokens',
        apply: () => tokens,
        invert: () => previous,
      };
      // Applicazione immediata al `document` principale: il canvas dell'editor non vive
      // oggi in un iframe (nessun `contentDocument` da aggiornare in parallelo — vedi il
      // commento di `applyGlobalTokensToDocument`), quindi questo è l'unico documento da
      // sincronizzare finché non esisterà un componente canvas con un riferimento proprio.
      applyGlobalTokensToDocument(compileTokensToCss(tokens, GLOBAL_TOKENS_SCOPE_SELECTOR), document);
      return {
        globalTokens: tokens,
        undoStack: [...state.undoStack, command],
        redoStack: [],
      };
    });
  },

  hydrateGlobalTokens: (tokens) => {
    applyGlobalTokensToDocument(compileTokensToCss(tokens, GLOBAL_TOKENS_SCOPE_SELECTOR), document);
    set({ globalTokens: tokens });
  },

  setContainerResizePreview: (id, percent) =>
    set((state) => {
      // Nessun `set` a valore identico: un `pointermove` che non sposta abbastanza da
      // cambiare il decimo di punto percentuale non deve ri-renderizzare nulla.
      const current = state.containerResize;
      if (current && current.id === id && current.percent === percent) return {};
      return { containerResize: { id, percent } };
    }),

  clearContainerResizePreview: () => set({ containerResize: null }),

  commitContainerWidthAction: (id, percent) => {
    set((state) => {
      const node = findNode(state.tree, id);
      if (!node) return { containerResize: null };

      const previousValue = node.props[CONTAINER_WIDTH_PROP];
      const nextValue = toContainerWidthValue(percent);
      // Un trascinamento che torna esattamente da dove è partito non è una modifica:
      // nessuna voce di history, nessun contenuto marcato come non salvato.
      if (readCommittedPercent(previousValue) === percent) return { containerResize: null };

      // Stesso comando invertibile di `updateBlockPropsAction` — una sola prop, il valore
      // precedente catturato per chiusura, mai uno snapshot dell'albero. È qui che l'intero
      // trascinamento diventa **un** punto di undo/redo.
      const command: TreeCommand = {
        kind: 'tree',
        apply: (tree) => updateBlockProps(tree, id, { [CONTAINER_WIDTH_PROP]: nextValue }),
        invert: (tree) => updateBlockProps(tree, id, { [CONTAINER_WIDTH_PROP]: previousValue }),
      };
      return {
        ...pushCommand(state, command, `Modificata larghezza ${id}`),
        containerResize: null,
      };
    });
  },
}));

/**
 * Percentuale già persistita sulla prop, o `null` se assente/di altra forma. Duplica di
 * proposito la lettura di `readContainerWidthPercent` invece di importarla: quel modulo
 * legge il registro dei blocchi, e lo store non ha motivo di dipenderne per un confronto
 * di uguaglianza fra due numeri.
 */
function readCommittedPercent(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { value?: unknown; unit?: unknown };
  if (candidate.unit !== '%' || typeof candidate.value !== 'number') return null;
  return candidate.value;
}

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

/** Selettore granulare: solo lo stato di apertura della sidebar sinistra "Widgets"/"Proprietà". */
export function useIsSidebarOpen(): boolean {
  return useBlockEditorStore((state) => state.isSidebarOpen);
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

/**
 * Selettore granulare: il nodo `id` è nascosto nel canvas (stato UI effimero, mai
 * persistito — vedi {@link hiddenInCanvasIds}). Sottoscrive solo
 * l'appartenenza di questo id all'insieme, non l'insieme intero: un toggle su un altro
 * nodo non ri-renderizza questo consumer.
 */
export function useIsHiddenInCanvas(id: string): boolean {
  return useBlockEditorStore((state) => state.hiddenInCanvasIds.has(id));
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

/** Selettore granulare: solo i Global Design Tokens correnti (`null` se non ancora impostati in questa sessione). */
export function useGlobalTokens(): GlobalTokens | null {
  return useBlockEditorStore((state) => state.globalTokens);
}

/**
 * Selettore granulare: l'ampiezza in corso di trascinamento **per questo nodo**, o `null`
 * se il gesto riguarda un altro container (o nessuno). Sottoscrive solo il proprio id: il
 * ridimensionamento di un container non ri-renderizza i wrapper dei fratelli.
 */
export function useContainerResizePercent(id: string): number | null {
  return useBlockEditorStore((state) =>
    state.containerResize && state.containerResize.id === id ? state.containerResize.percent : null,
  );
}

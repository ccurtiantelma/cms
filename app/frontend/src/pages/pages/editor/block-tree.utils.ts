/**
 * Funzioni pure per manipolare l'albero di blocchi in editing (PLAN-F04-editor-visivo.md
 * T1). Nessuna dipendenza da React: consumate solo da `useBlockEditorStore.ts`.
 *
 * Vincolo non negoziabile: nessuna funzione qui muta il proprio input. L'albero passato
 * è lo stesso oggetto che finisce su `draftContent.blocks` (jsonb persistito) — una
 * mutazione accidentale sarebbe contenuto corrotto silenziosamente condiviso con lo
 * stato precedente nello store/undo history.
 *
 * La forma di `BlockNode` è ricalcata su `RenderableBlockNode` di
 * `components/blocks/types.ts`, ma dichiarata localmente: quel tipo è vincolato
 * all'isolamento di `components/blocks/` (PLAN-F02-blocchi.md T8) e non va importato
 * qui. Stessa forma, scopi diversi (editing vs rendering sola lettura).
 */

/** Un nodo dell'albero di blocchi in editing. `children` sempre presente (anche vuoto). */
export interface BlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BlockNode[];
}

/** Dove si trova un nodo nell'albero: genitore (`null` = radice) e indice fra i fratelli. */
export interface BlockLocation {
  parentId: string | null;
  index: number;
  siblingsCount: number;
}

/**
 * Genera un id univoco per un nuovo nodo. Usa `crypto.randomUUID()` quando disponibile
 * (browser moderni su contesto sicuro); fallback a una stringa pseudo-casuale altrimenti,
 * sufficiente per un id locale alla sessione di editing (il server non richiede un formato
 * particolare per gli id dei nodi, solo unicità nell'albero).
 */
export function generateBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Clona un nodo in profondità (nuovo oggetto/array a ogni livello), mai lo stesso riferimento. */
function cloneNode(node: BlockNode): BlockNode {
  return {
    id: node.id,
    type: node.type,
    props: { ...node.props },
    children: node.children.map(cloneNode),
  };
}

/**
 * Cerca ricorsivamente un nodo per id nell'albero (o in una lista di fratelli).
 * Ritorna il nodo trovato (riferimento nell'albero passato, non una copia) o `undefined`.
 */
export function findNode(tree: readonly BlockNode[], id: string): BlockNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Localizza un nodo nell'albero: genitore (`null` se è un nodo di radice), il suo indice
 * fra i fratelli diretti e il numero totale di fratelli. Ritorna `undefined` se l'id non
 * esiste nell'albero.
 */
export function findLocation(tree: readonly BlockNode[], id: string): BlockLocation | undefined {
  const rootIndex = tree.findIndex((node) => node.id === id);
  if (rootIndex !== -1) {
    return { parentId: null, index: rootIndex, siblingsCount: tree.length };
  }
  for (const node of tree) {
    const childIndex = node.children.findIndex((child) => child.id === id);
    if (childIndex !== -1) {
      return { parentId: node.id, index: childIndex, siblingsCount: node.children.length };
    }
    const nested = findLocation(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Applica `updater` alla lista di figli del nodo con id `parentId` (o alla radice
 * dell'albero se `parentId` è `null`), ricostruendo solo il percorso interessato.
 * Ritorna l'albero originale (stesso riferimento) se `parentId` non è stato trovato.
 */
function updateChildrenList(
  tree: readonly BlockNode[],
  parentId: string | null,
  updater: (children: readonly BlockNode[]) => BlockNode[],
): BlockNode[] {
  if (parentId === null) {
    return updater(tree);
  }
  let changed = false;
  const nextTree = tree.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return { ...node, children: updater(node.children) };
    }
    const nextChildren = updateChildrenList(node.children, parentId, updater);
    if (nextChildren !== node.children) {
      changed = true;
      return { ...node, children: nextChildren };
    }
    return node;
  });
  return changed ? nextTree : (tree as BlockNode[]);
}

/**
 * Aggiunge un nuovo nodo di tipo `type` all'indice `index` fra i figli del nodo
 * `parentId` (radice dell'albero se `parentId === null`). L'indice viene sempre
 * ristretto (clamp) ai limiti validi della lista di destinazione. Ritorna un nuovo
 * albero; non muta `tree`.
 */
export function addBlock(
  tree: readonly BlockNode[],
  parentId: string | null,
  type: string,
  index: number,
  defaultProps: Record<string, unknown>,
): BlockNode[] {
  const newNode: BlockNode = {
    id: generateBlockId(),
    type,
    props: { ...defaultProps },
    children: [],
  };
  return updateChildrenList(tree, parentId, (children) => {
    const clamped = Math.max(0, Math.min(index, children.length));
    const next = children.slice();
    next.splice(clamped, 0, newNode);
    return next;
  });
}

/**
 * Sposta il nodo `id` di una posizione verso `direction` fra i suoi fratelli diretti
 * (mai fra genitori diversi). No-op (ritorna l'albero invariato, stesso riferimento) se
 * il nodo non esiste o è già al bordo (primo per `'up'`, ultimo per `'down'`) — mai
 * un'eccezione.
 */
export function moveBlock(
  tree: readonly BlockNode[],
  id: string,
  direction: 'up' | 'down',
): BlockNode[] {
  const location = findLocation(tree, id);
  if (!location) return tree as BlockNode[];

  const targetIndex = direction === 'up' ? location.index - 1 : location.index + 1;
  if (targetIndex < 0 || targetIndex >= location.siblingsCount) {
    return tree as BlockNode[];
  }

  return updateChildrenList(tree, location.parentId, (children) => {
    const next = children.slice();
    const [moved] = next.splice(location.index, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  });
}

/** `true` se `candidateId` è un discendente di `node` (a qualunque profondità). */
function isDescendantOf(node: BlockNode, candidateId: string): boolean {
  return findNode(node.children, candidateId) !== undefined;
}

/**
 * Sposta il nodo `id` fra i figli di `targetParentId` (radice dell'albero se `null`),
 * all'indice `index` — interpretato **sulla lista di destinazione dopo la rimozione** del
 * nodo, così un riordino nello stesso contenitore e uno spostamento fra contenitori diversi
 * hanno la stessa semantica e la stessa inversa (`(parentId, index)` di partenza).
 *
 * No-op (stesso riferimento, mai un'eccezione) se: il nodo non esiste, il contenitore di
 * destinazione non esiste, la destinazione è il nodo stesso o un suo discendente (staccherebbe
 * quel ramo dall'albero), o la posizione risultante coincide con quella di partenza.
 *
 * Questa funzione **non conosce il registro dei blocchi**: qui vivono le sole regole
 * strutturali dell'albero. Se il tipo del nodo sia ammesso dal contenitore di destinazione è
 * un fatto del registro, e si verifica in `moveNodeToAction` (`useBlockEditorStore.ts`) —
 * il file di utilità resta puro e senza dipendenze dal contratto generato.
 */
export function moveNodeTo(
  tree: readonly BlockNode[],
  id: string,
  targetParentId: string | null,
  index: number,
): BlockNode[] {
  const node = findNode(tree, id);
  const origin = findLocation(tree, id);
  if (!node || !origin) return tree as BlockNode[];
  if (targetParentId === id || (targetParentId !== null && isDescendantOf(node, targetParentId))) {
    return tree as BlockNode[];
  }
  if (targetParentId !== null && !findNode(tree, targetParentId)) return tree as BlockNode[];

  const without = removeBlock(tree, id);
  const targetChildren =
    targetParentId === null ? without : (findNode(without, targetParentId)?.children ?? []);
  const clamped = Math.max(0, Math.min(index, targetChildren.length));
  if (targetParentId === origin.parentId && clamped === origin.index) return tree as BlockNode[];

  return updateChildrenList(without, targetParentId, (children) => {
    const next = children.slice();
    next.splice(clamped, 0, node);
    return next;
  });
}

/**
 * Rimuove il nodo `id` e, ricorsivamente, tutti i suoi discendenti (la rimozione è
 * implicita: sono annidati nell'oggetto rimosso). No-op se l'id non esiste. Ritorna un
 * nuovo albero; non muta `tree`.
 */
export function removeBlock(tree: readonly BlockNode[], id: string): BlockNode[] {
  let changed = false;
  const next = tree.reduce<BlockNode[]>((acc, node) => {
    if (node.id === id) {
      changed = true;
      return acc;
    }
    const nextChildren = removeBlock(node.children, id);
    if (nextChildren !== node.children) {
      changed = true;
      acc.push({ ...node, children: nextChildren });
    } else {
      acc.push(node);
    }
    return acc;
  }, []);
  return changed ? next : (tree as BlockNode[]);
}

/**
 * Applica un merge (mai una sostituzione integrale) delle `props` fornite sul nodo `id`.
 * No-op (stesso riferimento) se l'id non esiste. Ritorna un nuovo albero; non muta `tree`.
 */
export function updateBlockProps(
  tree: readonly BlockNode[],
  id: string,
  props: Record<string, unknown>,
): BlockNode[] {
  let changed = false;
  const next = tree.map((node) => {
    if (node.id === id) {
      changed = true;
      return { ...node, props: { ...node.props, ...props } };
    }
    const nextChildren = updateBlockProps(node.children, id, props);
    if (nextChildren !== node.children) {
      changed = true;
      return { ...node, children: nextChildren };
    }
    return node;
  });
  return changed ? next : (tree as BlockNode[]);
}

/** Clona in profondità un intero albero (nuovi oggetti/array a ogni livello). */
export function cloneTree(tree: readonly BlockNode[]): BlockNode[] {
  return tree.map(cloneNode);
}

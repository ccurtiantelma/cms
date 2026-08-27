/**
 * Traduzione fra il contenuto persistito (`jsonb`, envelope ADR-21) e l'albero
 * dell'editor visivo, più la risoluzione dei path di errore restituiti dalla
 * validazione server-side.
 *
 * Estratto da `BlockEditorPanel.tsx` quando il Builder delle Sezioni Globali
 * (F06/ADR-40) è diventato il secondo consumatore della stessa pipeline: la
 * forma dell'albero e la ristampa di `v` dal registro sono logica di dominio
 * sui blocchi, e duplicarla per entità sarebbe il modo più rapido per farle
 * divergere. Nessun cambiamento di comportamento rispetto all'originale.
 */
import { BLOCK_TYPES } from '../../../types/blocks.types';
import type { BlockNode } from './block-tree.utils';

/** Etichetta leggibile di un tipo di blocco, presa dal registro (mai scritta a mano). */
export function blockLabel(type: string): string {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.label ?? type;
}

/**
 * Normalizza il contenuto persistito (`jsonb` non tipizzato) nella forma
 * dell'albero di editing. I nodi malformati vengono scartati invece di far
 * esplodere l'editor: l'entità resta apribile e il salvataggio successivo
 * riscrive la forma valida.
 *
 * `v` non entra nell'albero di editing: è ristampato dal registro al
 * salvataggio (vedi {@link toPersistableBlocks}).
 */
export function toEditorBlocks(raw: unknown): BlockNode[] {
  if (!raw || typeof raw !== 'object') return [];
  const blocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const node = entry as Record<string, unknown>;
    if (typeof node.id !== 'string' || typeof node.type !== 'string') return [];
    const rawProps =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? (node.props as Record<string, unknown>)
        : {};
    const descriptor = BLOCK_TYPES.find((candidate) => candidate.type === node.type);
    const props = Object.fromEntries(
      Object.entries(rawProps).map(([name, value]) => {
        const prop = descriptor?.props.find((candidate) => candidate.name === name);
        return [
          name,
          prop?.responsive && (typeof value !== 'object' || value === null || Array.isArray(value))
            ? { default: value }
            : value,
        ];
      }),
    );
    return [
      {
        id: node.id,
        type: node.type,
        props,
        children: toEditorBlocks({ blocks: node.children }),
      },
    ];
  });
}

/**
 * Rimuove dalle `props` di un nodo le chiavi il cui valore è `''` (stringa vuota)
 * o `null`: valori fantasma delle prop opzionali di stile/testo che l'editor può
 * ancora avere in memoria (campo svuotato dall'utente, nodo caricato da uno stato
 * precedente a questa pulizia) e che il validatore server respinge con
 * `BLOCK_PROP_INVALID` se inviati. Non tocca `0`, `false` o stringhe non vuote:
 * sono valori legittimi, non assenza di valore.
 */
function stripEmptyProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== '' && value !== null),
  );
}

/**
 * Aggiunge a ogni nodo il `v` del proprio tipo, obbligatorio in scrittura
 * (ADR-21 § 1, `content-tree.ts`). Il valore è preso dal registro e non
 * dall'albero caricato perché la lettura restituisce già il contenuto migrato
 * alla versione corrente: la `v` corrente è quindi l'unica corretta per ciò che
 * l'editor ha in mano. Un tipo non nel registro resta senza `v` — il server lo
 * respinge con il path del nodo, che è esattamente il comportamento voluto
 * (nessuna invenzione di versione lato client).
 */
export function toPersistableBlocks(tree: readonly BlockNode[]): Record<string, unknown>[] {
  return tree.map((node) => {
    const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
    return {
      id: node.id,
      type: node.type,
      ...(descriptor ? { v: descriptor.v } : {}),
      props: stripEmptyProps(node.props),
      children: toPersistableBlocks(node.children),
    };
  });
}

/** Segmenti di percorso prodotti dal backend: `blocks[0].children[2].props.text`. */
const PATH_SEGMENT_RE = /(?:blocks|children)\[(\d+)\]/g;

/** Nome della prop colpevole, se il path del server ne indica una. */
export function propNameFromPath(path: string): string | undefined {
  return /\.props\.([A-Za-z0-9_]+)/.exec(path)?.[1];
}

/**
 * Risolve il path di un errore di validazione del server nel nodo
 * corrispondente dell'albero in editing. Il path è posizionale (indici, non
 * id): si percorre l'albero con gli stessi indici usati dal backend.
 */
export function resolveNodeByPath(tree: readonly BlockNode[], path: string): BlockNode | undefined {
  let siblings: readonly BlockNode[] = tree;
  let node: BlockNode | undefined;
  for (const match of path.matchAll(PATH_SEGMENT_RE)) {
    node = siblings[Number(match[1])];
    if (!node) return undefined;
    siblings = node.children;
  }
  return node;
}

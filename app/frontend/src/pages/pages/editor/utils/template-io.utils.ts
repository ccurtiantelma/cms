/**
 * Import/export JSON di un sottoalbero di blocchi (ADR-56 § 2), utilità di migrazione
 * contenuto fra pagine/ambienti — mai "I miei Template" (ADR-56 § 3, per non far percepire
 * una libreria personale non approvata). Nessuna nuova azione store: l'inserimento del
 * sottoalbero importato resta compito del chiamante via `insertSubtreeAction`
 * (`useBlockEditorStore.ts`), che rigenera GUID e costruisce il comando invertibile — questo
 * modulo produce solo un `BlockNode` validato, mai lo inserisce (ADR-56 § 1).
 *
 * `importJsonFile` è l'unica superficie client nuova rispetto ad ADR-34: una fonte non
 * curata (file arbitrario dell'utente), non più solo il catalogo statico bundlato a
 * build-time. La validazione qui è **euristica anticipatoria**, non l'autorità — il
 * validatore server-side invocato al salvataggio della bozza resta invariato e resta l'unico
 * gate autoritativo (stesso principio di `block-registry.utils.ts`, mai duplicato qui:
 * nessun import di `block-tree-validator.service.ts`, codice backend fuori dal confine di
 * ruolo Frontend Developer — ADR-34 § 3, ADR-56 § 2).
 */
import { BLOCK_TYPES, CONTENT_TREE_LIMITS } from '../../../../types/blocks.types';
import { countNodes, generateBlockId, type BlockNode } from '../block-tree.utils';

/** Forma di un nodo esportato: stessa struttura di `BlockNode` meno `id` (vedi {@link stripIds}). */
interface ExportedNode {
  type: string;
  props: Record<string, unknown>;
  children: ExportedNode[];
}

/**
 * Spoglia ricorsivamente l'`id` da un nodo e da ogni discendente: l'unico metadato di
 * istanza locale nell'albero persistito (ADR-56 § 2) — un file esportato porta solo
 * `type`/`props`/`children`, mai un id che ri-collida con un nodo reale al reimport (che
 * comunque rigenera sempre via `insertSubtreeAction`, ma un id assente qui è più onesto di
 * un id destinato a essere scartato).
 */
function stripIds(node: BlockNode): ExportedNode {
  return {
    type: node.type,
    props: { ...node.props },
    children: node.children.map(stripIds),
  };
}

/**
 * Esporta il sottoalbero `node` come file JSON scaricato dal browser (ADR-56 § 2): nessuna
 * chiamata di rete, nessuna nuova dipendenza — `Blob`/`URL.createObjectURL` e un `<a>`
 * temporaneo, stesso idioma minimo già sufficiente per un download client-side puro.
 */
export function exportSubtreeToJson(node: BlockNode): void {
  const serializable = stripIds(node);
  const json = JSON.stringify(serializable, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${node.type}-preset.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Esito di {@link importJsonFile}: rigetto per intero al primo vincolo violato, mai un albero parziale (ADR-56 § 2). */
export type TemplateImportResult = { ok: true; subtree: BlockNode } | { ok: false; error: string };

/** `true` se `value` è un oggetto letterale (non `null`, non un array) — guardia condivisa dalle verifiche di forma sotto. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Forma minima attesa di un nodo importato, prima di conoscerne tipo/profondità: un oggetto
 * con `type` stringa, `props` oggetto letterale, `children` array. Qualunque scostamento
 * (chiave mancante, tipo sbagliato, `props` array/`null`) è un rigetto immediato — nessun
 * default silenzioso che inventerebbe un nodo mai scritto dall'utente.
 */
interface RawImportedNode {
  type: string;
  props: Record<string, unknown>;
  children: RawImportedNode[];
}

/**
 * Verifica ricorsivamente la forma di un nodo grezzo (post `JSON.parse`, pre-tipizzazione).
 * Ritorna il nodo così com'è (narrowed) se conforme, `null` al primo scostamento — la
 * ricorsione si ferma al primo figlio malformato, l'intero import è comunque rigettato per
 * intero da {@link importJsonFile} (nessun uso parziale di un risultato "quasi valido").
 */
function parseRawNode(value: unknown): RawImportedNode | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.type !== 'string') return null;
  if (!isPlainObject(value.props)) return null;
  if (!Array.isArray(value.children)) return null;
  const children: RawImportedNode[] = [];
  for (const child of value.children) {
    const parsedChild = parseRawNode(child);
    if (!parsedChild) return null;
    children.push(parsedChild);
  }
  return { type: value.type, props: value.props, children };
}

/**
 * Verifica ricorsivamente che ogni `type` presente nell'albero grezzo sia nel registro
 * (`BLOCK_TYPES`) — stesso principio anticipatorio già in vigore per `canContainType`
 * (`block-registry.utils.ts`): un tipo sconosciuto al frontend non può essere risolto in un
 * `BlockNode` valido, a prescindere da dove si trovi nell'albero. Ritorna il primo tipo non
 * registrato incontrato (per il messaggio d'errore), o `null` se l'intero albero è conforme.
 */
function findUnknownType(node: RawImportedNode): string | null {
  if (!BLOCK_TYPES.some((entry) => entry.type === node.type)) return node.type;
  for (const child of node.children) {
    const unknown = findUnknownType(child);
    if (unknown) return unknown;
  }
  return null;
}

/** Profondità dell'albero, radice inclusa a profondità 1 (coerente con `CONTENT_TREE_LIMITS.maxDepth`, generato dal backend). */
function treeDepth(node: RawImportedNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

/** Risolve ricorsivamente un `RawImportedNode` validato in un `BlockNode` completo, con id placeholder rigenerati a valle dal chiamante. */
function toBlockNode(node: RawImportedNode): BlockNode {
  return {
    id: generateBlockId(),
    type: node.type,
    props: { ...node.props },
    children: node.children.map(toBlockNode),
  };
}

/**
 * Valida e converte il contenuto testuale `raw` di un file `.json` importato in un
 * `BlockNode` pronto per `insertSubtreeAction` (mai chiamata da qui, ADR-56 § 1). Rigetta
 * l'intero albero al primo vincolo violato, nell'ordine: JSON non parsabile, forma non
 * conforme a un nodo di blocco, tipo non registrato, profondità oltre
 * `CONTENT_TREE_LIMITS.maxDepth`, nodi oltre `CONTENT_TREE_LIMITS.maxNodes` — mai un
 * inserimento parziale (stesso principio del validatore server-side, qui applicato come
 * euristica client, non come autorità: ADR-56 § 2).
 */
export function importJsonFile(raw: string): TemplateImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Il file non è un JSON valido.' };
  }

  const rawNode = parseRawNode(parsed);
  if (!rawNode) {
    return {
      ok: false,
      error:
        'Il file non ha la forma attesa di un blocco: ogni nodo richiede "type" (stringa), ' +
        '"props" (oggetto) e "children" (elenco).',
    };
  }

  const unknownType = findUnknownType(rawNode);
  if (unknownType) {
    return {
      ok: false,
      error: `Il blocco "${unknownType}" non è un tipo riconosciuto dal registro dei blocchi.`,
    };
  }

  const depth = treeDepth(rawNode);
  if (depth > CONTENT_TREE_LIMITS.maxDepth) {
    return {
      ok: false,
      error: `Il blocco importato è annidato troppo in profondità (${depth} livelli, massimo ${CONTENT_TREE_LIMITS.maxDepth}).`,
    };
  }

  // Un solo passaggio di conversione: id placeholder generati qui una volta sola, poi
  // riusati sia per il conteggio nodi sia per il risultato restituito al chiamante.
  const subtree = toBlockNode(rawNode);
  const nodeCount = countNodes([subtree]);
  if (nodeCount > CONTENT_TREE_LIMITS.maxNodes) {
    return {
      ok: false,
      error: `Il blocco importato porterebbe la pagina oltre ${CONTENT_TREE_LIMITS.maxNodes} blocchi.`,
    };
  }

  return { ok: true, subtree };
}

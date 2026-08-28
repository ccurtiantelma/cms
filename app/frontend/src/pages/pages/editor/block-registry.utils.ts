/**
 * Lettura del registro dei blocchi (`types/blocks.types.ts`, artefatto generato dal backend)
 * per le domande di **contenimento**: quali tipi può ospitare un contenitore, e se un tipo
 * dato è ammesso lì dentro.
 *
 * Esiste per una ragione sola: la palette (che decide cosa si può inserire) e lo store (che
 * decide dove si può spostare un nodo già esistente) devono rispondere alla stessa domanda
 * con la stessa regola. Due copie della stessa condizione divergono, e il modo in cui
 * divergerebbero è il peggiore possibile — un'operazione che l'editor consente e il server
 * rifiuta con un `400` a salvataggio già tentato.
 *
 * L'autorità resta comunque il validatore server-side: qui si anticipa il suo verdetto per
 * non offrire un'azione che verrà respinta, mai per sostituirlo.
 */
import {
  BLOCK_TYPES,
  ROOT_ALLOWED,
  type BlockPropDescriptor,
  type BlockTypeDescriptor,
} from '../../../types/blocks.types';
import { findNode, isDescendantOf, type BlockNode } from './block-tree.utils';

/**
 * Valore iniziale di una prop appena creata. Rispetta il `default` dichiarato dal
 * registro quando c'è; altrimenti il valore neutro del `kind`. Una prop obbligatoria
 * **non** riceve un valore plausibile inventato dal client (SPEC-F02 § 3): nasce vuota
 * e sarà il server, non l'editor, a rifiutare il salvataggio finché non è compilata.
 *
 * Vive qui (non in `BlockPalette.tsx`, che pure la esporta per compatibilità con gli
 * import già esistenti) per restare un modulo neutro: sia `BlockPalette` sia
 * `SectionStructureModal.tsx` (ADR-33 § 7) ne hanno bisogno, e se vivesse nell'uno
 * l'altro dovrebbe importarlo da lì — un ciclo fra i due moduli.
 */
function defaultPropValue(prop: BlockPropDescriptor): unknown {
  if (prop.default !== undefined) return prop.default;
  switch (prop.kind) {
    case 'enum':
      return prop.values?.[0] ?? '';
    case 'boolean':
      return false;
    case 'number':
      return 0;
    default:
      // Prop di tipo stringa/colore (richText, plainText, url, mediaRef, color,
      // unitValue, border, shadow, cssClassName, htmlId) senza default esplicito nel
      // registro: se opzionale, nessun valore fantasma — la chiave va omessa
      // dalle prop iniziali del nodo (vedi defaultPropsFor) invece di mandare '' al
      // validatore server, che la respinge con BLOCK_PROP_INVALID. Se obbligatoria,
      // '' resta il segnaposto minimo per un campo che l'utente deve comunque compilare.
      return prop.required ? '' : undefined;
  }
}

/** Props iniziali di un blocco nuovo, calcolate interamente dal descrittore del registro. */
export function defaultPropsFor(descriptor: BlockTypeDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    const value = defaultPropValue(prop);
    if (value !== undefined) props[prop.name] = value;
  }
  return props;
}

/**
 * Tipi ammessi come figli del contenitore indicato: `ROOT_ALLOWED` alla radice
 * (`parentType === undefined`), `childrenAllow` del descrittore altrimenti. Un tipo di
 * contenitore sconosciuto al registro non ammette nulla — non è una foglia con figli
 * liberi, è un tipo che questo frontend non conosce.
 *
 * `childrenAllow === '*'` (sentinel di ADR-39 § 4, oggi solo `container`): "qualunque tipo
 * presente nel registro", risolto qui come l'elenco di **tutti** i `type` in `BLOCK_TYPES` —
 * non solo quelli abilitati/non deprecati/sotto soglia di ruolo, perché quel filtro è già
 * applicato a valle da chi consuma questa funzione (`allowedDescriptors` in
 * `BlockPalette.tsx`, `assignableDescriptors` equivalenti), esattamente come per un elenco
 * esplicito. Senza questo ramo, `'*'.includes(type)` risolverebbe sempre a `false` (`'*'` è
 * una stringa, non un array) e `container` non accetterebbe mai alcun figlio nell'editor.
 */
export function allowedChildTypes(parentType: string | undefined): readonly string[] {
  if (parentType === undefined) return ROOT_ALLOWED;
  const childrenAllow = BLOCK_TYPES.find((entry) => entry.type === parentType)?.childrenAllow;
  if (childrenAllow === '*') return BLOCK_TYPES.map((entry) => entry.type);
  return childrenAllow ?? [];
}

/**
 * `true` se un nodo di tipo `type` può stare fra i figli di un contenitore di tipo
 * `parentType` (`undefined` = radice dell'albero). Non replica gli altri filtri della
 * palette (`enabled`, `deprecated`, `minRole`): quelli riguardano l'**inserimento** di un
 * blocco nuovo, mentre uno spostamento agisce su un nodo che nell'albero c'è già — un tipo
 * disabilitato dopo che il contenuto è stato scritto resta spostabile, altrimenti si
 * bloccherebbe la riorganizzazione di una pagina esistente senza alcun guadagno.
 */
export function canContainType(parentType: string | undefined, type: string): boolean {
  return allowedChildTypes(parentType).includes(type);
}

/**
 * `true` se il nodo `dragId` può essere spostato (drag & drop, PLAN-F04c-editor-maturo.md
 * T7) fra i figli del contenitore `targetParentId` (`null` = radice). Predicato puro e
 * unico per l'ammissibilità del drop: compone la guardia di discendenza già usata da
 * `moveNodeTo` (`block-tree.utils.ts`, esportata come `isDescendantOf` — mai riscritta qui)
 * con `canContainType` di questo file. Nessun controllo di `MAX_DEPTH`: fuori scope in
 * questo round (l'unico contenitore, `section`, è a profondità 2 — irraggiungibile).
 *
 * `false` se: il nodo trascinato non esiste più nell'albero e non è stato dichiarato un
 * `dragType` di riserva, la destinazione è il nodo stesso o un suo discendente (staccherebbe
 * quel ramo dall'albero), il contenitore di destinazione non esiste, o il registro non
 * ammette quel tipo lì.
 *
 * `dragType`: fallback opzionale usato dalla palette widget (`WidgetPalette`, id sintetico
 * `new-block:<type>` mai presente nell'albero) per far valutare l'ammissibilità di un
 * blocco che non esiste ancora — senza, ogni drop-zone apparirebbe "rifiutata" durante un
 * drag valido dalla palette. Ignorato quando `dragId` è un nodo reale: in quel caso il tipo
 * viene sempre dall'albero, mai dal chiamante.
 */
export function canDropInto(
  tree: readonly BlockNode[],
  dragId: string,
  targetParentId: string | null,
  dragType?: string,
): boolean {
  const node = findNode(tree, dragId);
  const type = node?.type ?? dragType;
  if (!type) return false;
  if (targetParentId === dragId) return false;
  if (targetParentId === null) return canContainType(undefined, type);
  if (node && isDescendantOf(node, targetParentId)) return false;
  const targetParent = findNode(tree, targetParentId);
  if (!targetParent) return false;
  return canContainType(targetParent.type, type);
}

/**
 * Messaggio da mostrare (`notifications.show`) quando il registro rifiuta l'inserimento o
 * lo spostamento di un nodo di tipo `type` dentro un contenitore di tipo `parentType`
 * (`undefined` = radice). Caso nominato a parte — sezione dentro sezione, l'errore più
 * frequente perché visivamente non distinguibile nel canvas dal semplice annidamento di un
 * `container` — messaggio generico per ogni altro rifiuto del registro. Condiviso fra
 * `addBlockAction` e `moveNodeToAction` (`useBlockEditorStore.ts`): stessa domanda di
 * ammissibilità, stessa voce all'utente.
 */
export function nestingRejectionMessage(parentType: string | undefined, type: string): string {
  if (parentType === 'section' && type === 'section') {
    return 'Impossibile inserire una Sezione all\'interno di un\'altra Sezione.';
  }
  return `Il blocco "${type}" non è ammesso in questo contenitore.`;
}

/**
 * Forma di un nodo dentro `static-section-presets.json` (ADR-34 § 1): stessa struttura
 * ricorsiva di `BlockNode`, dichiarata a parte perché il file statico porta solo le prop
 * *significative* del preset (mai tutte quelle del descrittore) e un id placeholder — non
 * ancora un `BlockNode` completo finché `resolvePresetSubtree` non lo risolve contro il
 * registro.
 */
export interface SectionPresetNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: SectionPresetNode[];
}

/** Una voce della libreria di preset: id/etichetta della tessera più il sottoalbero. */
export interface SectionPreset {
  id: string;
  label: string;
  subtree: SectionPresetNode;
}

/**
 * Risolve ricorsivamente un nodo di `static-section-presets.json` in un `BlockNode`
 * completo (ADR-34 § 1/§ 3): parte dai default del descrittore di registro
 * (`defaultPropsFor`, lo stesso spread-e-override già usato da
 * `SectionStructureModal.handleSelect`) e sovrascrive solo le prop dichiarate esplicitamente
 * dal preset, ricorsivamente sui `children`. L'id assegnato qui è un placeholder qualunque:
 * `insertSubtreeAction` (`useBlockEditorStore.ts`) lo rigenera insieme a tutto il
 * sottoalbero prima di inserirlo, quindi non serve unicità in questa fase.
 *
 * Nessun fallback silenzioso per un tipo non presente nel registro: un preset disallineato
 * dal registro (dopo una futura evoluzione dello schema blocchi, ADR-21) è un bug del file
 * statico da far emergere subito, non da nascondere a runtime con props vuote (ADR-34 §
 * Conseguenza) — il Test Engineer copre questo rischio con un test dedicato.
 */
export function resolvePresetSubtree(node: SectionPresetNode): BlockNode {
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  if (!descriptor) {
    throw new Error(
      `static-section-presets.json: tipo "${node.type}" non presente nel registro dei blocchi.`,
    );
  }
  return {
    id: node.id,
    type: node.type,
    props: { ...defaultPropsFor(descriptor), ...node.props },
    children: node.children.map(resolvePresetSubtree),
  };
}

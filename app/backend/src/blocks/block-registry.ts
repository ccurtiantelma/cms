import { createHash } from 'crypto';
import { BlockDefinition } from './block-definition.types';
import { sectionBlock } from './types/section.block';
import { headingBlock } from './types/heading.block';
import { richTextBlock } from './types/rich-text.block';
import { imageBlock } from './types/image.block';
import { buttonBlock } from './types/button.block';
import { containerBlock } from './types/container.block';
import { formBlock } from './types/form.block';
import { formFieldBlock } from './types/form-field.block';
import { formSubmitBlock } from './types/form-submit.block';

/**
 * Tipi ammessi come nodo di **radice** dell'albero. Dichiarato qui e mai
 * dedotto altrove (ADR-21 § 2, SPEC-F02-blocchi.md § 3.1). Comprende tutti e
 * sei i tipi — non solo `section` — perché F01 ha già persistito alberi
 * con una foglia in `blocks[0]` e nessuna migrazione può inventare un nodo
 * `section` sintetico senza creare struttura che l'autore non ha scritto.
 * `container` (ADR-39 § 4) segue lo stesso principio.
 */
export const ROOT_ALLOWED: readonly string[] = [
  'section',
  'heading',
  'richText',
  'image',
  'button',
  'container',
];

/**
 * I cinque tipi approvati uno per uno da ADR-21 § 5, più `container`
 * (sesto tipo, ADR-39) e `form`/`form-field`/`form-submit` (settimo/ottavo/
 * nono tipo, ADR-46 § 1). Tutti a `v: 1`, `enabled: true`, nessun `minRole`,
 * nessun `deprecated` (PLAN-F02 T2).
 */
const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  sectionBlock,
  headingBlock,
  richTextBlock,
  imageBlock,
  buttonBlock,
  containerBlock,
  formBlock,
  formFieldBlock,
  formSubmitBlock,
];

/** Registro dei tipi, indicizzato per `type`. Fonte di verità del backend (ADR-21 § 2). */
export const BLOCK_REGISTRY: ReadonlyMap<string, BlockDefinition> = new Map(
  BLOCK_DEFINITIONS.map((definition) => [definition.type, definition]),
);

/**
 * Registro completo passato al validator: definizioni per tipo + elenco dei
 * tipi ammessi alla radice. Un parametro esplicito (non un import fisso nel
 * validator) permette a T7 di iniettare un registro di test con un tipo
 * portato a `v: 2`, senza il quale il motore di migrazione (T4) non sarebbe
 * verificabile (PLAN-F02 § Rischi).
 */
export interface BlockRegistry {
  definitions: ReadonlyMap<string, BlockDefinition>;
  rootAllowed: readonly string[];
}

/** Registro di produzione: i cinque tipi approvati da ADR-21 § 5. */
export const DEFAULT_BLOCK_REGISTRY: BlockRegistry = {
  definitions: BLOCK_REGISTRY,
  rootAllowed: ROOT_ALLOWED,
};

/**
 * Token DI per il registro attivo (stesso pattern di `STORAGE_DRIVER`,
 * `files/storage/storage-driver.interface.ts`). `BlocksModule` lo fornisce
 * con `DEFAULT_BLOCK_REGISTRY`; un test e2e può sovrascriverlo con
 * `overrideProvider(BLOCK_REGISTRY_TOKEN)` per iniettare un registro con un
 * tipo a `v: 2` nel punto di consumo reale (`PagesService`), senza toccare
 * produzione (PLAN-F02 T7/T6). Nome distinto da `BLOCK_REGISTRY` sopra (la
 * `Map` interna per `type`) per evitare la collisione di identificatori.
 */
export const BLOCK_REGISTRY_TOKEN = Symbol('BLOCK_REGISTRY');

/**
 * Cerca un tipo di blocco per nome nel registro dato (default: quello di
 * produzione). Ritorna `undefined` se il tipo non esiste — la valutazione di
 * `enabled`/`minRole` è responsabilità del chiamante (`validator/`).
 */
export function findBlockDefinition(
  type: string,
  registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
): BlockDefinition | undefined {
  return registry.definitions.get(type);
}

/**
 * Token corto del registro (ADR-23 § 2): hash di `type`/`v`/lunghezza della
 * catena di migrazioni di ciascuna definizione, ordinate per `type` per
 * ottenere lo stesso token indipendentemente dall'ordine di dichiarazione.
 * Un deploy che aggiunge un gradino di migrazione (o un tipo) cambia il
 * token — e quindi il prefisso della cache pubblica — senza che nessun
 * evento di contenuto lo segnali: è esattamente il guasto che il token
 * chiude. Calcolato dal registro **passato**, mai da `DEFAULT_BLOCK_REGISTRY`
 * fisso: un test e2e che sovrascrive `BLOCK_REGISTRY_TOKEN` deve ottenere un
 * token coerente con il registro che ha davvero iniettato.
 */
export function computeBlockRegistryToken(registry: BlockRegistry): string {
  const parts = [...registry.definitions.values()]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((definition) => `${definition.type}:${definition.v}:${definition.migrations.length}`);
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8);
}

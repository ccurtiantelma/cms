import { PropKind } from '../prop-spec.types';

/** Codici d'errore prodotti dall'interprete di validazione (SPEC-F02-blocchi.md § 4). */
export type BlockValidationErrorCode =
  | 'BLOCK_TYPE_UNKNOWN'
  | 'BLOCK_NESTING_NOT_ALLOWED'
  | 'BLOCK_PROP_NOT_DECLARED'
  | 'BLOCK_PROP_INVALID';

/** Insieme chiuso dei `reason` di `BLOCK_PROP_INVALID` (SPEC-F02-blocchi.md § 4.1). */
export type BlockPropInvalidReason =
  'required' | 'empty' | 'type' | 'maxLength' | 'enum' | 'urlScheme' | 'guidFormat';

/** `type` sconosciuto, `enabled: false`, o `minRole` non soddisfatto. */
export interface BlockTypeUnknownDetails {
  path: string;
  type: string;
}

/** Figlio non in `children.allow` del genitore, o nodo di radice non in `ROOT_ALLOWED`. */
export interface BlockNestingNotAllowedDetails {
  path: string;
  type: string;
  /** `null` quando il nodo colpevole è alla radice. */
  parentType: string | null;
  allowed: string[];
}

/** Prop presente in input ma non dichiarata dallo schema del tipo. */
export interface BlockPropNotDeclaredDetails {
  path: string;
  type: string;
  prop: string;
  declared: string[];
}

/**
 * Prop dichiarata ma non conforme. `constraint`/`actual` sono sempre
 * **misure**, mai il valore colpevole (SPEC-F02-blocchi.md § 4): per
 * `maxLength` sono lunghezze in code point, per `enum` `constraint` è
 * l'elenco dei valori ammessi e `actual` resta assente.
 */
export interface BlockPropInvalidDetails {
  path: string;
  type: string;
  prop: string;
  kind: PropKind;
  reason: BlockPropInvalidReason;
  constraint?: number | string[];
  actual?: number;
}

export type BlockValidationErrorDetails =
  | BlockTypeUnknownDetails
  | BlockNestingNotAllowedDetails
  | BlockPropNotDeclaredDetails
  | BlockPropInvalidDetails;

/** Un singolo errore prodotto dall'interprete, con il path del nodo colpevole. */
export interface BlockValidationError {
  code: BlockValidationErrorCode;
  details: BlockValidationErrorDetails;
}

/**
 * Esito della validazione di un intero albero. `errors` elenca **tutti** i
 * nodi colpevoli trovati (business-rules.md § Blocchi regola 4: un albero
 * non valido si respinge per intero, mai al primo errore): T5 userà
 * `errors` per popolare `details` dell'eccezione 400, o per rifiutare
 * l'intero salvataggio.
 */
export interface BlockTreeValidationResult {
  valid: boolean;
  errors: BlockValidationError[];
}

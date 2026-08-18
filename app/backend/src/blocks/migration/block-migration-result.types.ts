import { MigratableBlockNode } from './block-migration.types';

/**
 * Codice d'errore prodotto dal motore di migrazione in lettura
 * (SPEC-F02-blocchi.md § 4). `BLOCK_MIGRATION_FAILED` (500, migrazione che
 * solleva) non è qui: ADR-21 § 3.6 impone che una migrazione sia totale e
 * pura, senza casi di fallimento — non è un esito che questo motore produce
 * per costruzione.
 */
export type BlockMigrationErrorCode = 'BLOCK_VERSION_UNSUPPORTED';

/**
 * `v` del nodo superiore alla versione corrente del registro per quel
 * `type` (ADR-21 § 1: contenuto scritto da un futuro che questo backend non
 * conosce — non un caso teorico, la conseguenza normale di un rollback dopo
 * un incremento di `v`). Non è un fallimento di migrazione: la policy è
 * restituire il nodo come ricevuto e continuare a processare il resto
 * dell'albero (mai un albero mutilato).
 */
export interface BlockVersionUnsupportedDetails {
  path: string;
  type: string;
  v: number;
  current: number;
}

/** Un singolo esito di versione non supportata, con il path del nodo colpevole. */
export interface BlockMigrationError {
  code: BlockMigrationErrorCode;
  details: BlockVersionUnsupportedDetails;
}

/**
 * Esito della migrazione di un intero albero: sempre un albero (mai
 * un'eccezione per un esito atteso), con `errors` che elenca **ogni** nodo
 * con `v` superiore al corrente — mai il primo soltanto (stesso principio di
 * `BlockTreeValidationResult`, ADR-21 § 3.7). I nodi problematici compaiono
 * in `blocks` **come ricevuti**, non scartati.
 */
export interface BlockTreeMigrationResult {
  blocks: MigratableBlockNode[];
  errors: BlockMigrationError[];
}

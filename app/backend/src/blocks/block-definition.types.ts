import { PropSpec } from './prop-spec.types';
import { BlockPropsMigrationStep } from './migration/block-migration.types';

/**
 * Regole di annidamento di un tipo di blocco: elenco dei `type` ammessi come
 * figli diretti. Dichiarato in **una sola direzione** — il genitore elenca i
 * figli ammessi, mai un elenco speculare "genitori ammessi" (ADR-21 § 2).
 * `allow: []` significa che il tipo è una foglia.
 */
export interface BlockChildrenSpec {
  allow: readonly string[];
}

/**
 * Metadati opachi alla validazione, consumati solo dall'editor (palette di
 * F04) e dall'artefatto generato per il frontend (SPEC-F02 § 5.1). Il
 * registro non dichiara alcun contratto di rendering (ADR-21 § 2).
 */
export interface BlockEditorMeta {
  label: string;
  icon?: string;
  category?: string;
}

/**
 * Definizione di un tipo di blocco (ADR-21 § 2).
 */
export interface BlockDefinition {
  /** Identificativo stabile del tipo (es. `'section'`). */
  type: string;
  /** Versione corrente dello schema di questo tipo. Tutti e cinque nascono a `1`. */
  v: number;
  /** Mappa nome prop → descrittore. `{}` per un tipo senza props dichiarate. */
  props: Record<string, PropSpec>;
  /** Regole di annidamento come figlio ammesso, in una sola direzione. */
  children: BlockChildrenSpec;
  /**
   * Catena ordinata delle funzioni di migrazione delle props: `migrations[0]`
   * porta da `v:1` a `v:2`, `migrations[1]` da `v:2` a `v:3`, ecc. (ADR-21
   * § 3.6, PLAN-F02 T4). `migrations.length` deve essere coerente con `v - 1`
   * — invariante di autoria del registro, nessun controllo runtime. `[]` per
   * un tipo ancora a `v: 1`, come tutti e cinque i tipi del primo rilascio.
   */
  migrations: readonly BlockPropsMigrationStep[];
  /** `false` esclude il tipo dalla validazione quanto `type` sconosciuto (`BLOCK_TYPE_UNKNOWN`). */
  enabled: boolean;
  /**
   * Soglia di ruolo minima (valore RBAC, più basso = più privilegi) richiesta
   * per usare il tipo. Nessuno dei cinque tipi del primo rilascio la
   * dichiara. Non sostituisce guard/ownership: è un filtro aggiuntivo
   * valutato server-side (ADR-18).
   */
  minRole?: number;
  /** `true` per un tipo ritirato: validabile in lettura, fuori dalla palette (ADR-21 § 3.6). */
  deprecated?: boolean;
  /** Metadati d'editor opachi alla validazione. */
  meta?: BlockEditorMeta;
}

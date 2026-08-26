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
 * Metadati d'editor di una singola prop (ADR-30 § 1), indicizzati per nome
 * dentro `BlockEditorMeta.props`. Opachi alla validazione quanto il resto di
 * `meta`: il validatore non li legge mai. Una prop dichiarata senza voce qui
 * è un difetto, non un default silenzioso (ADR-30 § 4) — presidiato da un
 * test di invariante sul registro.
 */
export interface BlockEditorPropMeta {
  /** Etichetta leggibile mostrata nell'ispettore — chiude la voce 3.10 di `docs/TODO.md`. */
  label: string;
  /** Scheda dell'ispettore che ospita il controllo. Assente = `'content'` (ADR-30 § 3, ADR-37 § 5). */
  tab?: 'content' | 'style' | 'advanced';
  /** Ordine dentro la scheda. Assente = ordine di dichiarazione in `props`. */
  order?: number;
  /** Riga di aiuto sotto il campo, facoltativa. */
  help?: string;
}

/**
 * Metadati opachi alla validazione, consumati solo dall'editor (palette di
 * F04) e dall'artefatto generato per il frontend (SPEC-F02 § 5.1). Il
 * registro non dichiara alcun contratto di rendering (ADR-21 § 2) — `props`
 * è uno scostamento consapevole verso un contratto di **presentazione**,
 * dichiarato in ADR-30 § 7, non di rendering.
 */
export interface BlockEditorMeta {
  label: string;
  icon?: string;
  category?: string;
  /** Metadati per prop, indicizzati per nome (ADR-30 § 1). */
  props?: Record<string, BlockEditorPropMeta>;
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

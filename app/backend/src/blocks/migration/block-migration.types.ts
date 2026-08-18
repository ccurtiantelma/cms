/**
 * Tipi del motore di migrazione (PLAN-F02 T4, ADR-21 § 1/§ 3). Nessuna
 * dipendenza da `content-tree.ts`: quel file resta di `pages/` fino
 * all'innesto di T5, e `blocks/` non si accoppia a `pages/` prima di allora
 * (stesso principio di `validator/validatable-node.types.ts`).
 */

/**
 * Funzione di migrazione delle props di un nodo da una versione N a N+1
 * (ADR-21 § 3.6). **Pura e totale**: nessun I/O, nessun accesso a database,
 * orologio o rete, nessun `throw` previsto — verificabile per ispezione
 * della firma. Gira *prima* della validazione nella pipeline (ADR-21 § 3
 * punto 6), quindi riceve `props` non validate: ogni prop letta va trattata
 * come possibilmente assente, di tipo sbagliato o malformata, con fallback
 * al default dichiarato dallo schema **di arrivo** (l'unico che il registro
 * conserva — nessuno schema storico). Non muta l'oggetto `props` ricevuto:
 * ritorna sempre un nuovo oggetto.
 */
export type BlockPropsMigrationStep = (props: Record<string, unknown>) => Record<string, unknown>;

/**
 * Funzione di migrazione dell'**envelope** (le chiavi
 * `id`/`type`/`v`/`props`/`children`, non l'aggregato degli schemi dei tipi),
 * applicata **prima** delle catene per nodo (ADR-21 § 3 punto 8). Stessa
 * disciplina pura/totale di `BlockPropsMigrationStep`. Oggi la catena reale è
 * vuota: `ENVELOPE_VERSION` non si è mai mosso.
 */
export type EnvelopeMigrationStep = (envelope: Record<string, unknown>) => Record<string, unknown>;

/**
 * Nodo dell'albero blocchi così come arriva al motore di migrazione: stessa
 * forma di `ValidatableBlockNode`/`BlockNode`, più `v` facoltativo — assente
 * in lettura vale `1` (ADR-21 § 1), il caso reale di ogni riga scritta da
 * F01. Dichiarato qui e non importato da `content-tree.ts`/`validatable-node.types.ts`
 * per non accoppiare `blocks/` a `pages/` prima dell'innesto di T5.
 */
export interface MigratableBlockNode {
  id: string;
  type: string;
  v?: number;
  props: Record<string, unknown>;
  children: MigratableBlockNode[];
}

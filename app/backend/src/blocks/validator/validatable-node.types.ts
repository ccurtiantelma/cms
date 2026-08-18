/**
 * Nodo dell'albero blocchi così come arriva al validator di registro: già
 * passato dallo stadio "forma envelope" (`app/backend/src/pages/content-tree.ts`,
 * non toccato da questo modulo — resta di T5) ed eventualmente già migrato
 * (motore di migrazione, T4). Il validator non legge/impone `v` per nodo: la
 * coerenza di versione è responsabilità del motore di migrazione (PLAN-F02
 * T4), non di questo interprete.
 *
 * Forma identica a `BlockNode` di `content-tree.ts` per costruzione (stesso
 * envelope), ma dichiarata qui per non accoppiare `blocks/` a `pages/` prima
 * che T5 li innesti l'uno nell'altro.
 */
export interface ValidatableBlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: ValidatableBlockNode[];
}

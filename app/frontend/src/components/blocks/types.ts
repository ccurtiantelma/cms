/**
 * Forma a runtime di un nodo dell'albero dei blocchi, ricalcata su `BlockNode`
 * di `app/backend/src/pages/content-tree.ts` (backend, fuori scope frontend:
 * non importato). Locale a `components/blocks/` per rispettare il vincolo di
 * isolamento (PLAN-F02-blocchi.md T8).
 */
export interface RenderableBlockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: readonly RenderableBlockNode[];
}

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

/**
 * Nomi di breakpoint di una prop di stile responsive (ADR-29 § 2), ricalcati
 * su `RESPONSIVE_BREAKPOINTS` di `app/backend/src/blocks/prop-spec.types.ts`
 * — non importato, per lo stesso vincolo di isolamento di `RenderableBlockNode`.
 */
export const RESPONSIVE_BREAKPOINTS = ['default', 'tablet', 'mobile'] as const;

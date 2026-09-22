import type { RenderableBlockNode } from '@blocks/types';
import { generateCanvasCss, type CanvasCssNode } from '@blocks/generateCanvasCss';
import { resolveActiveBreakpoints, type BreakpointsDto } from '../../frontend/src/libs/breakpoints';

/**
 * CSS dinamico per-nodo (valori liberi PropKind v2, oggi `background`
 * `none|color|gradient` — ADR-96) da iniettare inline nel `<head>` del documento
 * SSR: `RenderableBlockNode` e `CanvasCssNode` hanno la stessa forma strutturale
 * (`id`/`type`/`props`/`children`), nessun cast necessario.
 *
 * Riusa `generateCanvasCss` (mirror **frontend-only**, già scope-corretto per
 * ADR-96) invece di duplicarne l'algoritmo qui: la sua fonte di verità resta
 * `app/backend/src/blocks/compiler/to-css.ts`, letta come riferimento, mai
 * importata (CLAUDE.md § Isolamento del dominio — `app/public-site` non è un
 * consumer NestJS). Selettore emesso: `[data-canvas-style-id="<id>"]`, lo
 * stesso attributo già renderizzato da `Container.tsx` (condiviso via alias
 * `@blocks` da `app/public-site`/`app/frontend`) — non `[data-block="<id>"]`
 * di `SPEC-PROPKIND-V2-DETAILS.md` § 10, mai emesso da alcun componente.
 *
 * @param pageBlocks Blocchi di primo livello di `content.blocks` della Pagina.
 * @param headerBlocks Blocchi della Sezione Globale assegnata allo slot `header`.
 * @param footerBlocks Blocchi della Sezione Globale assegnata allo slot `footer`.
 * @param breakpoints Breakpoint attivi per sito (ADR-76), risolti da `fetchBreakpoints`.
 */
export function buildBlockDynamicCss(
  pageBlocks: readonly RenderableBlockNode[],
  headerBlocks: readonly RenderableBlockNode[],
  footerBlocks: readonly RenderableBlockNode[],
  breakpoints: BreakpointsDto,
): string {
  const activeBreakpoints = resolveActiveBreakpoints(breakpoints);
  const tree: readonly CanvasCssNode[] = [...headerBlocks, ...pageBlocks, ...footerBlocks];
  return generateCanvasCss(tree, activeBreakpoints);
}

/**
 * Superficie pubblica del compilatore CSS server-side (Sub-Task S1.2,
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 10).
 */
export { toCss } from './to-css';
export { shapeDividerToCssBlock } from './shape-divider-to-css';
export {
  CssDeclaration,
  CssDeclarationBlock,
  ResolvedBreakpoint,
  ResolvedBreakpointName,
  RESOLVED_BREAKPOINT_ORDER,
  ToCssContext,
} from './css-declaration.types';

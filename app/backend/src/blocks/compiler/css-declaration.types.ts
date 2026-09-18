/**
 * Tipi del compilatore CSS server-side `toCss()` (Sub-Task S1.2,
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 10).
 *
 * RICONCILIAZIONE S1.3: `ResolvedBreakpointName`/`ResolvedBreakpoint` erano
 * definiti **localmente in questo modulo** in S1.2 (nota storica: fino a
 * S1.3, `RESPONSIVE_BREAKPOINTS` restava l'elenco storico a 3 chiavi). S1.3
 * introduce le 7 chiavi ADR-76 direttamente in `prop-spec.types.ts`
 * (`ResponsiveBreakpointName`/`resolveActiveBreakpoints()`): questo modulo
 * ora **riusa quel tipo condiviso** (alias `ResolvedBreakpointName` invariato
 * per non toccare gli import esistenti di `to-css.ts`/`typography-to-
 * declarations.ts`/`index.ts`), eliminando la duplicazione. `toCss()` resta
 * una funzione pura: nessuna lettura di `app_settings` in questo modulo — il
 * chiamante produce `ctx.activeBreakpoints` tramite `resolveActiveBreakpoints()`
 * (`prop-spec.types.ts`), non ancora cablato in una pipeline (fuori scope S1.3).
 */
import {
  ResponsiveBreakpointName,
  RESPONSIVE_BREAKPOINTS,
  ResolvedBreakpoint,
} from '../prop-spec.types';

/** Alias del tipo condiviso `ResponsiveBreakpointName` (`prop-spec.types.ts`), nome storico invariato in questo modulo. */
export type ResolvedBreakpointName = ResponsiveBreakpointName;

/**
 * Ordine di iterazione canonico e deterministico richiesto da
 * `SPEC-PROPKIND-V2-DETAILS.md` § 10 punto 3 (ADR-76 § "Decisione" punto 1/3):
 * dal più largo al più stretto. Riusa l'ordine di `RESPONSIVE_BREAKPOINTS`
 * (`prop-spec.types.ts`), unica sorgente sia per il validatore sia per il
 * compilatore. Usato solo per fissare l'ordine con cui `toCss()` processa le
 * chiavi presenti nel valore — la lista delle chiavi effettivamente attive
 * per il sito arriva già filtrata in `ctx.activeBreakpoints`.
 */
export const RESOLVED_BREAKPOINT_ORDER: readonly ResolvedBreakpointName[] = RESPONSIVE_BREAKPOINTS;

/**
 * Breakpoint già risolto dal chiamante di `toCss()` (tipo condiviso con il
 * validatore/`resolveActiveBreakpoints()`, `prop-spec.types.ts`): filtrato per
 * `active` (ADR-76 § "Decisione" punto 4/5) e con la soglia già calcolata
 * contro `app_settings.breakpoints`. `mediaQuery` è assente per `'default'`
 * (nessuna media query, il breakpoint di base non ne ha una).
 */
export type { ResolvedBreakpoint };

/** Contesto di compilazione di un singolo nodo (`SPEC-PROPKIND-V2-DETAILS.md` § 10). */
export interface ToCssContext {
  /** Identificativo del blocco, usato nel selettore `[data-block="<id>"]`. */
  blockId: string;
  /** Breakpoint attivi per il sito, già risolti (vedi nota di modulo sopra). */
  activeBreakpoints: ResolvedBreakpoint[];
}

/** Una singola dichiarazione CSS `property: value`. */
export interface CssDeclaration {
  property: string;
  value: string;
}

/**
 * Blocco di dichiarazioni CSS per un selettore/media query
 * (`SPEC-PROPKIND-V2-DETAILS.md` § 10). Nessuna deduplicazione fra blocchi
 * diversi (§ 10 punto 6): ogni nodo emette il proprio insieme completo, anche
 * se identico a un blocco fratello.
 */
export interface CssDeclarationBlock {
  /** `'[data-block="<blockId>"]'` (+ `':hover'`/`':focus'`/`':active'` se lo stato non è `'normal'`). */
  selector: string;
  /** Es. `'(max-width: 1024px)'`. Assente per il breakpoint `'default'`. */
  mediaQuery?: string;
  declarations: CssDeclaration[];
}

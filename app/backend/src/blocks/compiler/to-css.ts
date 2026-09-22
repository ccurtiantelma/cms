/**
 * Compilatore CSS server-side `toCss()` (Sub-Task S1.2,
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 10). Funzione pura: nessuno
 * stato, nessuna dipendenza NestJS — il chiamante (pipeline di pubblicazione,
 * fuori scope di questo Sub-Task) fornisce `ctx.activeBreakpoints` già
 * risolto (vedi nota in `css-declaration.types.ts` sulla riconciliazione
 * futura con `RESPONSIVE_BREAKPOINTS`/S1.3).
 *
 * Algoritmo (§ 10):
 * 1. Normalizzazione dell'inviluppo `stateful` (`spec.stateful`): assente →
 *    unico ramo `{ normal: value }`.
 * 2. Iterazione esterna sugli stati presenti, ordine fisso
 *    `normal, hover, focus, active` (mai l'ordine di inserimento
 *    dell'oggetto) — determinismo del CSS emesso.
 * 3. Iterazione interna sui breakpoint presenti nel ramo di stato, ordine
 *    fisso dei 7 nomi di ADR-76 § "Decisione" punto 1, filtrati contro
 *    `ctx.activeBreakpoints`. `typography` fa eccezione: `responsive` opera
 *    per campo (§ 3 punto 3), quindi la sua risoluzione breakpoint è delegata
 *    a `typographyBreakpointDeclarations` invece del percorso generico
 *    "inviluppo sull'intero valore".
 * 4. Funzione di conversione valore→dichiarazioni dedicata per `kind`
 *    (`value-to-declarations.ts`).
 * 6. Nessuna deduplicazione fra blocchi diversi.
 */
import { PropKind, PropSpec } from '../prop-spec.types';
import {
  CssDeclaration,
  CssDeclarationBlock,
  RESOLVED_BREAKPOINT_ORDER,
  ResolvedBreakpoint,
  ResolvedBreakpointName,
  ToCssContext,
} from './css-declaration.types';
import { isPlainObject } from './value-shapes.types';
import {
  backgroundToDeclarations,
  colorRefToDeclarations,
  filterToDeclarations,
  fontRefToDeclarations,
  gradientToDeclarations,
  layoutToDeclarations,
  positionToDeclarations,
  radiusToDeclarations,
  spacingToDeclarations,
  transformToDeclarations,
} from './value-to-declarations';
import { typographyBreakpointDeclarations } from './typography-to-declarations';

/** Elenco chiuso a 4 stati (ADR-75 § "Decisione" punto 3), ordine fisso di emissione. */
const STATE_ORDER = ['normal', 'hover', 'focus', 'active'] as const;
type StateName = (typeof STATE_ORDER)[number];

/**
 * Normalizza l'inviluppo `stateful` (ADR-75 § "Decisione" punto 1) in una
 * mappa parziale `stato → valore nudo (o inviluppo breakpoint)`. Se
 * `stateful` è `false`/assente, l'intero `value` diventa il ramo `normal`
 * (§ 10 punto 1).
 */
function normalizeStateEnvelope(
  value: unknown,
  stateful: boolean,
): Partial<Record<StateName, unknown>> {
  if (!stateful) {
    return { normal: value };
  }
  if (isPlainObject(value)) {
    const envelope: Partial<Record<StateName, unknown>> = {};
    for (const state of STATE_ORDER) {
      if (Object.prototype.hasOwnProperty.call(value, state)) {
        envelope[state] = value[state];
      }
    }
    return envelope;
  }
  // Valore malformato (non oggetto) su una prop `stateful`: il validatore
  // l'avrebbe già respinto a monte (`reason: 'type'`). Qui degradiamo
  // trattandolo come ramo `normal` per restare una funzione pura che non
  // lancia su un input teoricamente già validato, coerente con l'assenza di
  // un contratto di errore dedicato per `toCss()` in questo documento.
  return { normal: value };
}

/**
 * Normalizza l'inviluppo `responsive` (ADR-29 § 2) sull'**intero** valore di
 * stato, per ogni `kind` la cui `responsive` non opera per campo (tutti
 * tranne `typography`, gestita a parte). Se `responsive` è `false`/assente,
 * il valore diventa il ramo `default` (§ 10 punto 1).
 */
function normalizeBreakpointEnvelope(
  value: unknown,
  responsive: boolean,
): Partial<Record<ResolvedBreakpointName, unknown>> {
  if (!responsive) {
    return { default: value };
  }
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'default')) {
    const envelope: Partial<Record<ResolvedBreakpointName, unknown>> = {};
    for (const name of RESOLVED_BREAKPOINT_ORDER) {
      if (Object.prototype.hasOwnProperty.call(value, name)) {
        envelope[name] = value[name];
      }
    }
    return envelope;
  }
  // Stessa nota difensiva di `normalizeStateEnvelope`: un envelope malformato
  // sarebbe già stato respinto dal validatore a monte.
  return { default: value };
}

/**
 * Dispatcher valore→dichiarazioni per gli 8 `kind` v2 che non sono
 * `typography` (§ 10 punto 4). Nessun `kind` v1 è implementato: fuori scope
 * del Sub-Task S1.2 (task operativo punto 2), produce un errore esplicito.
 */
function valueToDeclarations(spec: PropSpec, value: unknown): CssDeclaration[] {
  switch (spec.kind) {
    case 'colorRef':
      return colorRefToDeclarations(spec, value);
    case 'fontRef':
      return fontRefToDeclarations(value);
    case 'spacing':
      return spacingToDeclarations(spec, value);
    case 'radius':
      return radiusToDeclarations(value);
    case 'gradient':
      return gradientToDeclarations(value);
    case 'position':
      return positionToDeclarations(value);
    case 'transform':
      return transformToDeclarations(value);
    case 'filter':
      return filterToDeclarations(value);
    case 'layout':
      return layoutToDeclarations(value);
    case 'background':
      return backgroundToDeclarations(value);
    case 'typography':
      // Percorso dedicato: vedi `resolveBreakpointDeclarations` sotto, mai
      // questo dispatcher generico "un valore per breakpoint".
      throw new Error(
        "toCss(): 'typography' non passa da valueToDeclarations, è gestito da typographyBreakpointDeclarations",
      );
    default:
      throw new Error(
        `toCss(): kind '${spec.kind}' fuori scope del Sub-Task S1.2 (solo i 9 kind PropKind v2 — colorRef, fontRef, typography, spacing, radius, gradient, position, transform, filter — sono implementati).`,
      );
  }
}

/**
 * Risolve il valore di un singolo ramo di stato in una lista di
 * `{ breakpoint, declarations }`, una voce per ciascun breakpoint attivo con
 * almeno una dichiarazione (§ 10 punto 3/4). `typography` delega
 * interamente a `typographyBreakpointDeclarations` (responsive per campo,
 * vedi nota di modulo).
 */
function resolveBreakpointDeclarations(
  spec: PropSpec,
  stateValue: unknown,
  activeBreakpoints: ResolvedBreakpoint[],
): { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] {
  if (spec.kind === 'typography') {
    return typographyBreakpointDeclarations(stateValue, activeBreakpoints);
  }

  const responsive = 'responsive' in spec && Boolean(spec.responsive);
  const breakpointEnvelope = normalizeBreakpointEnvelope(stateValue, responsive);
  const activeByName = new Map<ResolvedBreakpointName, ResolvedBreakpoint>(
    activeBreakpoints.map((breakpoint) => [breakpoint.name, breakpoint]),
  );

  const result: { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] = [];
  for (const name of RESOLVED_BREAKPOINT_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(breakpointEnvelope, name)) continue;
    const active = activeByName.get(name);
    if (!active) continue; // breakpoint noto ma disattivato per il sito (ADR-76 § "Decisione" punto 4).
    const nakedValue = breakpointEnvelope[name];
    const declarations = valueToDeclarations(spec, nakedValue);
    if (declarations.length > 0) {
      result.push({ breakpoint: active, declarations });
    }
  }
  return result;
}

/**
 * Compila il valore di una prop `PropKind v2` in una o più
 * `CssDeclarationBlock` (`SPEC-PROPKIND-V2-DETAILS.md` § 10). Funzione pura:
 * nessun accesso a `app_settings`/DB — `ctx.activeBreakpoints` deve arrivare
 * già filtrato e con le soglie risolte (Sub-Task S1.3,
 * `resolveActiveBreakpoints()`, non ancora scritto).
 *
 * @param kind Il `PropKind` dichiarato dalla prop (deve coincidere con `spec.kind`).
 * @param spec Il descrittore della prop (unione discriminata `PropSpec`).
 * @param value Il valore grezzo così come persistito nell'albero del blocco.
 * @param ctx Contesto di compilazione (id del blocco, breakpoint attivi già risolti).
 * @returns L'elenco (possibilmente vuoto) di blocchi di dichiarazioni CSS da emettere.
 */
export function toCss(
  kind: PropKind,
  spec: PropSpec,
  value: unknown,
  ctx: ToCssContext,
): CssDeclarationBlock[] {
  if (kind !== spec.kind) {
    // Guardia difensiva: la firma prevede `kind` e `spec.kind` come due
    // parametri distinti (§ 10, coerente con `validateProp` del validatore che
    // riceve `spec` da solo); un disallineamento indica un bug del chiamante,
    // non un dato di contenuto malformato — motivo per cui qui si lancia
    // invece di degradare silenziosamente.
    throw new Error(`toCss(): 'kind' (${kind}) non coincide con 'spec.kind' (${spec.kind})`);
  }

  const blocks: CssDeclarationBlock[] = [];
  const stateEnvelope = normalizeStateEnvelope(value, Boolean(spec.stateful));

  for (const state of STATE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(stateEnvelope, state)) continue;
    const stateValue = stateEnvelope[state];
    const selector = `[data-block="${ctx.blockId}"]${state === 'normal' ? '' : `:${state}`}`;

    const perBreakpoint = resolveBreakpointDeclarations(spec, stateValue, ctx.activeBreakpoints);
    for (const { breakpoint, declarations } of perBreakpoint) {
      blocks.push({
        selector,
        mediaQuery: breakpoint.name === 'default' ? undefined : breakpoint.mediaQuery,
        declarations,
      });
    }
  }

  return blocks;
}

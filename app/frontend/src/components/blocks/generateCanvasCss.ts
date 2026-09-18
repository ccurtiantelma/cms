/**
 * Runtime Style Bridge del Canvas (round R2 "parità Elementor Pro"): genera il CSS dei
 * valori liberi PropKind v2 (`colorRef`, `fontRef`, `typography`, `spacing`, `radius`,
 * `gradient`, `position`, `transform`, `filter`, più `layout` di `container` v2, ADR-82) per
 * l'albero di blocchi correntemente in editing, da iniettare in un tag `<style>` del
 * documento dell'iframe del Canvas (`IframeCanvas.tsx`, ADR-72).
 *
 * Mirror **frontend-only** dell'algoritmo autorevole del compilatore server-side
 * (`app/backend/src/blocks/compiler/to-css.ts` + `value-to-declarations.ts` +
 * `typography-to-declarations.ts`, letti come riferimento di correttezza, mai importati —
 * CLAUDE.md § Isolamento del dominio): stessa normalizzazione d'envelope stato→breakpoint
 * (ADR-75 § "Decisione" punto 1), stesso ordine fisso di iterazione stati
 * (`normal, hover, focus, active`) e breakpoint (ADR-76 § "Decisione" punto 1), stessa
 * conversione valore→dichiarazioni per `kind`, stesso trattamento speciale di `typography`
 * (`responsive` per campo, non sull'intero oggetto — SPEC-PROPKIND-V2-DETAILS.md § 3 punto 3).
 *
 * A differenza del backend (che lancia un errore per un `kind` fuori scope, S1.2 essendo
 * consumato solo da codice server che conosce esattamente quali `kind` esistono in quel
 * momento), questo modulo **ignora silenziosamente** ogni `kind` che il compilatore backend
 * non implementa ancora (`background`, `link`, `animation`, `motion`, `attributes`, `css`,
 * `hideOn`, `shapeDivider` — debito dichiarato in ADR-82 § "Conseguenze") e ogni `kind` v1
 * (già reso da `style-tokens.ts` via classi CSS Module, mai da questo modulo): un editor
 * live non deve mai smettere di renderizzare l'anteprima per una prop non ancora coperta.
 *
 * Selettore CSS: **deviazione dichiarata** da `SPEC-PROPKIND-V2-DETAILS.md` § 10
 * (`'[data-block="<blockId>"]'`, pensato per il consumer HTML pubblico, fuori scope qui).
 * Questo modulo usa `[data-canvas-style-id="<id>"]` — un attributo **nuovo**, non
 * `data-block-id` (`EditorBlockWrapper.tsx`/`EditorStructureNavigator.tsx`, identità del nodo
 * per la chrome dell'editor): quell'attributo vive sul **wrapper** di ogni nodo, un livello di
 * annidamento più esterno del componente di contenuto vero e proprio (`Container.tsx`, ecc.).
 * Riusarlo applicherebbe due volte ogni dichiarazione (es. `display: grid` sia sul wrapper sia
 * sul contenitore vero, rompendo il layout — un genitore `display: grid` con un solo figlio
 * grid non produce lo stesso risultato di quel figlio stesso in `display: grid` con i propri
 * figli). `data-canvas-style-id` è quindi portato dal componente di contenuto sulla propria
 * radice (oggi solo `Container.tsx`, round R2) — vedi il resoconto finale per il dettaglio di
 * questa scelta di design non coperta letteralmente dai documenti.
 */
import {
  BLOCK_TYPES,
  PROP_STATES,
  RESPONSIVE_BREAKPOINTS,
  type BlockPropDescriptor,
  type PropStateName,
  type ResponsiveBreakpointName,
} from '../../types/blocks.types';
import type { ResolvedBreakpoint } from '../../libs/breakpoints';

export type { ResolvedBreakpoint } from '../../libs/breakpoints';

/** Nodo minimo su cui `generateCanvasCss` può operare: compatibile sia con `RenderableBlockNode`
 * (`components/blocks/types.ts`, sito pubblico) sia con `BlockNode` (`block-tree.utils.ts`,
 * store dell'editor) — nessuno dei due è importato qui, la forma strutturale basta. */
export interface CanvasCssNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: readonly CanvasCssNode[];
}

interface CssDeclaration {
  property: string;
  value: string;
}

interface CssDeclarationBlock {
  selector: string;
  mediaQuery?: string;
  declarations: CssDeclaration[];
}

/** I 9 `kind` PropKind v2 + `layout` (Container v2, ADR-82) effettivamente implementati dal
 * compilatore backend (`to-css.ts` § "Dispatcher"): unico punto di verità di "cosa sappiamo
 * ancora rendere" — ogni altro `kind` produce zero dichiarazioni, mai un errore. */
const SUPPORTED_KINDS = new Set<BlockPropDescriptor['kind']>([
  'colorRef',
  'fontRef',
  'typography',
  'spacing',
  'radius',
  'gradient',
  'position',
  'transform',
  'filter',
  'layout',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Forme "nude" dei 9 kind + layout (mirror di value-shapes.types.ts, backend) ───

interface UnitValueShape {
  value: number;
  unit: string;
}

type ColorRefValueShape = string | { ref: string };
type FontRefValueShape =
  { ref: string } | { family: string; source: 'system' | 'google' | 'custom' };

interface SpacingValueShape {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: string;
  linked: boolean;
}

interface RadiusValueShape {
  tl: number;
  tr: number;
  br: number;
  bl: number;
  unit: string;
}

interface GradientStopShape {
  color: ColorRefValueShape;
  at: number;
}

interface GradientValueShape {
  type: 'linear' | 'radial';
  angle?: number;
  position?: string;
  stops: GradientStopShape[];
}

interface PositionValueShape {
  type: 'default' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  offset?: {
    top?: UnitValueShape;
    right?: UnitValueShape;
    bottom?: UnitValueShape;
    left?: UnitValueShape;
  };
  zIndex?: number;
  sticky?: { edge: 'top' | 'bottom'; offset: UnitValueShape };
}

interface TransformValueShape {
  rotate?: number;
  scale?: number;
  skewX?: number;
  skewY?: number;
  translateX?: UnitValueShape;
  translateY?: UnitValueShape;
  flipH?: boolean;
  flipV?: boolean;
  origin?: string;
}

interface FilterValueShape {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hue?: number;
  grayscale?: number;
  blend?: string;
}

type GridTrackShape = { value: number; unit: string } | 'auto';
type GridTemplateValueShape = { preset: 'repeat'; count: number } | GridTrackShape[];

interface LayoutValueShape {
  display?: 'flex' | 'grid';
  direction?: string;
  wrap?: string;
  justify?: string;
  align?: string;
  gap?: { x: UnitValueShape; y: UnitValueShape };
  gridTemplateColumns?: GridTemplateValueShape;
  gridTemplateRows?: GridTemplateValueShape;
  autoFlow?: string;
  justifyItems?: string;
  alignItems?: string;
}

interface TypographyValueShape {
  fontFamily?: FontRefValueShape;
  fontSize?: UnitValueShape;
  fontWeight?: string;
  textTransform?: string;
  fontStyle?: string;
  textDecoration?: string;
  lineHeight?: UnitValueShape;
  letterSpacing?: UnitValueShape;
  wordSpacing?: UnitValueShape;
}

// ─── Conversione valore → dichiarazioni, una funzione per kind (mirror di value-to-declarations.ts) ───

function unitValueToCss(unitValue: UnitValueShape): string {
  return `${unitValue.value}${unitValue.unit}`;
}

/** § 10 punto 5: un hex letterale è emesso così com'è, un `{ ref }` emette `var(--gk-color-<id>)`. */
function colorRefValueToCss(value: ColorRefValueShape): string {
  if (typeof value === 'string') return value;
  return `var(--gk-color-${value.ref})`;
}

/** Stessa distinzione di `colorRefValueToCss`: `{ ref }` emette `var(--gk-font-<id>-family)`. */
function fontRefValueToCss(value: FontRefValueShape): string {
  if ('ref' in value) return `var(--gk-font-${value.ref}-family)`;
  return value.family.includes(' ') ? `"${value.family}"` : value.family;
}

/** `colorRef` → una dichiarazione sulla proprietà CSS dichiarata da `spec.cssProperty` (Addendum S1.2). */
function colorRefToDeclarations(spec: BlockPropDescriptor, value: unknown): CssDeclaration[] {
  if (!spec.cssProperty) return [];
  return [{ property: spec.cssProperty, value: colorRefValueToCss(value as ColorRefValueShape) }];
}

/** `fontRef` di primo livello: proprietà CSS fissa (`font-family`), a differenza di `colorRef`. */
function fontRefToDeclarations(value: unknown): CssDeclaration[] {
  return [{ property: 'font-family', value: fontRefValueToCss(value as FontRefValueShape) }];
}

/** `spacing` → quattro dichiarazioni sul lato `spec.target` (Addendum S1.2, § 10 punto 5bis). */
function spacingToDeclarations(spec: BlockPropDescriptor, value: unknown): CssDeclaration[] {
  if (!isPlainObject(value) || !spec.target) return [];
  const spacing = value as unknown as SpacingValueShape;
  const prefix = spec.target;
  return [
    { property: `${prefix}-top`, value: `${spacing.top}${spacing.unit}` },
    { property: `${prefix}-right`, value: `${spacing.right}${spacing.unit}` },
    { property: `${prefix}-bottom`, value: `${spacing.bottom}${spacing.unit}` },
    { property: `${prefix}-left`, value: `${spacing.left}${spacing.unit}` },
  ];
}

/** `radius` → `border-radius` shorthand a 4 valori (top-left, top-right, bottom-right, bottom-left). */
function radiusToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const radius = value as unknown as RadiusValueShape;
  return [
    {
      property: 'border-radius',
      value: `${radius.tl}${radius.unit} ${radius.tr}${radius.unit} ${radius.br}${radius.unit} ${radius.bl}${radius.unit}`,
    },
  ];
}

/** `gradient` → `background-image` (§ 6): `angle` assente ricade su 180°, `position` solo su `radial`. */
function gradientToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const gradient = value as unknown as GradientValueShape;
  const stopsCss = gradient.stops
    .map((stop) => `${colorRefValueToCss(stop.color)} ${stop.at}%`)
    .join(', ');
  if (gradient.type === 'linear') {
    const angle = gradient.angle ?? 180;
    return [{ property: 'background-image', value: `linear-gradient(${angle}deg, ${stopsCss})` }];
  }
  const positionClause = gradient.position ? `at ${gradient.position}, ` : '';
  return [{ property: 'background-image', value: `radial-gradient(${positionClause}${stopsCss})` }];
}

/** `position` → `position` + `top`/`right`/`bottom`/`left` + `z-index` (§ 7). `'default'` → `static`. */
function positionToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const position = value as unknown as PositionValueShape;
  const declarations: CssDeclaration[] = [
    { property: 'position', value: position.type === 'default' ? 'static' : position.type },
  ];
  if (position.offset) {
    const { top, right, bottom, left } = position.offset;
    if (top) declarations.push({ property: 'top', value: unitValueToCss(top) });
    if (right) declarations.push({ property: 'right', value: unitValueToCss(right) });
    if (bottom) declarations.push({ property: 'bottom', value: unitValueToCss(bottom) });
    if (left) declarations.push({ property: 'left', value: unitValueToCss(left) });
  }
  if (typeof position.zIndex === 'number') {
    declarations.push({ property: 'z-index', value: String(position.zIndex) });
  }
  if (position.type === 'sticky' && position.sticky) {
    declarations.push({
      property: position.sticky.edge,
      value: unitValueToCss(position.sticky.offset),
    });
  }
  return declarations;
}

/** `transform` → shorthand `transform` (+ `transform-origin`), ordine `translate → rotate → scale → skew`
 * (§ 8; `flipH`/`flipV` compongono il segno di `scale` sull'asse corrispondente). */
function transformToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const transform = value as unknown as TransformValueShape;
  const parts: string[] = [];
  if (transform.translateX || transform.translateY) {
    const tx = transform.translateX ? unitValueToCss(transform.translateX) : '0';
    const ty = transform.translateY ? unitValueToCss(transform.translateY) : '0';
    parts.push(`translate(${tx}, ${ty})`);
  }
  if (typeof transform.rotate === 'number') parts.push(`rotate(${transform.rotate}deg)`);
  const baseScale = typeof transform.scale === 'number' ? transform.scale : 1;
  const scaleX = transform.flipH ? -baseScale : baseScale;
  const scaleY = transform.flipV ? -baseScale : baseScale;
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`);
  if (typeof transform.skewX === 'number') parts.push(`skewX(${transform.skewX}deg)`);
  if (typeof transform.skewY === 'number') parts.push(`skewY(${transform.skewY}deg)`);
  const declarations: CssDeclaration[] = [];
  if (parts.length > 0) declarations.push({ property: 'transform', value: parts.join(' ') });
  if (transform.origin)
    declarations.push({ property: 'transform-origin', value: transform.origin });
  return declarations;
}

/** `filter` → shorthand `filter` (+ `mix-blend-mode`), ordine `blur → brightness → contrast → saturate →
 * hue-rotate → grayscale` (§ 9). */
function filterToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const filter = value as unknown as FilterValueShape;
  const parts: string[] = [];
  if (typeof filter.blur === 'number') parts.push(`blur(${filter.blur}px)`);
  if (typeof filter.brightness === 'number') parts.push(`brightness(${filter.brightness}%)`);
  if (typeof filter.contrast === 'number') parts.push(`contrast(${filter.contrast}%)`);
  if (typeof filter.saturate === 'number') parts.push(`saturate(${filter.saturate}%)`);
  if (typeof filter.hue === 'number') parts.push(`hue-rotate(${filter.hue}deg)`);
  if (typeof filter.grayscale === 'number') parts.push(`grayscale(${filter.grayscale}%)`);
  const declarations: CssDeclaration[] = [];
  if (parts.length > 0) declarations.push({ property: 'filter', value: parts.join(' ') });
  if (filter.blend) declarations.push({ property: 'mix-blend-mode', value: filter.blend });
  return declarations;
}

function gridTrackToCss(track: GridTrackShape): string {
  return track === 'auto' ? 'auto' : `${track.value}${track.unit}`;
}

/** `{preset:'repeat', count}` → `repeat(<count>, 1fr)`; array di `GridTrackValue` → stringa spazio-separata. */
function gridTemplateToCss(template: GridTemplateValueShape): string {
  if (!Array.isArray(template)) return `repeat(${template.count}, 1fr)`;
  return template.map(gridTrackToCss).join(' ');
}

/** `layout` → `display` + le proprietà Flexbox o Grid corrispondenti (ADR-82 § "Conseguenze"). */
function layoutToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) return [];
  const layout = value as unknown as LayoutValueShape;
  const display = layout.display ?? 'flex';
  const declarations: CssDeclaration[] = [{ property: 'display', value: display }];

  if (display === 'grid') {
    if (layout.gridTemplateColumns) {
      declarations.push({
        property: 'grid-template-columns',
        value: gridTemplateToCss(layout.gridTemplateColumns),
      });
    }
    if (layout.gridTemplateRows) {
      declarations.push({
        property: 'grid-template-rows',
        value: gridTemplateToCss(layout.gridTemplateRows),
      });
    }
    if (layout.autoFlow) declarations.push({ property: 'grid-auto-flow', value: layout.autoFlow });
    if (layout.justifyItems)
      declarations.push({ property: 'justify-items', value: layout.justifyItems });
    if (layout.alignItems) declarations.push({ property: 'align-items', value: layout.alignItems });
  } else {
    if (layout.direction)
      declarations.push({ property: 'flex-direction', value: layout.direction });
    if (layout.wrap) declarations.push({ property: 'flex-wrap', value: layout.wrap });
    if (layout.justify) declarations.push({ property: 'justify-content', value: layout.justify });
    if (layout.align) declarations.push({ property: 'align-items', value: layout.align });
  }

  if (layout.gap) {
    declarations.push({ property: 'column-gap', value: unitValueToCss(layout.gap.x) });
    declarations.push({ property: 'row-gap', value: unitValueToCss(layout.gap.y) });
  }

  return declarations;
}

// ─── `typography`: risoluzione breakpoint dedicata, `responsive` per campo (§ 3 punto 3) ───

const TYPOGRAPHY_FIELD_ORDER = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'textTransform',
  'fontStyle',
  'textDecoration',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
] as const;

type TypographyField = (typeof TYPOGRAPHY_FIELD_ORDER)[number];

const TYPOGRAPHY_FIELD_PROPERTY: Record<TypographyField, string> = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textTransform: 'text-transform',
  fontStyle: 'font-style',
  textDecoration: 'text-decoration',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
};

function typographyFieldValueToCss(field: TypographyField, nakedValue: unknown): string {
  if (field === 'fontFamily') return fontRefValueToCss(nakedValue as FontRefValueShape);
  if (
    field === 'fontSize' ||
    field === 'lineHeight' ||
    field === 'letterSpacing' ||
    field === 'wordSpacing'
  ) {
    return unitValueToCss(nakedValue as UnitValueShape);
  }
  return String(nakedValue);
}

/** `true` se `value` è un envelope breakpoint (`{ default, tablet?, ... }`), non un valore nudo. */
function isBreakpointEnvelope(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'default');
}

function typographyBreakpointDeclarations(
  stateValue: unknown,
  activeBreakpoints: ResolvedBreakpoint[],
): { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] {
  if (!isPlainObject(stateValue)) return [];
  const typography = stateValue as unknown as TypographyValueShape;
  const activeByName = new Map<ResponsiveBreakpointName, ResolvedBreakpoint>(
    activeBreakpoints.map((breakpoint) => [breakpoint.name, breakpoint]),
  );
  const declarationsByBreakpoint = new Map<ResponsiveBreakpointName, CssDeclaration[]>();

  for (const field of TYPOGRAPHY_FIELD_ORDER) {
    const fieldValue = typography[field];
    if (fieldValue === undefined) continue;

    const envelope = isBreakpointEnvelope(fieldValue) ? fieldValue : { default: fieldValue };
    for (const breakpointName of RESPONSIVE_BREAKPOINTS) {
      if (!Object.prototype.hasOwnProperty.call(envelope, breakpointName)) continue;
      if (!activeByName.has(breakpointName)) continue;
      const nakedFieldValue = (envelope as Record<string, unknown>)[breakpointName];
      const declaration: CssDeclaration = {
        property: TYPOGRAPHY_FIELD_PROPERTY[field],
        value: typographyFieldValueToCss(field, nakedFieldValue),
      };
      const bucket = declarationsByBreakpoint.get(breakpointName) ?? [];
      bucket.push(declaration);
      declarationsByBreakpoint.set(breakpointName, bucket);
    }
  }

  const result: { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] = [];
  for (const breakpointName of RESPONSIVE_BREAKPOINTS) {
    const declarations = declarationsByBreakpoint.get(breakpointName);
    if (declarations && declarations.length > 0) {
      result.push({ breakpoint: activeByName.get(breakpointName)!, declarations });
    }
  }
  return result;
}

// ─── Normalizzazione envelope stato/breakpoint (mirror di to-css.ts) ───

function normalizeStateEnvelope(
  value: unknown,
  stateful: boolean,
): Partial<Record<PropStateName, unknown>> {
  if (!stateful) return { normal: value };
  if (isPlainObject(value)) {
    const envelope: Partial<Record<PropStateName, unknown>> = {};
    for (const state of PROP_STATES) {
      if (Object.prototype.hasOwnProperty.call(value, state)) {
        envelope[state] = value[state];
      }
    }
    return envelope;
  }
  // Valore malformato su una prop stateful: già respinto server-side a monte (SPEC-F02-blocchi.md
  // § 5.3). Qui si degrada trattandolo come ramo `normal`, mai un errore che romperebbe il canvas.
  return { normal: value };
}

function normalizeBreakpointEnvelope(
  value: unknown,
  responsive: boolean,
): Partial<Record<ResponsiveBreakpointName, unknown>> {
  if (!responsive) return { default: value };
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'default')) {
    const envelope: Partial<Record<ResponsiveBreakpointName, unknown>> = {};
    for (const name of RESPONSIVE_BREAKPOINTS) {
      if (Object.prototype.hasOwnProperty.call(value, name)) {
        envelope[name] = value[name];
      }
    }
    return envelope;
  }
  return { default: value };
}

/** Dispatcher valore→dichiarazioni per gli 8 kind v2 non-`typography` + `layout` (§ 10 punto 4). */
function valueToDeclarations(spec: BlockPropDescriptor, value: unknown): CssDeclaration[] {
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
    default:
      // Fuori scope del compilatore backend (commento di testa del modulo): nessuna dichiarazione,
      // mai un errore — un `kind` non ancora implementato non deve mai rompere il canvas live.
      return [];
  }
}

function resolveBreakpointDeclarations(
  spec: BlockPropDescriptor,
  stateValue: unknown,
  activeBreakpoints: ResolvedBreakpoint[],
): { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] {
  if (spec.kind === 'typography') {
    return typographyBreakpointDeclarations(stateValue, activeBreakpoints);
  }

  const responsive = Boolean(spec.responsive);
  const breakpointEnvelope = normalizeBreakpointEnvelope(stateValue, responsive);
  const activeByName = new Map<ResponsiveBreakpointName, ResolvedBreakpoint>(
    activeBreakpoints.map((breakpoint) => [breakpoint.name, breakpoint]),
  );

  const result: { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] = [];
  for (const name of RESPONSIVE_BREAKPOINTS) {
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
 * Compila il valore di una singola prop in una o più `CssDeclarationBlock` (§ 10), mirror di
 * `toCss()` backend. `blockId` qui è il valore di `data-canvas-style-id` (deviazione
 * dichiarata, vedi commento di testa del modulo), non `data-block`.
 */
function toCssForProp(
  spec: BlockPropDescriptor,
  value: unknown,
  blockId: string,
  activeBreakpoints: ResolvedBreakpoint[],
): CssDeclarationBlock[] {
  if (!SUPPORTED_KINDS.has(spec.kind)) return [];

  const blocks: CssDeclarationBlock[] = [];
  const stateEnvelope = normalizeStateEnvelope(value, Boolean(spec.stateful));

  for (const state of PROP_STATES) {
    if (!Object.prototype.hasOwnProperty.call(stateEnvelope, state)) continue;
    const stateValue = stateEnvelope[state];
    const selector = `[data-canvas-style-id="${blockId}"]${state === 'normal' ? '' : `:${state}`}`;

    const perBreakpoint = resolveBreakpointDeclarations(spec, stateValue, activeBreakpoints);
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

/** Indice `type → descrittore`, stesso principio di `BlockRenderer.tsx` (`KNOWN_TYPES`). */
const DESCRIPTOR_BY_TYPE = new Map(BLOCK_TYPES.map((descriptor) => [descriptor.type, descriptor]));

function collectDeclarationBlocks(
  node: CanvasCssNode,
  activeBreakpoints: ResolvedBreakpoint[],
  out: CssDeclarationBlock[],
): void {
  const descriptor = DESCRIPTOR_BY_TYPE.get(node.type);
  if (descriptor) {
    for (const spec of descriptor.props) {
      const value = node.props[spec.name];
      if (value === undefined) continue;
      const blocks = toCssForProp(spec, value, node.id, activeBreakpoints);
      out.push(...blocks);
    }
  }
  for (const child of node.children) {
    collectDeclarationBlocks(child, activeBreakpoints, out);
  }
}

function serializeDeclarationBlock(block: CssDeclarationBlock): string {
  const body = block.declarations.map((d) => `${d.property}: ${d.value};`).join(' ');
  const rule = `${block.selector} { ${body} }`;
  return block.mediaQuery ? `@media ${block.mediaQuery} { ${rule} }` : rule;
}

/**
 * Genera il CSS dei valori liberi PropKind v2 per l'intero albero (vedi commento di testa del
 * modulo). Funzione pura: nessuno stato, nessun accesso al DOM — il chiamante
 * (`IframeCanvas.tsx`) è responsabile dell'iniezione nel tag `<style id="eaidos-canvas-styles">`
 * del documento dell'iframe. Ordine di emissione: profondità dell'albero (genitore prima dei
 * figli, stesso ordine di visita di `BlockRenderer.tsx`), poi ordine delle prop dichiarate dal
 * registro, poi stato/breakpoint (§ 10 punto 2/3) — deterministico, mai l'ordine di un `Map`/
 * `Set` di iterazione implicita.
 *
 * @param tree Radice/i dell'albero in editing (`state.tree` di `useBlockEditorStore.ts`).
 * @param activeBreakpoints Breakpoint attivi per il sito, già risolti (ADR-76), `'default'` incluso.
 */
export function generateCanvasCss(
  tree: readonly CanvasCssNode[],
  activeBreakpoints: ResolvedBreakpoint[],
): string {
  const blocks: CssDeclarationBlock[] = [];
  for (const node of tree) {
    collectDeclarationBlocks(node, activeBreakpoints, blocks);
  }
  return blocks.map(serializeDeclarationBlock).join('\n');
}

/**
 * Forme di valore "nudo" (post-inviluppo stateful/responsive) dei nove `kind`
 * PropKind v2, mirror locale dei blocchi `ts` inline di
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 1-9. Non promossi a
 * `prop-spec.types.ts`: quel file dichiara solo i descrittori (`*PropSpec`),
 * mai la forma del valore validato — la promozione di questi tipi come
 * contratto condiviso fra validatore e compilatore non è nello scope additivo
 * del Sub-Task S1.2 (che tocca `prop-spec.types.ts` solo per
 * `ColorRefPropSpec.cssProperty`/`SpacingPropSpec.target`, Addendum S1.2).
 * Il validatore (`block-tree-validator.service.ts`) garantisce a monte che un
 * valore con questa forma sia l'unico ad arrivare qui: questo modulo resta
 * comunque difensivo (nessun accesso non verificato a una proprietà di un
 * `unknown`).
 */

/** `GlobalColorId`/`GlobalFontId` (SPEC-PROPKIND-V2-DETAILS.md § 1/§ 2): guid 16 hex o id system riservato. */
export type GlobalRefId = string;

/** Valore nudo di `colorRef` (SPEC-PROPKIND-V2-DETAILS.md § 1). */
export type ColorRefValueShape = string | { ref: GlobalRefId };

/** Valore nudo di `fontRef` (SPEC-PROPKIND-V2-DETAILS.md § 2). */
export type FontRefValueShape =
  { ref: GlobalRefId } | { family: string; source: 'system' | 'google' | 'custom' };

/** `UnitValue` generico (SPEC-PROPKIND-V2-DETAILS.md § 3/§ 7/§ 8): unità già validata dal chiamante. */
export interface UnitValueShape {
  value: number;
  unit: string;
}

/** Valore nudo di `spacing` (SPEC-PROPKIND-V2-DETAILS.md § 4). */
export interface SpacingValueShape {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: string;
  linked: boolean;
}

/** Valore nudo di `radius` (SPEC-PROPKIND-V2-DETAILS.md § 5). */
export interface RadiusValueShape {
  tl: number;
  tr: number;
  br: number;
  bl: number;
  unit: string;
}

/** Uno stop di `gradient` (SPEC-PROPKIND-V2-DETAILS.md § 6). */
export interface GradientStopShape {
  color: ColorRefValueShape;
  at: number;
}

/** Valore nudo di `gradient` (SPEC-PROPKIND-V2-DETAILS.md § 6). */
export interface GradientValueShape {
  type: 'linear' | 'radial';
  angle?: number;
  position?: string;
  stops: GradientStopShape[];
}

/** Valore nudo di `position` (SPEC-PROPKIND-V2-DETAILS.md § 7). */
export interface PositionValueShape {
  type: 'default' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  offset?: {
    top?: UnitValueShape;
    right?: UnitValueShape;
    bottom?: UnitValueShape;
    left?: UnitValueShape;
  };
  zIndex?: number;
  sticky?: {
    edge: 'top' | 'bottom';
    offset: UnitValueShape;
    onBreakpoints: string[];
    stayInParent: boolean;
  };
}

/** Valore nudo di `transform` (SPEC-PROPKIND-V2-DETAILS.md § 8). */
export interface TransformValueShape {
  rotate?: number;
  scale?: number;
  skewX?: number;
  skewY?: number;
  translateX?: UnitValueShape;
  translateY?: UnitValueShape;
  flipH?: boolean;
  flipV?: boolean;
  origin?:
    | 'center'
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top left'
    | 'top right'
    | 'bottom left'
    | 'bottom right';
}

/** Valore nudo di `filter` (SPEC-PROPKIND-V2-DETAILS.md § 9). */
export interface FilterValueShape {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hue?: number;
  grayscale?: number;
  blend?: string;
}

/** Campo per campo, la forma nuda del valore composito di `typography` (SPEC-PROPKIND-V2-DETAILS.md § 3). */
export interface TypographyValueShape {
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

// ─── Container v2 (ADR-82, round R2 "parità Elementor Pro", Sub-Task S1.4) ───

/** Una singola traccia di `gridTemplateColumns`/`gridTemplateRows` (ADR-82 § "Decisione" punto 1). */
export type GridTrackShape = { value: number; unit: string } | 'auto';

/** Valore nudo di `layout.gridTemplateColumns`/`gridTemplateRows` (ADR-82 § "Decisione" punto 1). */
export type GridTemplateValueShape = { preset: 'repeat'; count: number } | GridTrackShape[];

/** Valore nudo di `layout` (ADR-82 § "Decisione" punto 1). */
export interface LayoutValueShape {
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

/**
 * Valore nudo di `background` (`docs/SPEC-propkind-v2.md` § 3.7,
 * `prop-spec.types.ts` → `BackgroundValue`), scope limitato a `type: 'none' |
 * 'color' | 'gradient'` (ADR-96 § "Decisione" punto 2). `image`/`video`/
 * `slideshow`/`overlay` restano validi per lo schema ma non hanno una forma
 * dichiarata qui: `backgroundToDeclarations()` non li legge in questo round
 * (nessuna dichiarazione emessa per quei rami, nessuna eccezione).
 */
export interface BackgroundValueShape {
  type: 'none' | 'color' | 'gradient' | 'image' | 'video' | 'slideshow';
  color?: ColorRefValueShape;
  gradient?: GradientValueShape;
}

/** Valore nudo di `shapeDivider` (ADR-82 § "Decisione" punto 1). */
export interface ShapeDividerValueShape {
  style: string;
  color: ColorRefValueShape;
  width: UnitValueShape;
  height: UnitValueShape;
  flip: boolean;
  invert: boolean;
  aboveContent: boolean;
}

/**
 * Verifica minimale che `value` sia un oggetto piano (non `null`, non
 * array) — stessa funzione (per principio, non per import) di
 * `isPlainObject` in `block-tree-validator.service.ts`: duplicata qui
 * deliberatamente per mantenere questo modulo indipendente dal validatore
 * (nessun accoppiamento fra "funzione pura di compilazione" e "servizio di
 * validazione", moduli con responsabilità distinte).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

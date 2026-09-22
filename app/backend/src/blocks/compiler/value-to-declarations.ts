/**
 * Generatori di dichiarazioni CSS, uno per `kind` (`SPEC-PROPKIND-V2-DETAILS.md`
 * § 10 punto 4): ciascuna funzione converte il "valore nudo" (già risolto da
 * `toCss()` per una singola combinazione stato×breakpoint) nell'insieme di
 * `CssDeclaration` da emettere. Nessuna funzione condivisa fra `kind` diversi
 * (stesso principio già in vigore per `border`/`shadow`, `prop-spec.types.ts`
 * righe 197-223). `typography` non è qui: il suo modificatore `responsive`
 * opera per campo, non sull'intero oggetto (§ 3 punto 3), quindi richiede una
 * risoluzione di breakpoint dedicata — vedi `typography-to-declarations.ts`.
 */
import { ColorRefPropSpec, SpacingPropSpec } from '../prop-spec.types';
import { CssDeclaration } from './css-declaration.types';
import {
  BackgroundValueShape,
  ColorRefValueShape,
  FilterValueShape,
  FontRefValueShape,
  GradientValueShape,
  GridTemplateValueShape,
  GridTrackShape,
  LayoutValueShape,
  PositionValueShape,
  RadiusValueShape,
  SpacingValueShape,
  TransformValueShape,
  UnitValueShape,
  isPlainObject,
} from './value-shapes.types';

/** Formatta un `UnitValue` come valore CSS letterale (`${value}${unit}`, es. `32px`, `50%`). */
export function unitValueToCss(unitValue: UnitValueShape): string {
  return `${unitValue.value}${unitValue.unit}`;
}

/**
 * Converte un `ColorRefValue` (SPEC-PROPKIND-V2-DETAILS.md § 1) nel valore CSS
 * letterale corrispondente. § 10 punto 5: un hex letterale è emesso così
 * com'è, un `{ ref }` non emette mai il proprio id ma la variabile CSS
 * `var(--gk-color-<id>)` risolta dal foglio Global Kit (`SPEC-GLOBAL-KIT.md`
 * § 3).
 */
export function colorRefValueToCss(value: ColorRefValueShape): string {
  if (typeof value === 'string') {
    return value;
  }
  return `var(--gk-color-${value.ref})`;
}

/**
 * Converte un `FontRefValue` (SPEC-PROPKIND-V2-DETAILS.md § 2) nel valore CSS
 * letterale corrispondente, stessa distinzione di `colorRefValueToCss` (§ 10
 * punto 5): `{ ref }` emette `var(--gk-font-<id>-family)`, mai l'id letterale.
 * Per `{ family, source }` la `family` è emessa letteralmente (racchiusa fra
 * doppi apici se contiene uno spazio, sintassi CSS standard per un nome di
 * font multi-parola) — la risoluzione del token di sistema/Google/custom a
 * uno stack di font reale non è descritta da questo documento (vive nel
 * foglio dei token del Global Kit, `SPEC-GLOBAL-KIT.md`, fuori scope qui).
 */
export function fontRefValueToCss(value: FontRefValueShape): string {
  if ('ref' in value) {
    return `var(--gk-font-${value.ref}-family)`;
  }
  return value.family.includes(' ') ? `"${value.family}"` : value.family;
}

/**
 * `colorRef` → una dichiarazione sulla proprietà CSS dichiarata da
 * `spec.cssProperty` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md § 10 punto 4).
 */
export function colorRefToDeclarations(spec: ColorRefPropSpec, value: unknown): CssDeclaration[] {
  return [{ property: spec.cssProperty, value: colorRefValueToCss(value as ColorRefValueShape) }];
}

/**
 * `fontRef` come `kind` di primo livello (non annidato dentro `typography`):
 * la proprietà CSS di destinazione è fissa (`font-family`), a differenza di
 * `colorRef` — nessun campo aggiuntivo richiesto dall'Addendum S1.2, coerente
 * con l'elenco dei `kind` a proprietà fissa di SPEC-PROPKIND-V2-DETAILS.md
 * (interpretazione: il documento non lo elenca esplicitamente fra quelli a
 * proprietà fissa, ma non lo elenca nemmeno fra quelli che richiedono un
 * campo come `colorRef`/`spacing` — `font-family` è l'unica proprietà CSS
 * sensata per un riferimento a font).
 */
export function fontRefToDeclarations(value: unknown): CssDeclaration[] {
  return [{ property: 'font-family', value: fontRefValueToCss(value as FontRefValueShape) }];
}

/**
 * `spacing` → quattro dichiarazioni sul lato dichiarato da `spec.target`
 * (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md § 10 punto 5bis): `padding-*` se
 * `target: 'padding'`, `margin-*` se `target: 'margin'`. `linked` è solo
 * presentazione (§ 4 punto 2), non altera il CSS emesso.
 */
export function spacingToDeclarations(spec: SpacingPropSpec, value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const spacing = value as unknown as SpacingValueShape;
  const prefix = spec.target;
  return [
    { property: `${prefix}-top`, value: `${spacing.top}${spacing.unit}` },
    { property: `${prefix}-right`, value: `${spacing.right}${spacing.unit}` },
    { property: `${prefix}-bottom`, value: `${spacing.bottom}${spacing.unit}` },
    { property: `${prefix}-left`, value: `${spacing.left}${spacing.unit}` },
  ];
}

/**
 * `radius` → `border-radius` shorthand a 4 valori, ordine CSS standard
 * (top-left, top-right, bottom-right, bottom-left), stessa unità per i
 * quattro angoli (SPEC-PROPKIND-V2-DETAILS.md § 5).
 */
export function radiusToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const radius = value as unknown as RadiusValueShape;
  return [
    {
      property: 'border-radius',
      value: `${radius.tl}${radius.unit} ${radius.tr}${radius.unit} ${radius.br}${radius.unit} ${radius.bl}${radius.unit}`,
    },
  ];
}

/**
 * `gradient` → `background-image` (SPEC-PROPKIND-V2-DETAILS.md § 6).
 * `angle` assente su `type: 'linear'` ricade sul default implicito 180°
 * (§ 6 punto 2, applicato qui dal renderer, non dal validatore). `position`
 * è ignorato su `type: 'linear'` (nessuna logica cross-campo, § 6 punto 3);
 * su `type: 'radial'` un `position` assente lascia il CSS senza clausola
 * `at <position>` (il default `radial-gradient` senza posizione è già
 * `center` per la specifica CSS).
 */
export function gradientToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
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

/**
 * `background` → `background-color`/`background-image`, scope limitato a
 * `type: 'none' | 'color' | 'gradient'` (ADR-96 § "Decisione" punto 2).
 * `type: 'none'` non emette alcuna dichiarazione. `type: 'color'` riusa
 * `colorRefValueToCss` (stessa conversione di `colorRef`, § 10 punto 5) per
 * produrre `background-color`. `type: 'gradient'` riusa
 * `gradientToDeclarations` (stessa conversione già usata per `kind:
 * 'gradient'`) per produrre `background-image`. `type: 'image' | 'video' |
 * 'slideshow'` restano validi per lo schema ma non emettono alcuna
 * dichiarazione in questo round (nessuna eccezione, branch esplicitamente non
 * implementato — ADR-96 § "Decisione" punto 2, stesso trattamento già
 * riservato da ADR-82 a `link`/`animation`/`motion`).
 */
export function backgroundToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const background = value as unknown as BackgroundValueShape;
  switch (background.type) {
    case 'none':
      return [];
    case 'color':
      if (background.color === undefined) {
        return [];
      }
      return [
        { property: 'background-color', value: colorRefValueToCss(background.color) },
      ];
    case 'gradient':
      if (background.gradient === undefined) {
        return [];
      }
      return gradientToDeclarations(background.gradient);
    default:
      // 'image' | 'video' | 'slideshow': fuori scope ADR-96, nessuna dichiarazione.
      return [];
  }
}

/**
 * `position` → `position` + `top`/`right`/`bottom`/`left` (da `offset`) +
 * `z-index` (SPEC-PROPKIND-V2-DETAILS.md § 7). `type: 'default'` mappa al
 * valore CSS iniziale `static` (nessun keyword `'default'` esiste in CSS).
 * `sticky.edge`/`sticky.offset` emettono la dichiarazione `top`/`bottom`
 * corrispondente solo quando `type: 'sticky'` (§ 7 punto 3: `sticky` presente
 * con `type` diverso non è un errore di validazione, ma qui il renderer lo
 * ignora esplicitamente). `sticky.onBreakpoints`/`sticky.stayInParent` sono
 * comportamento dell'editor/JS a runtime, non hanno una controparte CSS
 * dichiarativa — non emettono dichiarazioni.
 */
export function positionToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
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

/**
 * `transform` → shorthand `transform` (+ `transform-origin`)
 * (SPEC-PROPKIND-V2-DETAILS.md § 8). Ordine di composizione fisso
 * `translate → rotate → scale → skew` (ordine CSS convenzionale, non
 * dichiarato esplicitamente dal documento — interpretazione dichiarata nel
 * resoconto finale). `flipH`/`flipV` si compongono moltiplicando il segno di
 * `scale` sull'asse corrispondente (`scaleX(-1)`/`scaleY(-1)` equivalgono a
 * un fattore -1 sulla funzione `scale()` combinata), evitando due funzioni
 * `scale` separate nello stesso shorthand.
 */
export function transformToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const transform = value as unknown as TransformValueShape;
  const parts: string[] = [];
  if (transform.translateX || transform.translateY) {
    const tx = transform.translateX ? unitValueToCss(transform.translateX) : '0';
    const ty = transform.translateY ? unitValueToCss(transform.translateY) : '0';
    parts.push(`translate(${tx}, ${ty})`);
  }
  if (typeof transform.rotate === 'number') {
    parts.push(`rotate(${transform.rotate}deg)`);
  }
  const baseScale = typeof transform.scale === 'number' ? transform.scale : 1;
  const scaleX = transform.flipH ? -baseScale : baseScale;
  const scaleY = transform.flipV ? -baseScale : baseScale;
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${scaleX}, ${scaleY})`);
  }
  if (typeof transform.skewX === 'number') {
    parts.push(`skewX(${transform.skewX}deg)`);
  }
  if (typeof transform.skewY === 'number') {
    parts.push(`skewY(${transform.skewY}deg)`);
  }
  const declarations: CssDeclaration[] = [];
  if (parts.length > 0) {
    declarations.push({ property: 'transform', value: parts.join(' ') });
  }
  if (transform.origin) {
    declarations.push({ property: 'transform-origin', value: transform.origin });
  }
  return declarations;
}

/**
 * `filter` → shorthand `filter` (+ `mix-blend-mode` per `blend`)
 * (SPEC-PROPKIND-V2-DETAILS.md § 9). Ordine di composizione fisso
 * `blur → brightness → contrast → saturate → hue-rotate → grayscale` (stesso
 * ordine dichiarato nell'interfaccia `FilterValue` del documento).
 */
export function filterToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const filter = value as unknown as FilterValueShape;
  const parts: string[] = [];
  if (typeof filter.blur === 'number') parts.push(`blur(${filter.blur}px)`);
  if (typeof filter.brightness === 'number') parts.push(`brightness(${filter.brightness}%)`);
  if (typeof filter.contrast === 'number') parts.push(`contrast(${filter.contrast}%)`);
  if (typeof filter.saturate === 'number') parts.push(`saturate(${filter.saturate}%)`);
  if (typeof filter.hue === 'number') parts.push(`hue-rotate(${filter.hue}deg)`);
  if (typeof filter.grayscale === 'number') parts.push(`grayscale(${filter.grayscale}%)`);
  const declarations: CssDeclaration[] = [];
  if (parts.length > 0) {
    declarations.push({ property: 'filter', value: parts.join(' ') });
  }
  if (filter.blend) {
    declarations.push({ property: 'mix-blend-mode', value: filter.blend });
  }
  return declarations;
}

/** Converte una singola `GridTrackValue` in un token CSS (`auto`, o `${value}${unit}`). */
function gridTrackToCss(track: GridTrackShape): string {
  return track === 'auto' ? 'auto' : `${track.value}${track.unit}`;
}

/**
 * Converte `layout.gridTemplateColumns`/`gridTemplateRows` in un valore CSS
 * (ADR-82 § "Decisione" punto 1, terzo bullet): `{preset:'repeat', count}` →
 * `repeat(<count>, 1fr)`; array di `GridTrackValue` → stringa spazio-separata.
 */
export function gridTemplateToCss(template: GridTemplateValueShape): string {
  if (!Array.isArray(template)) {
    return `repeat(${template.count}, 1fr)`;
  }
  return template.map(gridTrackToCss).join(' ');
}

/**
 * `layout` → `display` + le proprietà Flexbox o Grid corrispondenti
 * (ADR-82 § "Decisione" punto 1, § "Conseguenze": "invece delle proprietà
 * flex quando `display==='grid'`"). `display` assente ricade su `'flex'`
 * (default dello schema, `container.block.ts`). `gap` emette sempre
 * `column-gap`/`row-gap` (proprietà valide sia per Flexbox sia per Grid),
 * indipendentemente dal `display` scelto.
 */
export function layoutToDeclarations(value: unknown): CssDeclaration[] {
  if (!isPlainObject(value)) {
    return [];
  }
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
    if (layout.autoFlow) {
      declarations.push({ property: 'grid-auto-flow', value: layout.autoFlow });
    }
    if (layout.justifyItems) {
      declarations.push({ property: 'justify-items', value: layout.justifyItems });
    }
    if (layout.alignItems) {
      declarations.push({ property: 'align-items', value: layout.alignItems });
    }
  } else {
    if (layout.direction) {
      declarations.push({ property: 'flex-direction', value: layout.direction });
    }
    if (layout.wrap) {
      declarations.push({ property: 'flex-wrap', value: layout.wrap });
    }
    if (layout.justify) {
      declarations.push({ property: 'justify-content', value: layout.justify });
    }
    if (layout.align) {
      declarations.push({ property: 'align-items', value: layout.align });
    }
  }

  if (layout.gap) {
    declarations.push({ property: 'column-gap', value: unitValueToCss(layout.gap.x) });
    declarations.push({ property: 'row-gap', value: unitValueToCss(layout.gap.y) });
  }

  return declarations;
}

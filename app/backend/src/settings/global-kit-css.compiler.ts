import {
  CustomFontEntryDto,
  GlobalColorEntryDto,
  GlobalFontEntryDto,
  GlobalKitDto,
  ThemeStyleDto,
} from './dto/global-kit.dto';

/**
 * Compilatore `global-kit.css` (`docs/ai/specs/SPEC-GLOBAL-KIT.md` § 3,
 * `ADR-77-global-kit-schema.md` § "Decisione" punto 3). **Funzione pura**:
 * nessun accesso a DB/storage — riceve `GlobalKitValue` già letto dal
 * chiamante (`SettingsService`), riusa CSS custom property per ogni
 * riferimento (mai un valore letterale duplicato quando la sorgente è un
 * `{ ref }`), stesso principio di `toCss()` (`app/backend/src/blocks/compiler/`).
 *
 * Il path dei media `customFonts[].files[].woff2` è per **convenzione**
 * (`/assets/media/<guid>.woff2`, stesso schema di
 * `ExportProcessor.resolveRelativeMediaPath`): questo modulo non risolve il
 * `mediaRef` contro il DB (non è raster, `PublicMediaService.serve()` non lo
 * riconoscerebbe — verifica/copia del blob resta un lavoro di pipeline export
 * futuro, ADR-77 § "Conseguenze": "job di rigenerazione... rinviato al round
 * che la consuma", PLAN R8). Un `@font-face` con un `mediaRef` mai caricato
 * produce un URL 404 lato edge, mai un errore di compilazione qui — stesso
 * principio "fallback/degradazione, mai crash" già in vigore per `colorRef`/
 * `fontRef` non risolvibili (ADR-77 § "Conformità").
 */

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sfugge il carattere `"` per l'uso dentro un valore CSS quotato (nome famiglia font). */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * `ColorRefValue`: hex letterale → emesso così com'è; `{ ref }` → variabile
 * gk (`SPEC-GLOBAL-KIT.md` § 3 "mai un valore letterale duplicato").
 */
function formatColorRefValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isPlainRecord(value) && typeof value.ref === 'string') {
    return `var(--gk-color-${value.ref})`;
  }
  return undefined;
}

/** `FontRefValue`: `{ ref }` → variabile gk; `{ family, source }` → nome famiglia quotato. */
function formatFontFamilyValue(value: unknown): string | undefined {
  if (!isPlainRecord(value)) return undefined;
  if (typeof value.ref === 'string') return `var(--gk-font-${value.ref}-family)`;
  if (typeof value.family === 'string') return `"${escapeCssString(value.family)}"`;
  return undefined;
}

/** `UnitValue` (`{ value, unit }`) → stringa CSS (`'16px'`). */
function formatUnitValue(value: unknown): string | undefined {
  if (isPlainRecord(value) && typeof value.value === 'number' && typeof value.unit === 'string') {
    return `${value.value}${value.unit}`;
  }
  return undefined;
}

interface CssDecl {
  property: string;
  value: string;
}

/**
 * `TypographyValue` → dichiarazioni CSS letterali (§ 3 punto 3, regole di
 * `themeStyle`): a differenza di `toCss()` (props di blocco, responsive/
 * stateful), il `TypographyValue` dentro `themeStyle`/`fonts[]` è sempre "nudo"
 * (ADR-77, "senza modificatori stateful/responsive qui").
 */
function typographyToCssDeclarations(typography: unknown): CssDecl[] {
  if (!isPlainRecord(typography)) return [];
  const decls: CssDecl[] = [];
  const fontFamily = formatFontFamilyValue(typography.fontFamily);
  if (fontFamily) decls.push({ property: 'font-family', value: fontFamily });
  const fontSize = formatUnitValue(typography.fontSize);
  if (fontSize) decls.push({ property: 'font-size', value: fontSize });
  if (typeof typography.fontWeight === 'string') {
    decls.push({ property: 'font-weight', value: typography.fontWeight });
  }
  if (typeof typography.textTransform === 'string') {
    decls.push({ property: 'text-transform', value: typography.textTransform });
  }
  if (typeof typography.fontStyle === 'string') {
    decls.push({ property: 'font-style', value: typography.fontStyle });
  }
  if (typeof typography.textDecoration === 'string') {
    decls.push({ property: 'text-decoration', value: typography.textDecoration });
  }
  const lineHeight = formatUnitValue(typography.lineHeight);
  if (lineHeight) decls.push({ property: 'line-height', value: lineHeight });
  const letterSpacing = formatUnitValue(typography.letterSpacing);
  if (letterSpacing) decls.push({ property: 'letter-spacing', value: letterSpacing });
  const wordSpacing = formatUnitValue(typography.wordSpacing);
  if (wordSpacing) decls.push({ property: 'word-spacing', value: wordSpacing });
  return decls;
}

function renderRule(selector: string, decls: CssDecl[]): string {
  if (decls.length === 0) return '';
  const body = decls.map((d) => `  ${d.property}: ${d.value};`).join('\n');
  return `${selector} {\n${body}\n}\n`;
}

/** `--gk-color-<id>` per ogni entry di `colors[]` (system e custom, stesso ciclo — § 3 punto 2). */
function colorRootDeclarations(colors: GlobalColorEntryDto[]): CssDecl[] {
  return colors
    .filter((entry): entry is GlobalColorEntryDto & { id: string } => typeof entry.id === 'string')
    .map((entry) => ({ property: `--gk-color-${entry.id}`, value: entry.value }));
}

/** `--gk-font-<id>-{family,size,weight,line-height,letter-spacing}` per ogni entry di `fonts[]` (§ 3, tabella naming). */
function fontRootDeclarations(fonts: GlobalFontEntryDto[]): CssDecl[] {
  const decls: CssDecl[] = [];
  for (const entry of fonts) {
    if (typeof entry.id !== 'string') continue;
    const typography = entry.typography as unknown as PlainRecord;
    const family = formatFontFamilyValue(typography?.fontFamily);
    if (family) decls.push({ property: `--gk-font-${entry.id}-family`, value: family });
    const size = formatUnitValue(typography?.fontSize);
    if (size) decls.push({ property: `--gk-font-${entry.id}-size`, value: size });
    if (typeof typography?.fontWeight === 'string') {
      decls.push({ property: `--gk-font-${entry.id}-weight`, value: typography.fontWeight });
    }
    const lineHeight = formatUnitValue(typography?.lineHeight);
    if (lineHeight)
      decls.push({ property: `--gk-font-${entry.id}-line-height`, value: lineHeight });
    const letterSpacing = formatUnitValue(typography?.letterSpacing);
    if (letterSpacing) {
      decls.push({ property: `--gk-font-${entry.id}-letter-spacing`, value: letterSpacing });
    }
  }
  return decls;
}

/** `--gk-layout-*` (§ 3, tabella naming). */
function layoutRootDeclarations(layout: GlobalKitDto['layout']): CssDecl[] {
  const decls: CssDecl[] = [];
  const contentWidth = formatUnitValue(layout.contentWidth);
  if (contentWidth) decls.push({ property: '--gk-layout-content-width', value: contentWidth });
  const widgetSpace = formatUnitValue(layout.widgetSpace);
  if (widgetSpace) decls.push({ property: '--gk-layout-widget-space', value: widgetSpace });
  const padding = layout.defaultContainerPadding;
  if (padding) {
    const unit = padding.unit;
    decls.push(
      { property: '--gk-layout-container-padding-top', value: `${padding.top}${unit}` },
      { property: '--gk-layout-container-padding-right', value: `${padding.right}${unit}` },
      { property: '--gk-layout-container-padding-bottom', value: `${padding.bottom}${unit}` },
      { property: '--gk-layout-container-padding-left', value: `${padding.left}${unit}` },
    );
  }
  return decls;
}

/** `--gk-lightbox-{bg,ui}` (§ 3, tabella naming). */
function lightboxRootDeclarations(lightbox: GlobalKitDto['lightbox']): CssDecl[] {
  const decls: CssDecl[] = [];
  const bg = formatColorRefValue(lightbox.bgColor);
  if (bg) decls.push({ property: '--gk-lightbox-bg', value: bg });
  const ui = formatColorRefValue(lightbox.uiColor);
  if (ui) decls.push({ property: '--gk-lightbox-ui', value: ui });
  return decls;
}

/** Dichiarazioni border/radius (forma comune usata da `button`/`image`/`formFields`). */
function borderDeclarations(border: unknown): CssDecl[] {
  if (!isPlainRecord(border)) return [];
  const decls: CssDecl[] = [];
  if (typeof border.width === 'number')
    decls.push({ property: 'border-width', value: `${border.width}px` });
  if (typeof border.style === 'string')
    decls.push({ property: 'border-style', value: border.style });
  const color = formatColorRefValue(border.color);
  if (color) decls.push({ property: 'border-color', value: color });
  return decls;
}

function radiusDeclarations(radius: unknown): CssDecl[] {
  if (!isPlainRecord(radius)) return [];
  const { tl, tr, br, bl, unit } = radius;
  if (
    typeof tl !== 'number' ||
    typeof tr !== 'number' ||
    typeof br !== 'number' ||
    typeof bl !== 'number' ||
    typeof unit !== 'string'
  ) {
    return [];
  }
  return [
    { property: 'border-radius', value: `${tl}${unit} ${tr}${unit} ${br}${unit} ${bl}${unit}` },
  ];
}

function shadowDeclarations(shadow: unknown): CssDecl[] {
  if (!isPlainRecord(shadow)) return [];
  const { x, y, blur, spread, color } = shadow;
  const colorValue = formatColorRefValue(color);
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof blur !== 'number' ||
    typeof spread !== 'number' ||
    !colorValue
  ) {
    return [];
  }
  return [{ property: 'box-shadow', value: `${x}px ${y}px ${blur}px ${spread}px ${colorValue}` }];
}

/** Regole generiche di `themeStyle` (§ 3 punto 3): un blocco `normal`, `:hover` separato per gli stati stateful. */
function themeStyleRules(themeStyle: ThemeStyleDto): string {
  let css = '';

  if (themeStyle.body) {
    const decls = [
      ...typographyToCssDeclarations(themeStyle.body.typography),
      ...(formatColorRefValue(themeStyle.body.color)
        ? [{ property: 'color', value: formatColorRefValue(themeStyle.body.color)! }]
        : []),
      ...(formatColorRefValue(themeStyle.body.background)
        ? [
            {
              property: 'background-color',
              value: formatColorRefValue(themeStyle.body.background)!,
            },
          ]
        : []),
    ];
    css += renderRule('body', decls);
  }

  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const element = themeStyle[level];
    if (!element) continue;
    const decls = [
      ...typographyToCssDeclarations(element.typography),
      ...(formatColorRefValue(element.color)
        ? [{ property: 'color', value: formatColorRefValue(element.color)! }]
        : []),
    ];
    css += renderRule(level, decls);
  }

  if (themeStyle.link) {
    const normal = formatColorRefValue(themeStyle.link.color?.normal);
    if (normal) css += renderRule('a', [{ property: 'color', value: normal }]);
    const hover = formatColorRefValue(themeStyle.link.color?.hover);
    if (hover) css += renderRule('a:hover', [{ property: 'color', value: hover }]);
  }

  if (themeStyle.button) {
    const b = themeStyle.button;
    const normalDecls = [
      ...typographyToCssDeclarations(b.typography),
      ...borderDeclarations(b.border),
      ...radiusDeclarations(b.radius),
    ];
    const normalBg = formatColorRefValue(b.background?.normal);
    if (normalBg) normalDecls.push({ property: 'background-color', value: normalBg });
    const normalColor = formatColorRefValue(b.color?.normal);
    if (normalColor) normalDecls.push({ property: 'color', value: normalColor });
    css += renderRule('button, .cms-button', normalDecls);

    const hoverDecls: CssDecl[] = [];
    const hoverBg = formatColorRefValue(b.background?.hover);
    if (hoverBg) hoverDecls.push({ property: 'background-color', value: hoverBg });
    const hoverColor = formatColorRefValue(b.color?.hover);
    if (hoverColor) hoverDecls.push({ property: 'color', value: hoverColor });
    css += renderRule('button:hover, .cms-button:hover', hoverDecls);
  }

  if (themeStyle.image) {
    const decls = [
      ...borderDeclarations(themeStyle.image.border),
      ...radiusDeclarations(themeStyle.image.radius),
      ...shadowDeclarations(themeStyle.image.shadow),
    ];
    css += renderRule('img', decls);
  }

  if (themeStyle.formFields) {
    const f = themeStyle.formFields;
    const decls = [...borderDeclarations(f.border), ...radiusDeclarations(f.radius)];
    const color = formatColorRefValue(f.color);
    if (color) decls.push({ property: 'color', value: color });
    const background = formatColorRefValue(f.background);
    if (background) decls.push({ property: 'background-color', value: background });
    css += renderRule('input, textarea, select', decls);
  }

  return css;
}

/**
 * `@font-face` per `customFonts[]` (§ 3 punto 4): un blocco per peso
 * dichiarato in `weights`, stesso ordine di `files`. Path per convenzione
 * (`/assets/media/<guid>.woff2`, vedi nota di modulo).
 */
function customFontFaces(customFonts: CustomFontEntryDto[]): string {
  let css = '';
  for (const entry of customFonts) {
    entry.weights.forEach((weight, index) => {
      const file = entry.files[index];
      if (!file) return;
      css += `@font-face {\n  font-family: "${escapeCssString(entry.family)}";\n  font-weight: ${weight};\n  src: url('/assets/media/${file.woff2}.woff2') format('woff2');\n}\n`;
    });
  }
  return css;
}

/**
 * Compila l'intero `global_kit` in CSS (`SPEC-GLOBAL-KIT.md` § 3, algoritmo
 * punti 1-5; punto 6, scrittura file con fingerprint, è responsabilità del
 * chiamante — questa funzione resta pura, nessun I/O).
 */
export function compileGlobalKitCss(kit: GlobalKitDto): string {
  const rootDecls = [
    ...colorRootDeclarations(kit.colors),
    ...fontRootDeclarations(kit.fonts),
    ...layoutRootDeclarations(kit.layout),
    ...lightboxRootDeclarations(kit.lightbox),
  ];

  let css = renderRule(':root', rootDecls);
  css += themeStyleRules(kit.themeStyle);
  css += customFontFaces(kit.customFonts);
  return css;
}

import { Logger } from '@nestjs/common';

/**
 * Helper condivisi dalle funzioni di migrazione di questo round (ADR-81
 * "Migrazione PropKind v1→v2 per i widget legacy", ADR-82 "Container
 * unificato", Sub-Task S1.4). Ogni funzione qui è pura e totale (ADR-21 §
 * 3.6): nessun I/O, nessuna eccezione, tratta ogni input come possibilmente
 * assente o malformato.
 *
 * **Nota sul meccanismo di "warning"**: ADR-81 § "Decisione" punto 2 (riga
 * `styleMargin*`) e § "Alternative valutate" richiedono un `warning` nel
 * `MigrationResult` per il caso "margini a unità miste". Il motore di
 * migrazione esistente (`blocks/migration/block-migration.types.ts`,
 * `block-migration-result.types.ts`) **non espone alcun canale per
 * propagare un warning strutturato**: `BlockPropsMigrationStep` è
 * `(props) => props`, una funzione pura a singolo valore di ritorno, e
 * `BlockTreeMigrationResult`/`BlockMigrationError` coprono solo
 * `BLOCK_VERSION_UNSUPPORTED`. Estendere quei tipi è fuori dal perimetro di
 * questo Sub-Task (non richiesto esplicitamente, e toccherebbe ~10 call site
 * di produzione più il motore condiviso). La scelta di design qui è quindi
 * di **loggare** il caso con `Logger.warn` (convenzione di progetto,
 * `CLAUDE.md`: `new Logger(NomeService.name)` — qui un contesto stringa,
 * dato che le funzioni di migrazione sono pure, non servizi NestJS iniettati)
 * mentre il valore di ritorno applica comunque il default sicuro dichiarato
 * da ADR-21 § 3.6 ("default + warning, mai un valore inventato
 * silenziosamente, mai un'eccezione"). Segnalato come scelta esplicita nel
 * resoconto finale del Sub-Task.
 */

/**
 * Copia superficiale di `props` priva delle chiavi elencate — usata da ogni
 * funzione di migrazione per costruire il nodo v2 senza le chiavi v1
 * sostituite (ADR-81 § "Decisione" punto 3: "le prop v1 elencate spariscono
 * dal registro v2"), senza ricorrere a binding di destrutturazione
 * inutilizzati (che il linter del progetto segnalerebbe).
 */
export function omit(
  props: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...props };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/** Vero se `value` è un oggetto piano (non `null`, non array) — stessa guardia usata nel validatore/compilatore. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Forma di un `UnitValue` v1 (`{ value: number; unit: string }`) — verifica difensiva, nessuna assunzione sull'unità. */
export interface UnitValueLike {
  value: number;
  unit: string;
}

/** Vero se `value` ha la forma di `UnitValueLike` (`value` numerico, `unit` stringa). */
export function isUnitValueLike(value: unknown): value is UnitValueLike {
  return isPlainObject(value) && typeof value.value === 'number' && typeof value.unit === 'string';
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Applica `mapValue` a un inviluppo responsive v1 (`{ default, tablet?,
 * mobile?, ... }`, ADR-29), preservando qualunque chiave di breakpoint
 * presente (difensivo verso l'estensione a 7 chiavi di ADR-76, non solo le 3
 * storiche). Un valore non-oggetto (scalare legacy malformato) è trattato
 * come il solo ramo `default`; `default` mancante nell'oggetto è comunque
 * garantita in output (`mapValue(undefined)`, che ogni mappatore tratta come
 * "assente" col proprio fallback).
 */
export function mapResponsiveEnvelope(
  raw: unknown,
  mapValue: (value: unknown) => unknown,
): Record<string, unknown> {
  if (isPlainObject(raw)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[key] = mapValue(value);
    }
    if (!Object.prototype.hasOwnProperty.call(result, 'default')) {
      result.default = mapValue(undefined);
    }
    return result;
  }
  return { default: mapValue(raw) };
}

/** Legge il ramo `default` di un inviluppo responsive v1, o il valore stesso se non è un inviluppo (difensivo). */
export function responsiveEnvelopeDefault(raw: unknown): unknown {
  if (isPlainObject(raw)) return raw.default;
  return raw;
}

/** Legge un ramo di breakpoint specifico di un inviluppo responsive v1, `undefined` se assente. */
export function responsiveEnvelopeBranch(raw: unknown, breakpoint: string): unknown {
  if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, breakpoint)) {
    return raw[breakpoint];
  }
  return undefined;
}

/** Unione (senza `'default'`) delle chiavi di breakpoint presenti in uno o più inviluppi responsive v1. */
export function collectResponsiveBreakpointKeys(...envelopes: unknown[]): string[] {
  const keys = new Set<string>();
  for (const envelope of envelopes) {
    if (isPlainObject(envelope)) {
      for (const key of Object.keys(envelope)) keys.add(key);
    }
  }
  keys.delete('default');
  return [...keys];
}

// ─── `color: colorRef` da `styleTextColor`(+`Custom`) — ADR-81 § "Decisione" punto 2 ───

function mapTextColorTokenValue(token: unknown): unknown {
  switch (token) {
    case 'accent':
      return { ref: 'accent' };
    case 'muted':
      return '#6b7280';
    case 'inverse':
      return '#ffffff';
    case 'default':
    default:
      return { ref: 'text' };
  }
}

/**
 * Migra `styleTextColor`(+`styleTextColorCustom`) → `color: colorRef`
 * (ADR-81 § "Decisione" punto 2, riga `styleTextColor`). `styleTextColorCustom`
 * ha priorità (stessa priorità già dichiarata nell'`help` dell'inspector v1):
 * se presente e valido, l'intero valore migrato è il singolo ramo `{default:
 * <hex>}` (il custom non era mai responsive in v1). Altrimenti la
 * responsività del token è preservata ramo per ramo.
 */
export function migrateTextColorProp(
  rawToken: unknown,
  rawCustom: unknown,
): Record<string, unknown> {
  if (typeof rawCustom === 'string' && HEX_COLOR_PATTERN.test(rawCustom)) {
    return { default: rawCustom };
  }
  return mapResponsiveEnvelope(rawToken, mapTextColorTokenValue);
}

// ─── `typography` da `styleFontSize/Weight/Family`(+`Custom`) — ADR-81 § "Decisione" punto 2 ───

const FONT_SIZE_TOKEN_TO_PX: Record<string, number> = { sm: 14, md: 16, lg: 20, xl: 28 };
const FONT_WEIGHT_TOKEN_TO_CSS: Record<string, string> = {
  regular: '400',
  medium: '500',
  bold: '700',
};
const SYSTEM_FONT_FAMILY_TOKENS = [
  'default',
  'inter',
  'roboto',
  'playfair',
  'montserrat',
  'monospace',
];

function mapFontSizeTokenValue(token: unknown): Record<string, unknown> {
  const key = typeof token === 'string' && token in FONT_SIZE_TOKEN_TO_PX ? token : 'md';
  return { value: FONT_SIZE_TOKEN_TO_PX[key], unit: 'px' };
}

function mapFontWeightTokenValue(token: unknown): string {
  const key = typeof token === 'string' && token in FONT_WEIGHT_TOKEN_TO_CSS ? token : 'regular';
  return FONT_WEIGHT_TOKEN_TO_CSS[key];
}

function mapFontFamilyTokenValue(token: unknown): Record<string, unknown> {
  const key =
    typeof token === 'string' && SYSTEM_FONT_FAMILY_TOKENS.includes(token) ? token : 'default';
  const family = key === 'default' ? 'inter' : key;
  return { family, source: 'system' };
}

/**
 * Migra `styleFontSize`(+`Custom`)/`styleFontWeight`/`styleFontFamily` →
 * `typography: typography` (ADR-81 § "Decisione" punto 2, riga
 * `styleFontSize/Weight/Family`). `responsive` migra **per campo**
 * (`SPEC-PROPKIND-V2-DETAILS.md` § 3 punto 3): ogni campo porta il proprio
 * inviluppo breakpoint indipendente, mai un unico inviluppo sull'intero
 * oggetto `typography`.
 */
export function migrateTypographyProp(input: {
  fontSize: unknown;
  fontSizeCustom: unknown;
  fontWeight: unknown;
  fontFamily: unknown;
}): Record<string, unknown> {
  const fontSizeEnvelope = isUnitValueLike(input.fontSizeCustom)
    ? { default: { value: input.fontSizeCustom.value, unit: input.fontSizeCustom.unit } }
    : mapResponsiveEnvelope(input.fontSize, mapFontSizeTokenValue);
  return {
    fontSize: fontSizeEnvelope,
    fontWeight: mapResponsiveEnvelope(input.fontWeight, mapFontWeightTokenValue),
    fontFamily: mapResponsiveEnvelope(input.fontFamily, mapFontFamilyTokenValue),
  };
}

// ─── `hideOn` da `styleHideDesktop/Tablet/Mobile` — ADR-81 § "Decisione" punto 2 ───

/** Migra i tre booleani `styleHideDesktop`/`Tablet`/`Mobile` → `hideOn: BreakpointKey[]` (ADR-81 § "Decisione" punto 2). */
export function migrateHideFlagsToHideOn(props: Record<string, unknown>): string[] {
  const result: string[] = [];
  if (props.styleHideDesktop === true) result.push('default');
  if (props.styleHideTablet === true) result.push('tablet');
  if (props.styleHideMobile === true) result.push('mobile');
  return result;
}

// ─── `margin`/`padding: spacing` a 4 lati indipendenti (unitValue) — ADR-81 § "Decisione" punto 2 ───

const SPACING_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Migra quattro prop `unitValue` indipendenti (`styleMarginTop`/`Right`/
 * `Bottom`/`Left`, `heading`/`richText`/`image`/`button`) → un solo
 * `spacing` a lato unico (ADR-81 § "Decisione" punto 2, riga `styleMargin*`).
 * Unità condivisa fra i lati: se i quattro lati non condividono lo stesso
 * `unit`, forza `unit: 'px'`, converte 1:1 i lati già in `px`, azzera i lati
 * in un'altra unità (default dichiarato dallo schema di arrivo) — e registra
 * un `warning` (vedi nota di modulo sul meccanismo di logging).
 *
 * `margin`/`padding` dichiarano `responsive: true` in ogni `BlockDefinition`
 * di questo round (ADR-29 § 2): il valore è quindi sempre restituito già
 * avvolto nel ramo `{ default: <SpacingValue> }` — un `SpacingValue` v1 non
 * aveva mai breakpoint diversi da un solo valore scalare per lato, quindi
 * nessun ramo `tablet`/`mobile` da migrare qui (comportamento invariato,
 * ADR-29 § 5: una responsività aggiunta ex-novo non richiede migrazione).
 */
export function migrateFourSidedUnitValueSpacing(
  props: Record<string, unknown>,
  keys: { top: string; right: string; bottom: string; left: string },
  loggerContext: string,
): Record<string, unknown> {
  const raw: Record<(typeof SPACING_SIDES)[number], UnitValueLike | undefined> = {
    top: isUnitValueLike(props[keys.top]) ? (props[keys.top] as UnitValueLike) : undefined,
    right: isUnitValueLike(props[keys.right]) ? (props[keys.right] as UnitValueLike) : undefined,
    bottom: isUnitValueLike(props[keys.bottom]) ? (props[keys.bottom] as UnitValueLike) : undefined,
    left: isUnitValueLike(props[keys.left]) ? (props[keys.left] as UnitValueLike) : undefined,
  };
  const presentUnits = SPACING_SIDES.map((side) => raw[side]?.unit).filter(
    (unit): unit is string => unit !== undefined,
  );
  const distinctUnits = new Set(presentUnits);

  if (distinctUnits.size <= 1) {
    const unit = presentUnits[0] ?? 'px';
    const values = SPACING_SIDES.map((side) => raw[side]?.value ?? 0);
    return {
      default: {
        top: values[0],
        right: values[1],
        bottom: values[2],
        left: values[3],
        unit,
        linked: values.every((value) => value === values[0]),
      },
    };
  }

  Logger.warn(
    'Margini/padding v1 con unità miste rilevati in migrazione: forzata unit:"px", lati con unità diversa da "px" azzerati (default dello schema di arrivo).',
    loggerContext,
  );
  const pxValues = SPACING_SIDES.map((side) => {
    const side_ = raw[side];
    if (!side_) return 0;
    return side_.unit === 'px' ? side_.value : 0;
  });
  return {
    default: {
      top: pxValues[0],
      right: pxValues[1],
      bottom: pxValues[2],
      left: pxValues[3],
      unit: 'px',
      linked: pxValues.every((value) => value === pxValues[0]),
    },
  };
}

// ─── `padding`/`margin: spacing` da token enum a 4 lati (`container`/`section`) ───

/** Tabella token → px comune a `stylePadding*`/`styleMargin*` enum di `container`/`section` v1. */
const SPACING_TOKEN_TO_PX: Record<string, number> = {
  '0': 0,
  '4': 4,
  '8': 8,
  '12': 12,
  '16': 16,
  '24': 24,
  '32': 32,
  '48': 48,
  '64': 64,
  '96': 96,
};

/**
 * Migra quattro prop `enum` indipendenti a token fisso (`stylePaddingTop`/
 * `Right`/`Bottom`/`Left` o `styleMarginTop`/`Right`/`Bottom`/`Left`,
 * `container`/`section` v1) → un solo `spacing` in `px` (ADR-82 § "Decisione"
 * punto 4, stessa tabella di `SPACING_TOKEN_TO_PX`). Un token mancante o
 * fuori tabella vale `0` (default dello schema di arrivo) — mai un'eccezione.
 *
 * `padding`/`margin` dichiarano `responsive: true` su `container` v2: il
 * valore è restituito già avvolto nel ramo `{ default: <SpacingValue> }`
 * (stesso principio di `migrateFourSidedUnitValueSpacing` sopra).
 */
export function migrateFourSidedEnumTokenSpacing(
  props: Record<string, unknown>,
  keys: { top: string; right: string; bottom: string; left: string },
): Record<string, unknown> {
  const values = SPACING_SIDES.map((side) => {
    const token = props[keys[side]];
    return typeof token === 'string' && token in SPACING_TOKEN_TO_PX
      ? SPACING_TOKEN_TO_PX[token]
      : 0;
  });
  return {
    default: {
      top: values[0],
      right: values[1],
      bottom: values[2],
      left: values[3],
      unit: 'px',
      linked: values.every((value) => value === values[0]),
    },
  };
}

// ─── gap `container`/`section` (token → `{x,y}` UnitValue) — ADR-82 § "Decisione" punto 4 ───

/** Tabella gap token → px scelta per questo Sub-Task (nessun valore dichiarato da ADR-82 oltre "scegli una tabella ragionevole"): `none:0, sm:8, md:16, lg:32`. */
const GAP_TOKEN_TO_PX: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 32 };

/** Mappa un token `gap` v1 (`none|sm|md|lg`) al valore `layout.gap` v2 (`{x,y}` UnitValue in px, stesso valore su entrambi gli assi). */
export function mapGapTokenToLayoutGap(token: unknown): Record<string, unknown> {
  const key = typeof token === 'string' && token in GAP_TOKEN_TO_PX ? token : 'none';
  const px = { value: GAP_TOKEN_TO_PX[key], unit: 'px' };
  return { x: px, y: px };
}

// ─── Inviluppo `stateful` (ADR-75 § "Decisione" punto 1) per prop migrate verso un `kind` `stateful: true` ───

/**
 * Avvolge un valore già migrato (es. l'inviluppo `responsive` prodotto da
 * `migrateTextColorProp`/`migrateTypographyProp`) nell'inviluppo `stateful`
 * di ADR-75 § "Decisione" punto 1 (`{ normal: <valore>, hover?: ... }`):
 * necessario ogni volta che lo schema di arrivo dichiara `stateful: true`
 * sulla prop migrata (`heading`/`richText`/`button`.`color`/`typography`,
 * ADR-81 § "Conseguenze": "`color` su `button`/`heading`/`richText`... la
 * migrazione non popola mai un ramo `hover`") — il validatore richiede
 * comunque la forma `{ normal, ... }` quando `spec.stateful` è `true`,
 * indipendentemente dal fatto che esista un valore Hover da cui derivarlo.
 */
export function wrapAsStatefulNormal(value: unknown): Record<string, unknown> {
  return { normal: value };
}

// ─── `link` da `href` (`button`) — ADR-81 § "Decisione" punto 2, riga `href` ───

const ABSOLUTE_URL_PATTERN = /^https?:\/\/.+/i;
const MAILTO_URL_PATTERN = /^mailto:.+/i;
const ROOT_RELATIVE_URL_PATTERN = /^\/(?!\/).*/;

function isSafeMigratedUrl(value: string): boolean {
  return (
    ABSOLUTE_URL_PATTERN.test(value) ||
    MAILTO_URL_PATTERN.test(value) ||
    ROOT_RELATIVE_URL_PATTERN.test(value)
  );
}

/**
 * Migra `href: url` → `link: link` (ADR-81 § "Decisione" punto 2, riga
 * `href`, `button`): `{ href: <valore invariato>, target: '_self', rel: [] }`
 * — nessun campo v1 da cui derivare `target`/`rel`, default dello schema di
 * arrivo. Un `href` assente o fuori forma migra al default sicuro `'/'`
 * (radice del sito), mai un valore che farebbe fallire la validazione a
 * valle.
 */
export function migrateHrefToLink(props: Record<string, unknown>): Record<string, unknown> {
  const href = props.href;
  const safeHref = typeof href === 'string' && isSafeMigratedUrl(href) ? href : '/';
  return { href: safeHref, target: '_self', rel: [] };
}

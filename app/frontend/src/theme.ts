/**
 * Tema Mantine dello Starter Kit + modello dati del Global Theme Customizer
 * (ADR-4, esteso a versione 7).
 *
 * Il tema personalizzabile è un singolo oggetto `ThemeConfig` versionato
 * (`version: 7`) che copre l'intera superficie del theme object Mantine usata
 * dal progetto: 9 colori semantici (Primary/Secondary/Accent/Success/Warning/
 * Alert/Error/Danger/Info, ciascuno un hex base da cui si generano 10
 * sfumature registrate come vere palette Mantine), `primaryShade`, tipografia
 * (font stack whitelisted, dimensioni, interlinee, titoli h1–h6), scale di
 * spaziatura/radius, ombre strutturate, opzioni di comportamento (focus ring,
 * cursore, riduzione movimento, contrasto automatico, scala UI, gradiente di
 * default), larghezza, stato di default (aperta/chiusa) e stile del bordo
 * destro (bordo sottile o ombra proiettata) della sidebar applicativa
 * (`navbarWidth`, `navbarDefaultCollapsed`, `navbarEdgeStyle`,
 * `navbarEdgeShadowIntensity`), default per i componenti Mantine usati nel
 * progetto (`theme.components` → `defaultProps`) e, per ogni scheme, 17 token
 * colore: gli 11 storici + un colore per singolo livello di titolo
 * (`headingH1`–`headingH6`), consumati da una foglia di regole CSS globali
 * (`styles/headings.css`) perché `theme.headings` di Mantine non espone un
 * colore per-livello. Dalla v7, ogni campo dimensionale (dimensioni testo e
 * titoli, spaziatura, radius token, ombre, larghezza navbar) porta anche
 * un'unità CSS scelta dall'admin (`px`/`em`/`rem`/`%`, `%` escluso dove il CSS
 * non lo ammette — vedi `THEME_LENGTH_UNITS`).
 *
 * La chiave del tema per il colore `primary` resta `starterPrimary` (non
 * `'primary'`) per compatibilità con i riferimenti già presenti in
 * `LayoutProtected.tsx`, `PageProfile.tsx`, `PageUsers.tsx`,
 * `PageHeader.module.css` ecc.: cambia solo il *valore* della tupla assegnata
 * a `starterPrimary`, mai la chiave. Gli altri 8 colori semantici sono
 * registrati in `theme.colors` col proprio nome (`secondary`, `accent`, …).
 *
 * Sicurezza (ADR-4 §3): nessuna stringa libera raggiunge mai CSS o theme
 * object. I colori sono hex `#rrggbb` validati, i font sono ID di una
 * whitelist client-side (gli stack CSS vivono solo in questo file), le misure
 * sono numeri con range chiusi e le ombre sono spec strutturate da cui la
 * stringa CSS è generata qui. I token per-scheme (17 colori `light`/`dark`)
 * sono applicati come variabili `--app-*` tramite `buildCssVariablesResolver()`
 * (API ufficiale `cssVariablesResolver` — nessuna iniezione manuale di stili).
 * Con i default di fabbrica attivi l'app resta pixel-identical: gli override
 * sono emessi solo per i valori diversi dal default.
 */

import {
  createTheme,
  DEFAULT_THEME,
  rem,
  type CSSVariablesResolver,
  type MantineColorShade,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core';

/** Le 14 palette native incluse in Mantine v7 (nessuna palette custom). */
export const MANTINE_PRIMARY_COLORS = [
  'blue',
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'dark',
] as const;

export type MantinePrimaryColor = (typeof MANTINE_PRIMARY_COLORS)[number];

/**
 * Selezione del primario: una delle 14 palette native oppure `'custom'`,
 * che attiva la tupla `customPrimary` (10 sfumature hex) del `ThemeConfig`.
 */
export const THEME_PRIMARY_SELECTIONS = [...MANTINE_PRIMARY_COLORS, 'custom'] as const;

export type ThemePrimarySelection = (typeof THEME_PRIMARY_SELECTIONS)[number];

/** Colore primario di default: palette nativa Mantine, nessun override aziendale. */
export const DEFAULT_PRIMARY_COLOR: MantinePrimaryColor = 'blue';

/**
 * Le 9 voci semantiche del tema (v6): ciascuna è un hex base da cui
 * `generatePrimaryShades()` genera 10 sfumature registrate in `theme.colors`
 * come palette Mantine reale (utilizzabile ovunque, es. `color="success"`).
 * `primary` resta agganciata alla chiave storica `starterPrimary` in
 * `buildAppTheme()` per compatibilità con i riferimenti già presenti nel
 * progetto (vedi commento in testa al file).
 */
export const THEME_SEMANTIC_COLOR_NAMES = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'alert',
  'error',
  'danger',
  'info',
] as const;

export type ThemeSemanticColorName = (typeof THEME_SEMANTIC_COLOR_NAMES)[number];

/** Un hex `#rrggbb` base per ciascuna delle 9 voci semantiche. */
export type ThemeColors = Record<ThemeSemanticColorName, string>;

/** I 5 size token nativi Mantine, usati da tutte le scale (`xs`–`xl`). */
export const THEME_SIZE_VALUES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type ThemeSizeValue = (typeof THEME_SIZE_VALUES)[number];

/** Valori `radius` nativi Mantine ammessi come `defaultRadius` (ADR-4 §1). */
export const THEME_RADIUS_VALUES = THEME_SIZE_VALUES;

export type ThemeRadiusValue = ThemeSizeValue;

/** Radius di default: il valore usato dall'app prima del customizer. */
export const DEFAULT_RADIUS: ThemeRadiusValue = 'md';

/** Indici shade validi di una palette Mantine (0 = più chiaro, 9 = più scuro). */
export const THEME_SHADE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Whitelist dei font stack selezionabili per testo e titoli. Nel `ThemeConfig`
 * viaggia SOLO l'ID (validato anche server-side): lo stack CSS corrispondente
 * vive esclusivamente in questa mappa, quindi nessuna stringa font arbitraria
 * può raggiungere il theme object. Tutti gli stack usano font di sistema
 * (nessun caricamento di webfont esterni).
 */
export const THEME_FONT_FAMILIES = {
  inter: {
    label: 'Inter (default)',
    stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  system: {
    label: 'Sistema (system-ui)',
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  humanist: {
    label: 'Humanist (Segoe UI / Helvetica)',
    stack: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  geometric: {
    label: 'Geometrico (Century Gothic / Futura)',
    stack: '"Century Gothic", CenturyGothic, Futura, "Trebuchet MS", Arial, sans-serif',
  },
  rounded: {
    label: 'Arrotondato (ui-rounded)',
    stack:
      'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, "Arial Rounded MT Bold", Calibri, sans-serif',
  },
  serif: {
    label: 'Serif (Georgia)',
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  slab: {
    label: 'Slab serif (Rockwell / Roboto Slab)',
    stack: 'Rockwell, "Roboto Slab", "Courier Bold", Georgia, serif',
  },
} as const;

export type ThemeFontFamilyId = keyof typeof THEME_FONT_FAMILIES;

/** Whitelist degli stack monospace (stesso principio di `THEME_FONT_FAMILIES`). */
export const THEME_MONO_FONT_FAMILIES = {
  'system-mono': {
    label: 'Mono di sistema',
    stack:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  courier: {
    label: 'Courier',
    stack: '"Courier New", Courier, monospace',
  },
} as const;

export type ThemeMonoFontFamilyId = keyof typeof THEME_MONO_FONT_FAMILIES;

/** Pesi font ammessi per i titoli (stringhe, come richiesto da `theme.headings`). */
export const THEME_FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'] as const;

export type ThemeFontWeight = (typeof THEME_FONT_WEIGHTS)[number];

/** Livelli di titolo configurabili singolarmente. */
export const THEME_HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export type ThemeHeadingLevel = (typeof THEME_HEADING_LEVELS)[number];

/** Opzioni `focusRing` native Mantine. */
export const THEME_FOCUS_RING_VALUES = ['auto', 'always', 'never'] as const;

export type ThemeFocusRingValue = (typeof THEME_FOCUS_RING_VALUES)[number];

/** Opzioni `cursorType` native Mantine (pointer = mano su checkbox/select ecc.). */
export const THEME_CURSOR_VALUES = ['default', 'pointer'] as const;

export type ThemeCursorValue = (typeof THEME_CURSOR_VALUES)[number];

/** Stile del bordo destro della sidebar applicativa: bordo sottile o ombra proiettata. */
export const THEME_NAVBAR_EDGE_STYLES = ['border', 'shadow'] as const;

export type ThemeNavbarEdgeStyle = (typeof THEME_NAVBAR_EDGE_STYLES)[number];

/**
 * Sentinella "non impostato" per i knob dei componenti: il prop non viene
 * emesso in `defaultProps` e vale il default nativo del componente Mantine.
 * (Non si usa la stringa `'default'` perché per Button/Badge/ActionIcon è una
 * vera variant Mantine.)
 */
export const THEME_UNSET = 'unset' as const;

/** Variant applicabili come default di `Button`. */
export const THEME_BUTTON_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'subtle',
  'default',
  'gradient',
] as const;

export type ThemeButtonVariant = (typeof THEME_BUTTON_VARIANTS)[number];

/** Variant applicabili come default di `ActionIcon`. */
export const THEME_ACTION_ICON_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'subtle',
  'default',
  'transparent',
] as const;

export type ThemeActionIconVariant = (typeof THEME_ACTION_ICON_VARIANTS)[number];

/** Variant applicabili come default di `Badge`. */
export const THEME_BADGE_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'dot',
  'default',
] as const;

export type ThemeBadgeVariant = (typeof THEME_BADGE_VARIANTS)[number];

/** Variant applicabili come default dei campi input (TextInput, Select, …). */
export const THEME_INPUT_VARIANTS = [THEME_UNSET, 'default', 'filled', 'unstyled'] as const;

export type ThemeInputVariant = (typeof THEME_INPUT_VARIANTS)[number];

/** Tipi di `Loader` nativi Mantine. */
export const THEME_LOADER_TYPES = [THEME_UNSET, 'oval', 'bars', 'dots'] as const;

export type ThemeLoaderType = (typeof THEME_LOADER_TYPES)[number];

/** Size opzionale di un componente: `unset` = default nativo Mantine. */
export const THEME_SIZE_OPTIONS = [THEME_UNSET, ...THEME_SIZE_VALUES] as const;

export type ThemeSizeOption = (typeof THEME_SIZE_OPTIONS)[number];

/** Radius opzionale di un componente: `unset` = eredita `defaultRadius`. */
export type ThemeRadiusOption = ThemeSizeOption;

/** Ombra opzionale di un componente: `none` la rimuove, `unset` = default nativo. */
export const THEME_SHADOW_OPTIONS = [THEME_UNSET, 'none', ...THEME_SIZE_VALUES] as const;

export type ThemeShadowOption = (typeof THEME_SHADOW_OPTIONS)[number];

/**
 * Set chiuso dei token semantici personalizzabili per singolo scheme (ADR-4 §1).
 * Ogni valore è un colore hex nel formato obbligatorio `#rrggbb`.
 * Nessun token fuori da questo set: estensioni future = bump di `version`.
 */
export interface ThemeSchemeTokens {
  /** Sfondo applicativo (`.appBg`). */
  pageBg: string;
  /** Sfondo `ContentCard` / superfici contenuto. */
  cardBg: string;
  /** Bordo card (default: invisibile, stesso colore di `cardBg`). */
  cardBorder: string;
  /** Testo principale (`--mantine-color-text`). */
  textPrimary: string;
  /** Testo secondario/dimmed (`--mantine-color-dimmed`). */
  textSecondary: string;
  /** Colore del titolo H1 (default: `textPrimary`). */
  headingH1: string;
  /** Colore del titolo H2 (default: `textPrimary`). */
  headingH2: string;
  /** Colore del titolo H3 (default: `textPrimary`). */
  headingH3: string;
  /** Colore del titolo H4 (default: `textPrimary`). */
  headingH4: string;
  /** Colore del titolo H5 (default: `textPrimary`). */
  headingH5: string;
  /** Colore del titolo H6 (default: `textPrimary`). */
  headingH6: string;
  /** Sfondo sidebar. */
  navbarBg: string;
  /** Testo voci navbar. */
  navbarText: string;
  /** Sfondo hover voce navbar. */
  navbarHoverBg: string;
  /** Sfondo voce navbar attiva. */
  navbarActiveBg: string;
  /** Testo voce navbar attiva. */
  navbarActiveText: string;
  /** Bordi interni sidebar (sezione utente, bottoni). */
  navbarBorder: string;
}

export type ThemeTokenName = keyof ThemeSchemeTokens;

/**
 * Unità CSS selezionabili per i campi dimensionali del tema (ADR-4 v6).
 * `%` è escluso dove il CSS non lo ammette — vedi `THEME_LENGTH_UNITS`, usato
 * dalle ombre: `box-shadow` accetta solo `<length>`, mai percentuali.
 */
export const THEME_UNITS = ['px', 'em', 'rem', '%'] as const;

export type ThemeUnit = (typeof THEME_UNITS)[number];

/** Unità di lunghezza pure (senza `%`), per i campi dove il CSS vieta le percentuali. */
export const THEME_LENGTH_UNITS = ['px', 'em', 'rem'] as const;

export type ThemeLengthUnit = (typeof THEME_LENGTH_UNITS)[number];

/** Step del `NumberInput` per unità: px/`%` interi, em/rem con due decimali. */
export const THEME_UNIT_STEP: Record<ThemeUnit, number> = { px: 1, em: 0.05, rem: 0.05, '%': 1 };

/** Decimali mostrati dal `NumberInput` per unità. */
export const THEME_UNIT_DECIMAL_SCALE: Record<ThemeUnit, number> = { px: 0, em: 2, rem: 2, '%': 0 };

/** Scala a 5 misure (fontSizes, spacing, radius): convertita in CSS dal builder secondo l'unità del gruppo. */
export type ThemeSizeScale = Record<ThemeSizeValue, number>;

/** Gradiente di default (`theme.defaultGradient`, usato dalle variant `gradient`). */
export interface ThemeGradient {
  /** Colore di partenza (hex `#rrggbb`). */
  from: string;
  /** Colore di arrivo (hex `#rrggbb`). */
  to: string;
  /** Angolo in gradi (0–360). */
  deg: number;
}

/** Shade della palette primaria usata come "filled" per scheme (`theme.primaryShade`). */
export interface ThemePrimaryShade {
  /** Indice shade (0–9) nello scheme chiaro. */
  light: number;
  /** Indice shade (0–9) nello scheme scuro. */
  dark: number;
}

/** Dimensione e interlinea di un singolo livello di titolo. */
export interface ThemeHeadingSize {
  /** Dimensione font in pixel. */
  fontSize: number;
  /** Interlinea (moltiplicatore, es. 1.3). */
  lineHeight: number;
}

/** Blocco tipografico completo del tema. */
export interface ThemeTypography {
  /** Font del testo (ID della whitelist `THEME_FONT_FAMILIES`). */
  fontFamily: ThemeFontFamilyId;
  /** Font monospace (ID della whitelist `THEME_MONO_FONT_FAMILIES`). */
  fontFamilyMonospace: ThemeMonoFontFamilyId;
  /** Dimensioni testo `xs`–`xl`, nell'unità di `fontSizeUnit`. */
  fontSizes: ThemeSizeScale;
  /** Unità CSS di `fontSizes` (v7). */
  fontSizeUnit: ThemeUnit;
  /** Interlinee `xs`–`xl` (moltiplicatori, sempre unitless). */
  lineHeights: ThemeSizeScale;
  /** Configurazione titoli. */
  headings: {
    /** Font dei titoli (ID whitelist, può differire dal testo). */
    fontFamily: ThemeFontFamilyId;
    /** Peso di tutti i titoli. */
    fontWeight: ThemeFontWeight;
    /** Unità CSS condivisa dalla dimensione di ogni livello h1–h6 (v7). */
    fontSizeUnit: ThemeUnit;
    /** Dimensione/interlinea per singolo livello h1–h6. */
    sizes: Record<ThemeHeadingLevel, ThemeHeadingSize>;
  };
}

/**
 * Ombra strutturata di un size token: la stringa CSS
 * `0 {y}px {blur}px {spread}px rgba(0,0,0,{opacity})` è generata dal builder —
 * l'admin non scrive mai stringhe box-shadow libere (vettore di injection).
 */
export interface ThemeShadowSpec {
  /** Offset verticale in pixel. */
  y: number;
  /** Raggio di sfocatura in pixel. */
  blur: number;
  /** Espansione in pixel (anche negativa). */
  spread: number;
  /** Opacità del nero (0–1). */
  opacity: number;
}

/** Default per-componente applicati via `theme.components` → `defaultProps`. */
export interface ThemeComponentsConfig {
  /** Default dei `Button` (variant/size/radius). */
  button: { variant: ThemeButtonVariant; size: ThemeSizeOption; radius: ThemeRadiusOption };
  /** Default degli `ActionIcon` (variant/radius). */
  actionIcon: { variant: ThemeActionIconVariant; radius: ThemeRadiusOption };
  /** Default dei `Badge` (variant/size/radius). */
  badge: { variant: ThemeBadgeVariant; size: ThemeSizeOption; radius: ThemeRadiusOption };
  /** Default dei campi input (TextInput, PasswordInput, Select, NumberInput). */
  input: { variant: ThemeInputVariant; size: ThemeSizeOption; radius: ThemeRadiusOption };
  /** Default delle superfici `Paper`/`Card` (ombra, radius, bordo, padding). */
  card: {
    shadow: ThemeShadowOption;
    radius: ThemeRadiusOption;
    padding: ThemeSizeOption;
    withBorder: boolean;
  };
  /** Default di `Modal` (e blur overlay condiviso con `Drawer`). */
  modal: {
    radius: ThemeRadiusOption;
    shadow: ThemeShadowOption;
    padding: ThemeSizeOption;
    overlayBlur: number;
    centered: boolean;
  };
  /** Default delle `Table` (righe alternate, hover, bordi, spaziatura verticale). */
  table: {
    striped: boolean;
    highlightOnHover: boolean;
    withTableBorder: boolean;
    withColumnBorders: boolean;
    verticalSpacing: ThemeSizeOption;
  };
  /** Default dei `Tooltip` (freccia, radius). */
  tooltip: { withArrow: boolean; radius: ThemeRadiusOption };
  /** Default dei `Loader` (tipo di animazione). */
  loader: { type: ThemeLoaderType };
}

/**
 * Configurazione completa del tema di installazione (riga `key='theme'` di
 * `app_settings`). Versione 7: aggiunge l'unità CSS (`px`/`em`/`rem`/`%`, `%`
 * escluso dove il CSS non lo ammette) ai campi dimensionali — dimensioni
 * testo e titoli, spaziatura, radius token, ombre, larghezza navbar — che in
 * v6 erano numeri impliciti in pixel. La v6 aveva sostituito la selezione
 * "una delle 14 palette native oppure custom" della v5 (`primaryColor`/
 * `customPrimary`) con `colors`, 9 voci semantiche (Primary/Secondary/Accent/
 * Success/Warning/Alert/Error/Danger/Info) ciascuna un hex base da cui si
 * generano 10 sfumature, registrate come vere palette Mantine da
 * `buildAppTheme()`. Le config v1–v6 salvate vengono migrate da
 * `migrateThemeConfig()`.
 */
export interface ThemeConfig {
  /** Versionamento esplicito del contratto: estensioni = bump + migrazione default. */
  version: 7;
  /** Larghezza della sidebar espansa, nell'unità di `navbarWidthUnit`. */
  navbarWidth: number;
  /** Unità CSS di `navbarWidth` (v7). */
  navbarWidthUnit: ThemeUnit;
  /** Stato di default della sidebar al primo caricamento: `true` = chiusa (solo icone). */
  navbarDefaultCollapsed: boolean;
  /** Stile del bordo destro della sidebar: bordo sottile o ombra proiettata. */
  navbarEdgeStyle: ThemeNavbarEdgeStyle;
  /** Intensità (0–1) dell'ombra del bordo destro sidebar quando `navbarEdgeStyle` è `'shadow'`. */
  navbarEdgeShadowIntensity: number;
  /** I 9 colori semantici del tema (hex base, sfumature generate a build-time). */
  colors: ThemeColors;
  /** Shade "filled" della palette primaria per scheme. */
  primaryShade: ThemePrimaryShade;
  /** Radius nativo Mantine applicato come `defaultRadius`. */
  radius: ThemeRadiusValue;
  /** Anello di focus: `auto` (solo tastiera), `always`, `never`. */
  focusRing: ThemeFocusRingValue;
  /** Cursore su controlli interattivi (checkbox, select, …). */
  cursorType: ThemeCursorValue;
  /** Disabilita le animazioni per chi ha `prefers-reduced-motion`. */
  respectReducedMotion: boolean;
  /** Testo bianco/nero automatico sui filled in base alla luminanza. */
  autoContrast: boolean;
  /** Soglia di luminanza per `autoContrast` (0–1). */
  luminanceThreshold: number;
  /** Scala globale dell'interfaccia (moltiplica ogni misura rem). */
  scale: number;
  /** Gradiente usato dalle variant `gradient` di Button/Badge/ecc. */
  defaultGradient: ThemeGradient;
  /** Blocco tipografico (font, dimensioni, interlinee, titoli). */
  typography: ThemeTypography;
  /** Scala di spaziatura `xs`–`xl`, nell'unità di `spacingUnit` (`theme.spacing`). */
  spacing: ThemeSizeScale;
  /** Unità CSS di `spacing` (v7). */
  spacingUnit: ThemeUnit;
  /** Valori dei radius token `xs`–`xl`, nell'unità di `radiusScaleUnit` (`theme.radius`). */
  radiusScale: ThemeSizeScale;
  /** Unità CSS di `radiusScale` (v7). */
  radiusScaleUnit: ThemeUnit;
  /** Ombre `xs`–`xl` come spec strutturate, offset/blur/spread nell'unità di `shadowUnit`. */
  shadows: Record<ThemeSizeValue, ThemeShadowSpec>;
  /** Unità CSS di `shadows` (v7) — solo lunghezze: `box-shadow` non ammette percentuali. */
  shadowUnit: ThemeLengthUnit;
  /** Default per-componente (`theme.components` → `defaultProps`). */
  components: ThemeComponentsConfig;
  /** Token per lo scheme chiaro. */
  light: ThemeSchemeTokens;
  /** Token per lo scheme scuro. */
  dark: ThemeSchemeTokens;
}

/**
 * Range chiusi di ogni campo numerico del `ThemeConfig` — stessa fonte per la
 * validazione client (type guard + clamp degli input) e per i limiti del DTO
 * backend (che li replica in `theme-config.dto.ts`).
 */
export const THEME_NUMERIC_LIMITS = {
  fontSize: { min: 8, max: 48 },
  headingFontSize: { min: 10, max: 96 },
  lineHeight: { min: 0.8, max: 3 },
  spacing: { min: 0, max: 80 },
  radius: { min: 0, max: 48 },
  shadowY: { min: -24, max: 48 },
  shadowBlur: { min: 0, max: 120 },
  shadowSpread: { min: -32, max: 32 },
  opacity: { min: 0, max: 1 },
  overlayBlur: { min: 0, max: 12 },
  gradientDeg: { min: 0, max: 360 },
  luminanceThreshold: { min: 0, max: 1 },
  scale: { min: 0.75, max: 1.5 },
  navbarWidth: { min: 180, max: 320 },
} as const;

/** Fattore di conversione px↔rem/em (base 16px) per i limiti per-unità e il cambio unità in UI. */
const REM_PX_RATIO = 16;

/** Deriva i limiti `em`/`rem` da un limite `px` (÷16) senza duplicare tabelle a mano. */
function deriveLengthLimits(px: {
  min: number;
  max: number;
}): Record<ThemeLengthUnit, { min: number; max: number }> {
  return {
    px,
    em: { min: px.min / REM_PX_RATIO, max: px.max / REM_PX_RATIO },
    rem: { min: px.min / REM_PX_RATIO, max: px.max / REM_PX_RATIO },
  };
}

/** Come `deriveLengthLimits`, con l'aggiunta di un range `%` scelto esplicitamente (non derivabile da px). */
function deriveLimitsWithPercent(
  px: { min: number; max: number },
  percent: { min: number; max: number },
): Record<ThemeUnit, { min: number; max: number }> {
  return { ...deriveLengthLimits(px), '%': percent };
}

/**
 * Range numerici per unità dei campi dimensionali (v7), derivati dai range in
 * px di `THEME_NUMERIC_LIMITS` (che resta invariato e continua a rappresentare
 * implicitamente il bucket `px` usato da ogni config storica pre-v7) —
 * struttura separata apposta per non alterare i confronti già esistenti
 * contro `THEME_NUMERIC_LIMITS.<campo>` nelle guardie delle versioni storiche.
 * `%` è assente per le ombre: `box-shadow` non ammette percentuali.
 */
export const THEME_DIMENSION_UNIT_LIMITS = {
  fontSize: deriveLimitsWithPercent(THEME_NUMERIC_LIMITS.fontSize, { min: 50, max: 300 }),
  headingFontSize: deriveLimitsWithPercent(THEME_NUMERIC_LIMITS.headingFontSize, {
    min: 50,
    max: 400,
  }),
  spacing: deriveLimitsWithPercent(THEME_NUMERIC_LIMITS.spacing, { min: 0, max: 100 }),
  radius: deriveLimitsWithPercent(THEME_NUMERIC_LIMITS.radius, { min: 0, max: 50 }),
  shadowY: deriveLengthLimits(THEME_NUMERIC_LIMITS.shadowY),
  shadowBlur: deriveLengthLimits(THEME_NUMERIC_LIMITS.shadowBlur),
  shadowSpread: deriveLengthLimits(THEME_NUMERIC_LIMITS.shadowSpread),
  navbarWidth: deriveLimitsWithPercent(THEME_NUMERIC_LIMITS.navbarWidth, { min: 10, max: 50 }),
} as const;

/**
 * Converte un valore dimensionale da un'unità all'altra. Per `px`/`em`/`rem`
 * la conversione è esatta (base 16px); per `%` non esiste un modo universale
 * di derivare una percentuale da una lunghezza assoluta, quindi si usa come
 * riferimento il valore di fabbrica dello stesso campo ("100% = default").
 * Arrotonda a 2 decimali per evitare rumore in virgola mobile.
 * @param value Valore corrente, nell'unità `from`.
 * @param from Unità corrente.
 * @param to Unità di destinazione.
 * @param factoryDefaultPx Valore di fabbrica dello stesso campo, in px — riferimento per `%`.
 */
export function convertDimension(
  value: number,
  from: ThemeUnit,
  to: ThemeUnit,
  factoryDefaultPx: number,
): number {
  if (from === to) {
    return value;
  }
  const toPx = (val: number, unit: ThemeUnit): number => {
    if (unit === '%') return (val / 100) * factoryDefaultPx;
    if (unit === 'px') return val;
    return val * REM_PX_RATIO;
  };
  const fromPx = (px: number, unit: ThemeUnit): number => {
    if (unit === '%') return factoryDefaultPx === 0 ? 0 : (px / factoryDefaultPx) * 100;
    if (unit === 'px') return px;
    return px / REM_PX_RATIO;
  };
  return Math.round(fromPx(toPx(value, from), to) * 100) / 100;
}

/** Applica `convertDimension` a un'intera scala `xs`–`xl`, un valore di fabbrica per singolo size. */
export function convertSizeScale(
  scale: ThemeSizeScale,
  from: ThemeUnit,
  to: ThemeUnit,
  factoryDefaults: ThemeSizeScale,
): ThemeSizeScale {
  const result = {} as ThemeSizeScale;
  for (const size of THEME_SIZE_VALUES) {
    result[size] = convertDimension(scale[size], from, to, factoryDefaults[size]);
  }
  return result;
}

/*
 * Default di fabbrica: snapshot hex dei valori nativi Mantine usati oggi dai
 * CSS Modules, derivati da DEFAULT_THEME dove possibile (niente hex duplicati
 * a mano). La sidebar è volutamente chiara (sfondo bianco) in entrambi gli
 * scheme (vedi LayoutProtected.module.css), quindi il blocco navbar è
 * identico in `light` e `dark`, con l'unica eccezione di `navbarActiveBg`:
 * oggi la pillola attiva usa `--mantine-primary-color-filled`, che con
 * `primaryShade: { light: 8, dark: 5 }` cambia shade per scheme. `navbarText`
 * riusa `dark[7]` (ex sfondo navbar) come colore testo di default.
 */
const NAVBAR_FACTORY_DEFAULTS = {
  navbarBg: '#ffffff',
  navbarText: DEFAULT_THEME.colors.dark[7],
  navbarHoverBg: DEFAULT_THEME.colors.gray[1],
  navbarActiveText: '#ffffff',
  navbarBorder: DEFAULT_THEME.colors.gray[3],
} satisfies Partial<ThemeSchemeTokens>;

/*
 * Ombre di fabbrica: approssimazione strutturata a singolo layer delle ombre
 * native Mantine. Finché una spec resta identica al default, il builder emette
 * la stringa nativa di DEFAULT_THEME.shadows (multi-layer) — l'app resta
 * pixel-identical; la stringa generata entra in gioco solo su valori custom.
 */
const SHADOW_FACTORY_DEFAULTS: Record<ThemeSizeValue, ThemeShadowSpec> = {
  xs: { y: 1, blur: 3, spread: 0, opacity: 0.05 },
  sm: { y: 2, blur: 6, spread: -1, opacity: 0.06 },
  md: { y: 4, blur: 12, spread: -2, opacity: 0.07 },
  lg: { y: 8, blur: 20, spread: -4, opacity: 0.08 },
  xl: { y: 12, blur: 28, spread: -6, opacity: 0.09 },
};

/** Default di fabbrica del tema: con questi valori l'app è identica a oggi. */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  version: 7,
  navbarWidth: 210,
  navbarWidthUnit: 'px',
  navbarDefaultCollapsed: false,
  navbarEdgeStyle: 'border',
  navbarEdgeShadowIntensity: 0.16,
  colors: {
    primary: DEFAULT_THEME.colors[DEFAULT_PRIMARY_COLOR][6],
    secondary: DEFAULT_THEME.colors.gray[6],
    accent: DEFAULT_THEME.colors.grape[6],
    success: DEFAULT_THEME.colors.green[6],
    warning: DEFAULT_THEME.colors.yellow[6],
    alert: DEFAULT_THEME.colors.orange[7],
    error: DEFAULT_THEME.colors.red[6],
    danger: DEFAULT_THEME.colors.red[9],
    info: DEFAULT_THEME.colors.cyan[6],
  },
  primaryShade: { light: 8, dark: 5 },
  radius: DEFAULT_RADIUS,
  // Non più modificabile da UI: `buildAppTheme()` forza sempre 'never'.
  focusRing: 'never',
  cursorType: 'default',
  respectReducedMotion: false,
  autoContrast: false,
  luminanceThreshold: 0.3,
  scale: 1,
  defaultGradient: {
    from: DEFAULT_THEME.colors.blue[6],
    to: DEFAULT_THEME.colors.cyan[6],
    deg: 45,
  },
  typography: {
    fontFamily: 'inter',
    fontFamilyMonospace: 'system-mono',
    fontSizes: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 },
    fontSizeUnit: 'px',
    lineHeights: { xs: 1.4, sm: 1.45, md: 1.55, lg: 1.6, xl: 1.65 },
    headings: {
      fontFamily: 'inter',
      fontWeight: '700',
      fontSizeUnit: 'px',
      sizes: {
        h1: { fontSize: 34, lineHeight: 1.3 },
        h2: { fontSize: 26, lineHeight: 1.35 },
        h3: { fontSize: 22, lineHeight: 1.4 },
        h4: { fontSize: 18, lineHeight: 1.45 },
        h5: { fontSize: 16, lineHeight: 1.5 },
        h6: { fontSize: 14, lineHeight: 1.5 },
      },
    },
  },
  spacing: { xs: 10, sm: 12, md: 16, lg: 20, xl: 32 },
  spacingUnit: 'px',
  radiusScale: { xs: 2, sm: 4, md: 8, lg: 16, xl: 32 },
  radiusScaleUnit: 'px',
  shadows: SHADOW_FACTORY_DEFAULTS,
  shadowUnit: 'px',
  components: {
    button: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    actionIcon: { variant: THEME_UNSET, radius: THEME_UNSET },
    badge: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    input: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    card: { shadow: THEME_UNSET, radius: THEME_UNSET, padding: THEME_UNSET, withBorder: false },
    modal: {
      radius: THEME_UNSET,
      shadow: THEME_UNSET,
      padding: THEME_UNSET,
      overlayBlur: 0,
      centered: false,
    },
    table: {
      striped: false,
      highlightOnHover: false,
      withTableBorder: false,
      withColumnBorders: false,
      verticalSpacing: THEME_UNSET,
    },
    tooltip: { withArrow: false, radius: THEME_UNSET },
    loader: { type: THEME_UNSET },
  },
  light: {
    pageBg: DEFAULT_THEME.colors.gray[0],
    cardBg: '#ffffff',
    cardBorder: '#ffffff',
    textPrimary: '#000000',
    textSecondary: DEFAULT_THEME.colors.gray[6],
    // Titoli: stesso colore del testo principale di default (nessuna variabile
    // --app-heading-* emessa finché l'admin non li differenzia, vedi §2).
    headingH1: '#000000',
    headingH2: '#000000',
    headingH3: '#000000',
    headingH4: '#000000',
    headingH5: '#000000',
    headingH6: '#000000',
    ...NAVBAR_FACTORY_DEFAULTS,
    navbarActiveBg: DEFAULT_THEME.colors[DEFAULT_PRIMARY_COLOR][8],
  },
  dark: {
    pageBg: DEFAULT_THEME.colors.dark[8],
    cardBg: DEFAULT_THEME.colors.dark[7],
    cardBorder: DEFAULT_THEME.colors.dark[7],
    textPrimary: DEFAULT_THEME.colors.dark[0],
    textSecondary: DEFAULT_THEME.colors.dark[2],
    headingH1: DEFAULT_THEME.colors.dark[0],
    headingH2: DEFAULT_THEME.colors.dark[0],
    headingH3: DEFAULT_THEME.colors.dark[0],
    headingH4: DEFAULT_THEME.colors.dark[0],
    headingH5: DEFAULT_THEME.colors.dark[0],
    headingH6: DEFAULT_THEME.colors.dark[0],
    ...NAVBAR_FACTORY_DEFAULTS,
    navbarActiveBg: DEFAULT_THEME.colors[DEFAULT_PRIMARY_COLOR][5],
  },
};

/** Mappa token → variabile CSS semantica esposta all'app (ADR-4 §2). */
const TOKEN_CSS_VARS: Record<ThemeTokenName, string> = {
  pageBg: '--app-page-bg',
  cardBg: '--app-card-bg',
  cardBorder: '--app-card-border',
  textPrimary: '--app-text-primary',
  textSecondary: '--app-text-secondary',
  headingH1: '--app-heading-h1',
  headingH2: '--app-heading-h2',
  headingH3: '--app-heading-h3',
  headingH4: '--app-heading-h4',
  headingH5: '--app-heading-h5',
  headingH6: '--app-heading-h6',
  navbarBg: '--app-navbar-bg',
  navbarText: '--app-navbar-text',
  navbarHoverBg: '--app-navbar-hover-bg',
  navbarActiveBg: '--app-navbar-active-bg',
  navbarActiveText: '--app-navbar-active-text',
  navbarBorder: '--app-navbar-border',
};

/*
 * I token testo governano anche le variabili semantiche native Mantine (testo
 * di default e `c="dimmed"`), che non passano dai CSS Modules: è l'uso previsto
 * del cssVariablesResolver e resta un'unica fonte di verità. Nessuna palette
 * `--mantine-color-<nome>-*` viene mai sovrascritta.
 */
const TOKEN_MANTINE_VARS: Partial<Record<ThemeTokenName, string>> = {
  textPrimary: '--mantine-color-text',
  textSecondary: '--mantine-color-dimmed',
};

/**
 * Genera le variabili CSS di uno scheme emettendo **solo i token diversi dal
 * default di fabbrica**. Con i default attivi non viene emessa alcuna
 * variabile `--app-*`: valgono i fallback nativi dei CSS Modules e l'app è
 * pixel-identical per costruzione. Questo preserva anche i comportamenti
 * dinamici dei fallback che uno snapshot hex congelerebbe:
 * `navbarActiveBg` di default segue `--mantine-primary-color-filled` (quindi
 * lo switch del primario), e `navbarBorder` copre due fallback nativi diversi
 * (dark-5 sezione utente, dark-4 bottoni) che si unificano solo quando
 * l'admin personalizza il token.
 * @param tokens Token dello scheme correnti.
 * @param defaults Token di fabbrica dello stesso scheme.
 */
function buildSchemeVariables(
  tokens: ThemeSchemeTokens,
  defaults: ThemeSchemeTokens,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const token of Object.keys(TOKEN_CSS_VARS) as ThemeTokenName[]) {
    const value = tokens[token];
    if (value.toLowerCase() === defaults[token].toLowerCase()) continue;
    variables[TOKEN_CSS_VARS[token]] = value;
    const mantineVar = TOKEN_MANTINE_VARS[token];
    if (mantineVar) {
      variables[mantineVar] = value;
    }
  }
  return variables;
}

/** Formato hex obbligatorio dei token — stesso vincolo del DTO backend (ADR-4 §3). */
const HEX_TOKEN_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Verifica che un valore sia una stringa hex `#rrggbb`. */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_TOKEN_REGEX.test(value);
}

/** Verifica che un valore sia un numero finito dentro un range chiuso. */
function isNumberInRange(value: unknown, limits: { min: number; max: number }): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max
  );
}

/** Verifica che un valore sia un blocco scheme completo di 17 token hex validi. */
function isThemeSchemeTokens(value: unknown): value is ThemeSchemeTokens {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (Object.keys(TOKEN_CSS_VARS) as ThemeTokenName[]).every((token) =>
    isHexColor(record[token]),
  );
}

/** Verifica che un valore sia un blocco `colors` completo delle 9 voci semantiche, tutte hex valido. */
function isThemeColors(value: unknown): value is ThemeColors {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return THEME_SEMANTIC_COLOR_NAMES.every((name) => isHexColor(record[name]));
}

/** Verifica una scala `xs`–`xl` di numeri dentro il range dato. */
function isSizeScale(
  value: unknown,
  limits: { min: number; max: number },
): value is ThemeSizeScale {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return THEME_SIZE_VALUES.every((size) => isNumberInRange(record[size], limits));
}

/**
 * Verifica una spec ombra strutturata (y/blur/spread/opacity nei range).
 * `unit` di default `'px'`: preserva il comportamento delle guardie storiche
 * (v1–v6, sempre implicitamente px) che richiamano questa funzione senza
 * passare l'unità, introdotta solo in v7.
 */
function isShadowSpec(value: unknown, unit: ThemeLengthUnit = 'px'): value is ThemeShadowSpec {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isNumberInRange(record.y, THEME_DIMENSION_UNIT_LIMITS.shadowY[unit]) &&
    isNumberInRange(record.blur, THEME_DIMENSION_UNIT_LIMITS.shadowBlur[unit]) &&
    isNumberInRange(record.spread, THEME_DIMENSION_UNIT_LIMITS.shadowSpread[unit]) &&
    isNumberInRange(record.opacity, THEME_NUMERIC_LIMITS.opacity)
  );
}

/**
 * Verifica il blocco tipografico completo (whitelist font + range numerici),
 * contratto v7 corrente: richiede `fontSizeUnit`/`headings.fontSizeUnit`
 * validi (whitelist `THEME_UNITS`). Le config pre-v7 (che non hanno questi
 * campi) sono validate da `isLegacyThemeTypography`, mai da questa funzione.
 */
function isThemeTypography(value: unknown): value is ThemeTypography {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const headings = record.headings as Record<string, unknown> | undefined;
  if (typeof headings !== 'object' || headings === null) {
    return false;
  }
  const sizes = headings.sizes as Record<string, unknown> | undefined;
  if (typeof sizes !== 'object' || sizes === null) {
    return false;
  }
  const fontSizeUnit = record.fontSizeUnit;
  const headingsFontSizeUnit = headings.fontSizeUnit;
  return (
    typeof record.fontFamily === 'string' &&
    record.fontFamily in THEME_FONT_FAMILIES &&
    typeof record.fontFamilyMonospace === 'string' &&
    record.fontFamilyMonospace in THEME_MONO_FONT_FAMILIES &&
    isOneOf(fontSizeUnit, THEME_UNITS) &&
    isSizeScale(record.fontSizes, THEME_DIMENSION_UNIT_LIMITS.fontSize[fontSizeUnit]) &&
    isSizeScale(record.lineHeights, THEME_NUMERIC_LIMITS.lineHeight) &&
    typeof headings.fontFamily === 'string' &&
    headings.fontFamily in THEME_FONT_FAMILIES &&
    (THEME_FONT_WEIGHTS as readonly string[]).includes(headings.fontWeight as string) &&
    isOneOf(headingsFontSizeUnit, THEME_UNITS) &&
    THEME_HEADING_LEVELS.every((level) => {
      const size = sizes[level] as Record<string, unknown> | undefined;
      return (
        typeof size === 'object' &&
        size !== null &&
        isNumberInRange(
          size.fontSize,
          THEME_DIMENSION_UNIT_LIMITS.headingFontSize[headingsFontSizeUnit],
        ) &&
        isNumberInRange(size.lineHeight, THEME_NUMERIC_LIMITS.lineHeight)
      );
    })
  );
}

/**
 * Blocco tipografico storico (pre-v7): identico all'attuale ma senza le
 * unità dei campi dimensionali (introdotte in v7, sempre implicitamente px
 * prima). Usato solo dalle guardie storiche v1–v6 per la migrazione.
 */
type LegacyThemeTypography = Omit<ThemeTypography, 'fontSizeUnit'> & {
  headings: Omit<ThemeTypography['headings'], 'fontSizeUnit'>;
};

/** Verifica un blocco tipografico storico (stesso corpo di `isThemeTypography` ma range sempre in px, nessuna unità richiesta). */
function isLegacyThemeTypography(value: unknown): value is LegacyThemeTypography {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const headings = record.headings as Record<string, unknown> | undefined;
  if (typeof headings !== 'object' || headings === null) {
    return false;
  }
  const sizes = headings.sizes as Record<string, unknown> | undefined;
  if (typeof sizes !== 'object' || sizes === null) {
    return false;
  }
  return (
    typeof record.fontFamily === 'string' &&
    record.fontFamily in THEME_FONT_FAMILIES &&
    typeof record.fontFamilyMonospace === 'string' &&
    record.fontFamilyMonospace in THEME_MONO_FONT_FAMILIES &&
    isSizeScale(record.fontSizes, THEME_DIMENSION_UNIT_LIMITS.fontSize.px) &&
    isSizeScale(record.lineHeights, THEME_NUMERIC_LIMITS.lineHeight) &&
    typeof headings.fontFamily === 'string' &&
    headings.fontFamily in THEME_FONT_FAMILIES &&
    (THEME_FONT_WEIGHTS as readonly string[]).includes(headings.fontWeight as string) &&
    THEME_HEADING_LEVELS.every((level) => {
      const size = sizes[level] as Record<string, unknown> | undefined;
      return (
        typeof size === 'object' &&
        size !== null &&
        isNumberInRange(size.fontSize, THEME_DIMENSION_UNIT_LIMITS.headingFontSize.px) &&
        isNumberInRange(size.lineHeight, THEME_NUMERIC_LIMITS.lineHeight)
      );
    })
  );
}

/** Verifica un valore contro una whitelist readonly di stringhe. */
function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/** Verifica il blocco `components` completo (solo enum whitelisted e boolean). */
function isThemeComponentsConfig(value: unknown): value is ThemeComponentsConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, Record<string, unknown> | undefined>;
  const { button, actionIcon, badge, input, card, modal, table, tooltip, loader } = record;
  if (
    !button ||
    !actionIcon ||
    !badge ||
    !input ||
    !card ||
    !modal ||
    !table ||
    !tooltip ||
    !loader
  ) {
    return false;
  }
  return (
    isOneOf(button.variant, THEME_BUTTON_VARIANTS) &&
    isOneOf(button.size, THEME_SIZE_OPTIONS) &&
    isOneOf(button.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(actionIcon.variant, THEME_ACTION_ICON_VARIANTS) &&
    isOneOf(actionIcon.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(badge.variant, THEME_BADGE_VARIANTS) &&
    isOneOf(badge.size, THEME_SIZE_OPTIONS) &&
    isOneOf(badge.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(input.variant, THEME_INPUT_VARIANTS) &&
    isOneOf(input.size, THEME_SIZE_OPTIONS) &&
    isOneOf(input.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(card.shadow, THEME_SHADOW_OPTIONS) &&
    isOneOf(card.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(card.padding, THEME_SIZE_OPTIONS) &&
    typeof card.withBorder === 'boolean' &&
    isOneOf(modal.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(modal.shadow, THEME_SHADOW_OPTIONS) &&
    isOneOf(modal.padding, THEME_SIZE_OPTIONS) &&
    isNumberInRange(modal.overlayBlur, THEME_NUMERIC_LIMITS.overlayBlur) &&
    typeof modal.centered === 'boolean' &&
    typeof table.striped === 'boolean' &&
    typeof table.highlightOnHover === 'boolean' &&
    typeof table.withTableBorder === 'boolean' &&
    typeof table.withColumnBorders === 'boolean' &&
    isOneOf(table.verticalSpacing, THEME_SIZE_OPTIONS) &&
    typeof tooltip.withArrow === 'boolean' &&
    isOneOf(tooltip.radius, THEME_SIZE_OPTIONS) &&
    isOneOf(loader.type, THEME_LOADER_TYPES)
  );
}

/**
 * Type guard di un `ThemeConfig` versione 7. Usato per validare la cache
 * anti-FOUC in localStorage e la risposta del server prima di applicarle:
 * valori corrotti, manomessi o di versione futura vengono scartati a favore
 * di cache/default (mai applicati come variabili CSS o theme object).
 * @param value Valore sconosciuto da validare (JSON.parse o risposta API).
 */
export function isThemeConfig(value: unknown): value is ThemeConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  const navbarWidthUnit = record.navbarWidthUnit;
  const spacingUnit = record.spacingUnit;
  const radiusScaleUnit = record.radiusScaleUnit;
  const shadowUnit = record.shadowUnit;
  return (
    record.version === 7 &&
    isOneOf(navbarWidthUnit, THEME_UNITS) &&
    isNumberInRange(record.navbarWidth, THEME_DIMENSION_UNIT_LIMITS.navbarWidth[navbarWidthUnit]) &&
    typeof record.navbarDefaultCollapsed === 'boolean' &&
    isOneOf(record.navbarEdgeStyle, THEME_NAVBAR_EDGE_STYLES) &&
    isNumberInRange(record.navbarEdgeShadowIntensity, THEME_NUMERIC_LIMITS.opacity) &&
    isThemeColors(record.colors) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isThemeTypography(record.typography) &&
    isOneOf(spacingUnit, THEME_UNITS) &&
    isSizeScale(record.spacing, THEME_DIMENSION_UNIT_LIMITS.spacing[spacingUnit]) &&
    isOneOf(radiusScaleUnit, THEME_UNITS) &&
    isSizeScale(record.radiusScale, THEME_DIMENSION_UNIT_LIMITS.radius[radiusScaleUnit]) &&
    isOneOf(shadowUnit, THEME_LENGTH_UNITS) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size], shadowUnit)) &&
    isThemeComponentsConfig(record.components) &&
    isThemeSchemeTokens(record.light) &&
    isThemeSchemeTokens(record.dark)
  );
}

/**
 * Forma della config v6 storica: identica alla v7 ma senza le unità dei campi
 * dimensionali (introdotte in v7, sempre implicitamente px).
 */
type LegacyThemeConfigV6 = Omit<
  ThemeConfig,
  'version' | 'typography' | 'spacingUnit' | 'radiusScaleUnit' | 'shadowUnit' | 'navbarWidthUnit'
> & {
  version: 6;
  typography: LegacyThemeTypography;
};

/** Type guard della config v6 storica, usato solo per la migrazione a v7. */
function isLegacyThemeConfigV6(value: unknown): value is LegacyThemeConfigV6 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  return (
    record.version === 6 &&
    isNumberInRange(record.navbarWidth, THEME_NUMERIC_LIMITS.navbarWidth) &&
    typeof record.navbarDefaultCollapsed === 'boolean' &&
    isOneOf(record.navbarEdgeStyle, THEME_NAVBAR_EDGE_STYLES) &&
    isNumberInRange(record.navbarEdgeShadowIntensity, THEME_NUMERIC_LIMITS.opacity) &&
    isThemeColors(record.colors) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isLegacyThemeTypography(record.typography) &&
    isSizeScale(record.spacing, THEME_NUMERIC_LIMITS.spacing) &&
    isSizeScale(record.radiusScale, THEME_NUMERIC_LIMITS.radius) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size])) &&
    isThemeComponentsConfig(record.components) &&
    isThemeSchemeTokens(record.light) &&
    isThemeSchemeTokens(record.dark)
  );
}

/**
 * Converte una config v6 storica (già completa: default+override applicati)
 * in `ThemeConfig` v7, aggiungendo le unità dei campi dimensionali (sempre
 * `'px'`: l'app resta pixel-identical, stesso principio di ogni bump precedente).
 */
function upgradeV6ToV7(legacy: LegacyThemeConfigV6): ThemeConfig {
  return {
    ...legacy,
    version: 7,
    typography: {
      ...legacy.typography,
      fontSizeUnit: 'px',
      headings: { ...legacy.typography.headings, fontSizeUnit: 'px' },
    },
    spacingUnit: 'px',
    radiusScaleUnit: 'px',
    shadowUnit: 'px',
    navbarWidthUnit: 'px',
  };
}

/**
 * Forma della config v5 storica: identica alla v6 ma con la selezione
 * `primaryColor`/`customPrimary` al posto del blocco `colors` a 9 voci.
 */
type LegacyThemeConfigV5 = Omit<ThemeConfig, 'version' | 'colors'> & {
  version: 5;
  primaryColor: ThemePrimarySelection;
  customPrimary: string[];
};

/** Type guard della config v5 storica, usato solo per la migrazione. */
function isLegacyThemeConfigV5(value: unknown): value is LegacyThemeConfigV5 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  return (
    record.version === 5 &&
    isNumberInRange(record.navbarWidth, THEME_NUMERIC_LIMITS.navbarWidth) &&
    typeof record.navbarDefaultCollapsed === 'boolean' &&
    isOneOf(record.navbarEdgeStyle, THEME_NAVBAR_EDGE_STYLES) &&
    isNumberInRange(record.navbarEdgeShadowIntensity, THEME_NUMERIC_LIMITS.opacity) &&
    isOneOf(record.primaryColor, THEME_PRIMARY_SELECTIONS) &&
    Array.isArray(record.customPrimary) &&
    record.customPrimary.length === 10 &&
    record.customPrimary.every((shade) => isHexColor(shade)) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isLegacyThemeTypography(record.typography) &&
    isSizeScale(record.spacing, THEME_NUMERIC_LIMITS.spacing) &&
    isSizeScale(record.radiusScale, THEME_NUMERIC_LIMITS.radius) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size])) &&
    isThemeComponentsConfig(record.components) &&
    isThemeSchemeTokens(record.light) &&
    isThemeSchemeTokens(record.dark)
  );
}

/** Deriva l'hex base "primary" (v6) da una selezione v5 storica (nome nativo o custom[6]). */
function derivePrimaryBaseFromV5(
  primaryColor: ThemePrimarySelection,
  customPrimary: string[],
): string {
  return primaryColor === 'custom' ? customPrimary[6] : DEFAULT_THEME.colors[primaryColor][6];
}

/** Converte una config v5 storica (già completa: default+override applicati) in una config v6 (storica anch'essa dal punto di vista v7, upgradata a v7 da `upgradeV6ToV7`). */
function upgradeV5ToV6(legacy: LegacyThemeConfigV5): LegacyThemeConfigV6 {
  const { primaryColor, customPrimary, ...rest } = legacy;
  const defaults = structuredClone(DEFAULT_THEME_CONFIG);
  return {
    ...rest,
    version: 6,
    colors: { ...defaults.colors, primary: derivePrimaryBaseFromV5(primaryColor, customPrimary) },
  };
}

/** Default di fabbrica nella forma v5 storica, usato solo come base delle migrazioni v1–v4 → v6. */
const LEGACY_DEFAULT_V5: LegacyThemeConfigV5 = (() => {
  const rest = structuredClone(DEFAULT_THEME_CONFIG) as unknown as Record<string, unknown>;
  delete rest.colors;
  return {
    ...rest,
    version: 5,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    customPrimary: [...DEFAULT_THEME.colors[DEFAULT_PRIMARY_COLOR]],
    // Cast sicuro: `rest` è DEFAULT_THEME_CONFIG clonato senza `colors`, esattamente la forma di LegacyThemeConfigV5.
  } as unknown as LegacyThemeConfigV5;
})();

/**
 * Le 11 chiavi colore del contratto storico (v1 e v2), prima dell'aggiunta dei
 * colori per singolo titolo (`headingH1`–`headingH6`) in v3.
 */
const LEGACY_SCHEME_TOKEN_KEYS = [
  'pageBg',
  'cardBg',
  'cardBorder',
  'textPrimary',
  'textSecondary',
  'navbarBg',
  'navbarText',
  'navbarHoverBg',
  'navbarActiveBg',
  'navbarActiveText',
  'navbarBorder',
] as const satisfies readonly ThemeTokenName[];

/** Blocco scheme del contratto storico (v1/v2): gli 11 token comuni, senza i colori titolo di v3. */
type LegacySchemeTokens = Pick<ThemeSchemeTokens, (typeof LEGACY_SCHEME_TOKEN_KEYS)[number]>;

/** Verifica che un valore sia un blocco scheme storico completo di 11 token hex validi. */
function isLegacySchemeTokens(value: unknown): value is LegacySchemeTokens {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return LEGACY_SCHEME_TOKEN_KEYS.every((token) => isHexColor(record[token]));
}

/** Forma della config v1 storica (primario nativo, radius, 11 token light/dark). */
interface LegacyThemeConfigV1 {
  version: 1;
  primaryColor: MantinePrimaryColor;
  radius: ThemeRadiusValue;
  light: LegacySchemeTokens;
  dark: LegacySchemeTokens;
}

/** Type guard della config v1 storica, usato solo per la migrazione. */
function isLegacyThemeConfigV1(value: unknown): value is LegacyThemeConfigV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    isOneOf(record.primaryColor, MANTINE_PRIMARY_COLORS) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isLegacySchemeTokens(record.light) &&
    isLegacySchemeTokens(record.dark)
  );
}

/** Forma della config v3 storica: identica alla v4 tranne larghezza/stato di default della navbar. */
type LegacyThemeConfigV3 = Omit<
  LegacyThemeConfigV5,
  'version' | 'navbarWidth' | 'navbarDefaultCollapsed'
> & {
  version: 3;
};

/** Type guard della config v3 storica, usato solo per la migrazione. */
function isLegacyThemeConfigV3(value: unknown): value is LegacyThemeConfigV3 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  return (
    record.version === 3 &&
    isOneOf(record.primaryColor, THEME_PRIMARY_SELECTIONS) &&
    Array.isArray(record.customPrimary) &&
    record.customPrimary.length === 10 &&
    record.customPrimary.every((shade) => isHexColor(shade)) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isLegacyThemeTypography(record.typography) &&
    isSizeScale(record.spacing, THEME_NUMERIC_LIMITS.spacing) &&
    isSizeScale(record.radiusScale, THEME_NUMERIC_LIMITS.radius) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size])) &&
    isThemeComponentsConfig(record.components) &&
    isThemeSchemeTokens(record.light) &&
    isThemeSchemeTokens(record.dark)
  );
}

/** Forma della config v2 storica: identica alla v3 tranne i colori titolo, assenti in light/dark. */
type LegacyThemeConfigV2 = Omit<
  LegacyThemeConfigV5,
  'version' | 'navbarWidth' | 'navbarDefaultCollapsed' | 'light' | 'dark'
> & {
  version: 2;
  light: LegacySchemeTokens;
  dark: LegacySchemeTokens;
};

/** Type guard della config v2 storica, usato solo per la migrazione. */
function isLegacyThemeConfigV2(value: unknown): value is LegacyThemeConfigV2 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  return (
    record.version === 2 &&
    isOneOf(record.primaryColor, THEME_PRIMARY_SELECTIONS) &&
    Array.isArray(record.customPrimary) &&
    record.customPrimary.length === 10 &&
    record.customPrimary.every((shade) => isHexColor(shade)) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isLegacyThemeTypography(record.typography) &&
    isSizeScale(record.spacing, THEME_NUMERIC_LIMITS.spacing) &&
    isSizeScale(record.radiusScale, THEME_NUMERIC_LIMITS.radius) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size])) &&
    isThemeComponentsConfig(record.components) &&
    isLegacySchemeTokens(record.light) &&
    isLegacySchemeTokens(record.dark)
  );
}

/** Forma della config v4 storica: identica alla v5 tranne lo stile del bordo destro della sidebar. */
type LegacyThemeConfigV4 = Omit<
  LegacyThemeConfigV5,
  'version' | 'navbarEdgeStyle' | 'navbarEdgeShadowIntensity'
> & {
  version: 4;
};

/** Type guard della config v4 storica, usato solo per la migrazione. */
function isLegacyThemeConfigV4(value: unknown): value is LegacyThemeConfigV4 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const primaryShade = record.primaryShade as Record<string, unknown> | undefined;
  const gradient = record.defaultGradient as Record<string, unknown> | undefined;
  const shadows = record.shadows as Record<string, unknown> | undefined;
  return (
    record.version === 4 &&
    isNumberInRange(record.navbarWidth, THEME_NUMERIC_LIMITS.navbarWidth) &&
    typeof record.navbarDefaultCollapsed === 'boolean' &&
    isOneOf(record.primaryColor, THEME_PRIMARY_SELECTIONS) &&
    Array.isArray(record.customPrimary) &&
    record.customPrimary.length === 10 &&
    record.customPrimary.every((shade) => isHexColor(shade)) &&
    typeof primaryShade === 'object' &&
    primaryShade !== null &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.light as number) &&
    (THEME_SHADE_INDEXES as readonly number[]).includes(primaryShade.dark as number) &&
    isOneOf(record.radius, THEME_RADIUS_VALUES) &&
    isOneOf(record.focusRing, THEME_FOCUS_RING_VALUES) &&
    isOneOf(record.cursorType, THEME_CURSOR_VALUES) &&
    typeof record.respectReducedMotion === 'boolean' &&
    typeof record.autoContrast === 'boolean' &&
    isNumberInRange(record.luminanceThreshold, THEME_NUMERIC_LIMITS.luminanceThreshold) &&
    isNumberInRange(record.scale, THEME_NUMERIC_LIMITS.scale) &&
    typeof gradient === 'object' &&
    gradient !== null &&
    isHexColor(gradient.from) &&
    isHexColor(gradient.to) &&
    isNumberInRange(gradient.deg, THEME_NUMERIC_LIMITS.gradientDeg) &&
    isLegacyThemeTypography(record.typography) &&
    isSizeScale(record.spacing, THEME_NUMERIC_LIMITS.spacing) &&
    isSizeScale(record.radiusScale, THEME_NUMERIC_LIMITS.radius) &&
    typeof shadows === 'object' &&
    shadows !== null &&
    THEME_SIZE_VALUES.every((size) => isShadowSpec(shadows[size])) &&
    isThemeComponentsConfig(record.components) &&
    isThemeSchemeTokens(record.light) &&
    isThemeSchemeTokens(record.dark)
  );
}

/**
 * Accetta una config sconosciuta (cache localStorage o risposta server) e
 * restituisce un `ThemeConfig` v7 valido: le v7 passano il guard; le v6
 * storiche adottano `'px'` come unità di ogni campo dimensionale
 * (`upgradeV6ToV7`); le v5 vengono prima convertite a v6 derivando
 * `colors.primary` da `primaryColor`/`customPrimary` (gli altri 8 colori
 * semantici adottano i default) e poi upgradate a v7 allo stesso modo; le
 * v1/v2/v3/v4 vengono prima ricostruite nella forma v5 (preservando ogni
 * campo già presente e adottando i default v5 per tutto ciò che manca, come
 * in precedenza) e poi fatte passare per la stessa catena v5→v6→v7. Tutto il
 * resto è scartato (`null`).
 * @param value Valore sconosciuto da validare/migrare.
 */
export function migrateThemeConfig(value: unknown): ThemeConfig | null {
  if (isThemeConfig(value)) {
    return value;
  }
  if (isLegacyThemeConfigV6(value)) {
    return upgradeV6ToV7(value);
  }
  if (isLegacyThemeConfigV5(value)) {
    return upgradeV6ToV7(upgradeV5ToV6(value));
  }
  if (isLegacyThemeConfigV4(value)) {
    const defaults = structuredClone(LEGACY_DEFAULT_V5);
    return upgradeV6ToV7(
      upgradeV5ToV6({
        ...defaults,
        ...structuredClone(value),
        version: 5,
      }),
    );
  }
  if (isLegacyThemeConfigV3(value)) {
    const defaults = structuredClone(LEGACY_DEFAULT_V5);
    return upgradeV6ToV7(
      upgradeV5ToV6({
        ...defaults,
        ...structuredClone(value),
        version: 5,
      }),
    );
  }
  if (isLegacyThemeConfigV2(value)) {
    const defaults = structuredClone(LEGACY_DEFAULT_V5);
    return upgradeV6ToV7(
      upgradeV5ToV6({
        ...defaults,
        ...structuredClone(value),
        version: 5,
        light: { ...defaults.light, ...value.light },
        dark: { ...defaults.dark, ...value.dark },
      }),
    );
  }
  if (isLegacyThemeConfigV1(value)) {
    const defaults = structuredClone(LEGACY_DEFAULT_V5);
    return upgradeV6ToV7(
      upgradeV5ToV6({
        ...defaults,
        primaryColor: value.primaryColor,
        radius: value.radius,
        light: { ...defaults.light, ...value.light },
        dark: { ...defaults.dark, ...value.dark },
      }),
    );
  }
  return null;
}

/** Converte un hex `#rrggbb` in HSL (h 0–360, s/l 0–100). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Converte HSL (h 0–360, s/l 0–100) in hex `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const channel = (n: number): string => {
    const value = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/*
 * Scala di luminosità della palette generata: ricalca l'andamento delle
 * palette native Mantine (indice 0 = quasi bianco, 9 = molto scuro).
 */
const SHADE_LIGHTNESS_LADDER = [96, 91, 83, 74, 66, 58, 52, 47, 42, 37] as const;

/**
 * Genera le 10 sfumature di una palette custom a partire da un colore base
 * (stessa tonalità/saturazione, scala di luminosità delle palette native
 * Mantine). Nessuna dipendenza esterna; l'admin può poi rifinire ogni singola
 * sfumatura nell'Editor tema.
 * @param baseHex Colore base in formato `#rrggbb`.
 * @returns Array di 10 hex `#rrggbb` dal più chiaro al più scuro.
 */
export function generatePrimaryShades(baseHex: string): string[] {
  if (!isHexColor(baseHex)) {
    return [...DEFAULT_THEME.colors[DEFAULT_PRIMARY_COLOR]];
  }
  const { h, s } = hexToHsl(baseHex);
  return SHADE_LIGHTNESS_LADDER.map((lightness) => hslToHex(h, s, lightness));
}

/**
 * Costruisce il `cssVariablesResolver` Mantine (scheme-aware) a partire dal
 * `ThemeConfig`: unico canale con cui i token per-scheme del customizer
 * raggiungono il DOM (ADR-4 §2 — vietata ogni iniezione manuale di stili).
 * @param config Configurazione tema corrente (salvata o draft dell'editor).
 */
export function buildCssVariablesResolver(config: ThemeConfig): CSSVariablesResolver {
  return () => ({
    variables: {},
    light: buildSchemeVariables(config.light, DEFAULT_THEME_CONFIG.light),
    dark: buildSchemeVariables(config.dark, DEFAULT_THEME_CONFIG.dark),
  });
}

/**
 * Formatta un valore dimensionale in una stringa CSS secondo l'unità (v7):
 * `px`/`rem` passano dal convertitore nativo Mantine `rem()` (scale-aware,
 * rispetta lo slider "scala UI" del tema — per `rem` perché `rem()` riconosce
 * le stringhe già in `rem` e le riavvolge in `calc(... * var(--mantine-scale))`,
 * per `px` perché un numero grezzo è sempre trattato da `rem()` come pixel);
 * `em`/`%` non sono unità gestite da `rem()` e vengono emesse così come
 * inserite dall'utente — comportamento nativo del convertitore Mantine per
 * unità che non riconosce, non una scelta di questo codice: non partecipano
 * alla scala UI.
 */
function formatDimension(value: number, unit: ThemeUnit): string {
  if (unit === 'rem') {
    return rem(`${value}rem`);
  }
  if (unit === 'px') {
    return rem(value);
  }
  return `${value}${unit}`;
}

/** Larghezza sidebar formattata secondo `navbarWidthUnit`, pronta per `AppShell.navbar.width` (accetta numeri px o stringhe CSS arbitrarie). */
export function formatNavbarWidth(config: ThemeConfig): string {
  return formatDimension(config.navbarWidth, config.navbarWidthUnit);
}

/** Converte una scala di misure in una scala di stringhe CSS, secondo l'unità del gruppo. */
function buildRemScale(scale: ThemeSizeScale, unit: ThemeUnit): Record<ThemeSizeValue, string> {
  return {
    xs: formatDimension(scale.xs, unit),
    sm: formatDimension(scale.sm, unit),
    md: formatDimension(scale.md, unit),
    lg: formatDimension(scale.lg, unit),
    xl: formatDimension(scale.xl, unit),
  };
}

/** Converte le interlinee numeriche nelle stringhe attese da `theme.lineHeights`. */
function buildLineHeightScale(scale: ThemeSizeScale): Record<ThemeSizeValue, string> {
  return {
    xs: String(scale.xs),
    sm: String(scale.sm),
    md: String(scale.md),
    lg: String(scale.lg),
    xl: String(scale.xl),
  };
}

/**
 * Genera `theme.shadows`: per ogni size, se la spec è identica al default di
 * fabbrica (stesso valore numerico *e* unità `px`) viene riusata la stringa
 * nativa multi-layer di Mantine (app pixel-identical); altrimenti la stringa
 * è generata dalla spec strutturata nell'unità scelta (`shadowUnit`, mai `%`:
 * `box-shadow` non ammette percentuali).
 */
function buildShadows(
  shadows: Record<ThemeSizeValue, ThemeShadowSpec>,
  unit: ThemeLengthUnit,
): Record<ThemeSizeValue, string> {
  const result = {} as Record<ThemeSizeValue, string>;
  for (const size of THEME_SIZE_VALUES) {
    const spec = shadows[size];
    const factory = SHADOW_FACTORY_DEFAULTS[size];
    const unchanged =
      unit === 'px' &&
      spec.y === factory.y &&
      spec.blur === factory.blur &&
      spec.spread === factory.spread &&
      spec.opacity === factory.opacity;
    result[size] = unchanged
      ? DEFAULT_THEME.shadows[size]
      : `0 ${formatDimension(spec.y, unit)} ${formatDimension(spec.blur, unit)} ${formatDimension(spec.spread, unit)} rgba(0, 0, 0, ${spec.opacity})`;
  }
  return result;
}

/** Props parziali accumulate per un componente (solo knob effettivamente impostati). */
type DefaultProps = Record<string, unknown>;

/** Aggiunge un knob a `defaultProps` solo se diverso dalla sentinella `unset`. */
function setIfDefined(props: DefaultProps, key: string, value: string): void {
  if (value !== THEME_UNSET) {
    props[key] = value;
  }
}

/**
 * Traduce il blocco `components` del config in `theme.components` →
 * `defaultProps`. I knob `unset` non vengono emessi (vale il default nativo del
 * componente); i boolean combaciano coi default Mantine quando falsi, quindi
 * con i default di fabbrica il risultato è privo di effetti visivi.
 * I default `input` si applicano a TextInput/PasswordInput/Select/NumberInput;
 * `card` a Paper e Card (quindi anche alle card di login).
 */
function buildComponentOverrides(
  components: ThemeComponentsConfig,
): NonNullable<MantineThemeOverride['components']> {
  const button: DefaultProps = {};
  setIfDefined(button, 'variant', components.button.variant);
  setIfDefined(button, 'size', components.button.size);
  setIfDefined(button, 'radius', components.button.radius);

  const actionIcon: DefaultProps = {};
  setIfDefined(actionIcon, 'variant', components.actionIcon.variant);
  setIfDefined(actionIcon, 'radius', components.actionIcon.radius);

  const badge: DefaultProps = {};
  setIfDefined(badge, 'variant', components.badge.variant);
  setIfDefined(badge, 'size', components.badge.size);
  setIfDefined(badge, 'radius', components.badge.radius);

  const input: DefaultProps = {};
  setIfDefined(input, 'variant', components.input.variant);
  setIfDefined(input, 'size', components.input.size);
  setIfDefined(input, 'radius', components.input.radius);

  const card: DefaultProps = { withBorder: components.card.withBorder };
  setIfDefined(card, 'shadow', components.card.shadow);
  setIfDefined(card, 'radius', components.card.radius);
  const paper: DefaultProps = { ...card };
  setIfDefined(card, 'padding', components.card.padding);
  setIfDefined(paper, 'p', components.card.padding);

  const modal: DefaultProps = {
    centered: components.modal.centered,
    overlayProps: { blur: components.modal.overlayBlur },
  };
  setIfDefined(modal, 'radius', components.modal.radius);
  setIfDefined(modal, 'shadow', components.modal.shadow);
  setIfDefined(modal, 'padding', components.modal.padding);

  const drawer: DefaultProps = { overlayProps: { blur: components.modal.overlayBlur } };
  setIfDefined(drawer, 'padding', components.modal.padding);

  const table: DefaultProps = {
    striped: components.table.striped,
    highlightOnHover: components.table.highlightOnHover,
    withTableBorder: components.table.withTableBorder,
    withColumnBorders: components.table.withColumnBorders,
  };
  setIfDefined(table, 'verticalSpacing', components.table.verticalSpacing);

  const tooltip: DefaultProps = { withArrow: components.tooltip.withArrow };
  setIfDefined(tooltip, 'radius', components.tooltip.radius);

  const loader: DefaultProps = {};
  setIfDefined(loader, 'type', components.loader.type);

  return {
    Button: { defaultProps: button },
    ActionIcon: { defaultProps: actionIcon },
    Badge: { defaultProps: badge },
    TextInput: { defaultProps: input },
    PasswordInput: { defaultProps: input },
    Select: { defaultProps: input },
    NumberInput: { defaultProps: input },
    Paper: { defaultProps: paper },
    Card: { defaultProps: card },
    Modal: { defaultProps: modal },
    Drawer: { defaultProps: drawer },
    Table: { defaultProps: table },
    Tooltip: { defaultProps: tooltip },
    Loader: { defaultProps: loader },
  };
}

/** Clamp di un indice shade su un valore valido 0–9 per `theme.primaryShade`. */
function toColorShade(value: number): MantineColorShade {
  const clamped = Math.min(9, Math.max(0, Math.round(value)));
  // Cast sicuro: il clamp garantisce un intero 0–9, il dominio di MantineColorShade.
  return clamped as MantineColorShade;
}

/**
 * Costruisce il tema Mantine completo dal `ThemeConfig`. Le 9 voci semantiche
 * di `config.colors` diventano vere palette Mantine: `generatePrimaryShades()`
 * genera 10 sfumature da ciascun hex base, registrate in `theme.colors` sotto
 * il proprio nome (`secondary`, `accent`, `success`, …) e — per `primary` —
 * sotto la chiave storica `starterPrimary` (compatibilità con i riferimenti
 * già presenti nel progetto, vedi commento in testa al file). Tutte le altre
 * sezioni del theme object (tipografia, scale, ombre, comportamento,
 * `components`) derivano dai campi del config; con i default di fabbrica il
 * tema è identico a quello storico dell'app.
 * @param config Configurazione tema corrente (default di fabbrica se omessa).
 */
export function buildAppTheme(config: ThemeConfig = DEFAULT_THEME_CONFIG) {
  const colorsTheme: Record<string, MantineColorsTuple> = {
    // Cast sicuro: `generatePrimaryShades()` restituisce sempre 10 hex.
    starterPrimary: generatePrimaryShades(config.colors.primary) as unknown as MantineColorsTuple,
  };
  for (const name of THEME_SEMANTIC_COLOR_NAMES) {
    if (name === 'primary') continue;
    colorsTheme[name] = generatePrimaryShades(config.colors[name]) as unknown as MantineColorsTuple;
  }

  const headingSizes = {} as Record<ThemeHeadingLevel, { fontSize: string; lineHeight: string }>;
  for (const level of THEME_HEADING_LEVELS) {
    const size = config.typography.headings.sizes[level];
    headingSizes[level] = {
      fontSize: formatDimension(size.fontSize, config.typography.headings.fontSizeUnit),
      lineHeight: String(size.lineHeight),
    };
  }

  return createTheme({
    primaryColor: 'starterPrimary',
    colors: colorsTheme,
    primaryShade: {
      light: toColorShade(config.primaryShade.light),
      dark: toColorShade(config.primaryShade.dark),
    },
    fontFamily: THEME_FONT_FAMILIES[config.typography.fontFamily].stack,
    fontFamilyMonospace: THEME_MONO_FONT_FAMILIES[config.typography.fontFamilyMonospace].stack,
    fontSizes: buildRemScale(config.typography.fontSizes, config.typography.fontSizeUnit),
    lineHeights: buildLineHeightScale(config.typography.lineHeights),
    headings: {
      fontFamily: THEME_FONT_FAMILIES[config.typography.headings.fontFamily].stack,
      fontWeight: config.typography.headings.fontWeight,
      sizes: headingSizes,
    },
    spacing: buildRemScale(config.spacing, config.spacingUnit),
    radius: buildRemScale(config.radiusScale, config.radiusScaleUnit),
    defaultRadius: config.radius,
    shadows: buildShadows(config.shadows, config.shadowUnit),
    // Anello di focus fisso a 'never': non più un controllo del customizer
    // (rimosso dal pannello "Generale" su richiesta prodotto), imposto qui
    // indipendentemente dal valore salvato in `config.focusRing`.
    focusRing: 'never',
    cursorType: config.cursorType,
    respectReducedMotion: config.respectReducedMotion,
    autoContrast: config.autoContrast,
    luminanceThreshold: config.luminanceThreshold,
    scale: config.scale,
    defaultGradient: {
      from: config.defaultGradient.from,
      to: config.defaultGradient.to,
      deg: config.defaultGradient.deg,
    },
    components: buildComponentOverrides(config.components),
    // Nessun variantColorResolver custom: hover/shade del variant "filled" sono
    // quelli nativi calcolati da Mantine sulla palette attiva.
  });
}

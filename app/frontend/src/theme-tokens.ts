/**
 * Vocabolario puro del tema (ADR-4): whitelist dei font, size token, unità CSS
 * e livelli di titolo. **Nessun import di Mantine, nessun accesso al DOM.**
 *
 * Esiste separato da `theme.ts` per una ragione di confine, non di estetica:
 * `theme.ts` importa `@mantine/core` (`createTheme`, `DEFAULT_THEME`, `rem`) e
 * quindi non è importabile da `app/public-site`, che per ADR-22 § 5 non deve
 * conoscere Mantine. I due compilatori CSS condivisi fra chrome admin e sito
 * pubblico — `utils/theme-css.utils.ts` e `libs/globalTokensCompiler.ts` —
 * hanno bisogno solo di questo vocabolario: importandolo da qui, il bundle SSR
 * del sito pubblico resta privo di Mantine.
 *
 * `theme.ts` ri-esporta ogni simbolo di questo file: i call site esistenti
 * continuano a importare da `../theme` senza modifiche.
 */

/** I 5 size token nativi Mantine, usati da tutte le scale (`xs`–`xl`). */
export const THEME_SIZE_VALUES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type ThemeSizeValue = (typeof THEME_SIZE_VALUES)[number];

/**
 * Whitelist dei font stack selezionabili per testo e titoli. Nel `ThemeConfig`
 * viaggia SOLO l'ID (validato anche server-side): lo stack CSS corrispondente
 * vive esclusivamente in questa mappa, quindi nessuna stringa font arbitraria
 * può raggiungere il theme object o una variabile CSS. Tutti gli stack usano
 * font di sistema (nessun caricamento di webfont esterni).
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

/**
 * Risolve l'ID whitelisted di un font nello stack CSS reale. Unico punto di
 * traduzione ID → stack condiviso da chrome admin e sito pubblico: un ID non
 * riconosciuto (config salvata da una versione futura, risposta manomessa)
 * ricade sul font di default invece di finire verbatim in una variabile CSS.
 * @param fontId Id del font, atteso nella whitelist `THEME_FONT_FAMILIES`.
 */
export function resolveFontStack(fontId: string): string {
  const entry = THEME_FONT_FAMILIES[fontId as ThemeFontFamilyId];
  return (entry ?? THEME_FONT_FAMILIES.inter).stack;
}

/**
 * Risolve l'ID whitelisted di un font monospace nello stack CSS reale
 * (stesso principio di {@link resolveFontStack}).
 * @param fontId Id del font, atteso nella whitelist `THEME_MONO_FONT_FAMILIES`.
 */
export function resolveMonoFontStack(fontId: string): string {
  const entry = THEME_MONO_FONT_FAMILIES[fontId as ThemeMonoFontFamilyId];
  return (entry ?? THEME_MONO_FONT_FAMILIES['system-mono']).stack;
}

/**
 * Compilatore del `ThemeConfig` (Editor tema, ADR-4) in un blocco CSS di custom
 * property. È il canale con cui il tema di installazione raggiunge **il sito
 * pubblicato** (`app/public-site`, porta 55000) e l'anteprima del Canvas
 * dell'editor — non la chrome amministrativa, che resta sui default di fabbrica
 * di Mantine (`hooks/useThemeColor.tsx`). Stesso rapporto che WordPress ha col
 * proprio customizer: il tema veste il sito, non il pannello di gestione.
 *
 * Tre famiglie di variabili escono da qui, in un solo blocco:
 *   1. `--theme-*` — la superficie completa e documentata del tema (colori
 *      semantici, tipografia, scale, ombre), disponibile a qualunque CSS futuro.
 *   2. `--cms-*` — il vocabolario dei token di stile dei blocchi
 *      (`components/blocks/style-tokens.module.css`), qui **sovrascritto** coi
 *      valori del tema: è ciò che rende visibile una modifica del tema sul
 *      contenuto già salvato, senza toccarlo.
 *   3. `--eaidos-global-*` — i nomi storici dei Global Design Tokens, mantenuti
 *      perché i CSS dei blocchi li referenziano ancora come sorgente dei
 *      fallback.
 * Più una foglia di regole `h1`–`h6` avvolte in `:where()`: specificità zero,
 * così una scelta esplicita sul singolo blocco (`styleFontSize`,
 * `styleTextColor`, …) vince sempre sul default del tema.
 *
 * Nessun import di Mantine (ADR-22 § 5): il vocabolario arriva da
 * `theme-tokens.ts`. Funzione pura, nessun accesso al DOM — applicare la
 * stringa è responsabilità del chiamante.
 *
 * Sicurezza: nessun valore raggiunge il CSS senza essere stato ricontrollato
 * qui. Il `ThemeConfigDto` è già validato server-side (ADR-4 § 3), ma questo
 * modulo emette il proprio output dentro un `<style>` (`dangerouslySetInnerHTML`
 * in SSR): i colori passano dalla regex `#rrggbb`, le unità e i pesi da una
 * whitelist, i numeri da `Number.isFinite`. Un valore fuori norma ricade sul
 * default di fabbrica, non finisce verbatim nel foglio di stile.
 */
import type { components } from '../types/api.types';
import {
  THEME_FONT_WEIGHTS,
  THEME_HEADING_LEVELS,
  THEME_SIZE_VALUES,
  THEME_UNITS,
  resolveFontStack,
  resolveMonoFontStack,
  type ThemeHeadingLevel,
  type ThemeSizeValue,
} from '../theme-tokens';

export type ThemeConfigDto = components['schemas']['ThemeConfigDto'];

/** Blocco di token colore di uno dei due scheme (`light`/`dark`) del contratto. */
type ThemeSchemeTokensDto = ThemeConfigDto['light'];

/** I 9 colori semantici, nell'ordine in cui vengono emessi. */
const COLOR_TOKENS = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'alert',
  'error',
  'danger',
  'info',
] as const satisfies readonly (keyof ThemeConfigDto['colors'])[];

/** Id dell'elemento `<style>` che ospita il tema compilato (documento SSR e canvas). */
export const THEME_STYLE_TAG_ID = 'eaidos-theme-vars';

/**
 * Come rendere i due blocchi di token per-scheme del tema.
 * - `'auto'`: scheme chiaro come base, scuro sotto `prefers-color-scheme: dark`
 *   (sito pubblico — il visitatore non ha un selettore, segue il sistema);
 * - `'light'`/`'dark'`: un solo scheme, forzato (anteprima del Canvas, dove il
 *   contesto è l'editing e non la preferenza del visitatore).
 */
export type ThemeCssScheme = 'auto' | 'light' | 'dark';

/** Opzioni di compilazione: lo scope non ha default, la scelta è del chiamante. */
export interface ThemeCssOptions {
  /**
   * Selettore CSS su cui scopare le variabili. Obbligatorio e senza default
   * `:root`: è la stessa cautela di `globalTokensCompiler.ts` — uno scope
   * implicito è esattamente il modo in cui il tema del sito finirebbe per
   * ridipingere anche la chrome amministrativa che circonda il canvas.
   */
  selector: string;
  /** Resa dei due scheme (default `'auto'`). */
  scheme?: ThemeCssScheme;
  /**
   * Dipinge sfondo/colore/font di base come proprietà reali sul selettore, non
   * solo come variabili (default `true`). Senza questo le variabili restano
   * disponibili ma inapplicate: un documento senza regole proprie resterebbe
   * bianco su nero di default del browser.
   */
  paintSurface?: boolean;
}

/** Formato obbligatorio di ogni token colore del contratto (ADR-4 § 3). */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Valori di ripiego usati quando un campo del DTO non supera il ricontrollo locale. */
const FALLBACK = {
  color: '#000000',
  unit: 'px',
  size: 0,
  lineHeight: 1.5,
  opacity: 0,
  scale: 1,
  fontWeight: '700',
} as const;

/** Restituisce l'hex se è nel formato `#rrggbb`, altrimenti il nero di ripiego. */
function safeColor(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value) ? value : FALLBACK.color;
}

/** Restituisce l'unità se è nella whitelist del contratto, altrimenti `px`. */
function safeUnit(value: unknown): string {
  return THEME_UNITS.includes(value as (typeof THEME_UNITS)[number])
    ? (value as string)
    : FALLBACK.unit;
}

/** Restituisce il numero se è finito, altrimenti il ripiego indicato. */
function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Compone `numero + unità`, entrambi già ricontrollati — mai una stringa libera. */
function dimension(value: unknown, unit: unknown): string {
  return `${safeNumber(value, FALLBACK.size)}${safeUnit(unit)}`;
}

/** Peso dei titoli, ristretto alla whitelist del contratto. */
function safeFontWeight(value: unknown): string {
  return THEME_FONT_WEIGHTS.includes(value as (typeof THEME_FONT_WEIGHTS)[number])
    ? (value as string)
    : FALLBACK.fontWeight;
}

/** Scompone un hex `#rrggbb` già validato nelle tre componenti 0–255. */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Miscela due hex e restituisce un hex. Serve per i pochi token dei blocchi che
 * non hanno un equivalente diretto nel tema (`--cms-bg-accent`, uno sfondo
 * tenue del colore d'accento): il valore è calcolato qui, non delegato a
 * `color-mix()` in CSS, così l'output resta un hex ordinario e non dipende dal
 * supporto del browser.
 * @param from Colore da miscelare (hex `#rrggbb`).
 * @param over Colore di fondo su cui miscelarlo (hex `#rrggbb`).
 * @param ratio Quota di `from` nella miscela, 0–1.
 */
function mixHex(from: string, over: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(over);
  const channel = (a: number, b: number): string =>
    Math.round(a * ratio + b * (1 - ratio))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** Ombra CSS generata dalla spec strutturata — l'admin non scrive mai una `box-shadow` libera. */
function shadow(spec: ThemeConfigDto['shadows']['xs'], unit: unknown): string {
  const opacity = Math.min(Math.max(safeNumber(spec?.opacity, FALLBACK.opacity), 0), 1);
  return `0 ${dimension(spec?.y, unit)} ${dimension(spec?.blur, unit)} ${dimension(spec?.spread, unit)} rgba(0, 0, 0, ${opacity})`;
}

/** Una dichiarazione CSS indentata, pronta per essere unita al blocco. */
function decl(name: string, value: string): string {
  return `  ${name}: ${value};`;
}

/**
 * Variabili che non dipendono dallo scheme: colori semantici, tipografia,
 * scale di spaziatura/raggi/ombre, più il ponte verso il vocabolario dei
 * blocchi (`--cms-*`, `--eaidos-global-*`) per le voci non cromatiche.
 */
function schemeIndependentDeclarations(config: ThemeConfigDto): string[] {
  const { colors, typography, spacing, radiusScale, shadows } = config;
  const fontStack = resolveFontStack(typography.fontFamily);
  const headingStack = resolveFontStack(typography.headings.fontFamily);
  const monoStack = resolveMonoFontStack(typography.fontFamilyMonospace);
  const headingWeight = safeFontWeight(typography.headings.fontWeight);

  const out: string[] = [];

  // 1. Superficie `--theme-*`.
  for (const token of COLOR_TOKENS) {
    out.push(decl(`--theme-${token}`, safeColor(colors[token])));
  }
  out.push(decl('--theme-font-family', fontStack));
  out.push(decl('--theme-font-family-headings', headingStack));
  out.push(decl('--theme-font-family-monospace', monoStack));
  out.push(decl('--theme-heading-weight', headingWeight));
  out.push(decl('--theme-scale', String(safeNumber(config.scale, FALLBACK.scale))));

  for (const size of THEME_SIZE_VALUES) {
    out.push(
      decl(
        `--theme-font-size-${size}`,
        dimension(typography.fontSizes[size], typography.fontSizeUnit),
      ),
    );
    out.push(
      decl(
        `--theme-line-height-${size}`,
        String(safeNumber(typography.lineHeights[size], FALLBACK.lineHeight)),
      ),
    );
    out.push(decl(`--theme-spacing-${size}`, dimension(spacing[size], config.spacingUnit)));
    out.push(decl(`--theme-radius-${size}`, dimension(radiusScale[size], config.radiusScaleUnit)));
    out.push(decl(`--theme-shadow-${size}`, shadow(shadows[size], config.shadowUnit)));
  }

  for (const level of THEME_HEADING_LEVELS) {
    const heading = typography.headings.sizes[level];
    out.push(
      decl(`--theme-${level}-size`, dimension(heading.fontSize, typography.headings.fontSizeUnit)),
    );
    out.push(
      decl(
        `--theme-${level}-line-height`,
        String(safeNumber(heading.lineHeight, FALLBACK.lineHeight)),
      ),
    );
  }

  // 2. Ponte verso i token dei blocchi — voci non cromatiche.
  out.push(decl('--eaidos-global-color-primary', safeColor(colors.primary)));
  out.push(decl('--eaidos-global-color-secondary', safeColor(colors.secondary)));
  out.push(decl('--eaidos-global-color-accent', safeColor(colors.accent)));
  out.push(decl('--eaidos-global-font-main', fontStack));
  out.push(decl('--eaidos-global-spacing-unit', dimension(spacing.xs, config.spacingUnit)));

  out.push(decl('--cms-font-family-default', fontStack));
  out.push(decl('--cms-font-family-monospace', monoStack));
  out.push(
    decl('--cms-line-height', String(safeNumber(typography.lineHeights.md, FALLBACK.lineHeight))),
  );
  out.push(decl('--cms-text-color-accent', safeColor(colors.accent)));
  out.push(decl('--cms-button-bg', safeColor(colors.primary)));

  // Le quattro misure dei blocchi (`sm`–`xl`) mappano 1:1 la scala del tema.
  for (const size of ['sm', 'md', 'lg', 'xl'] as const satisfies readonly ThemeSizeValue[]) {
    out.push(
      decl(
        `--cms-font-size-${size}`,
        dimension(typography.fontSizes[size], typography.fontSizeUnit),
      ),
    );
  }
  for (const size of THEME_SIZE_VALUES) {
    out.push(decl(`--cms-space-${size}`, dimension(spacing[size], config.spacingUnit)));
    out.push(decl(`--cms-radius-${size}`, dimension(radiusScale[size], config.radiusScaleUnit)));
  }
  for (const size of ['sm', 'md', 'lg'] as const satisfies readonly ThemeSizeValue[]) {
    out.push(decl(`--cms-padding-${size}`, dimension(spacing[size], config.spacingUnit)));
  }

  return out;
}

/**
 * Variabili dipendenti dallo scheme: i token colore di `light`/`dark` e la
 * parte cromatica del ponte verso i blocchi (testo, sfondi, inverso).
 * @param tokens Blocco `light` o `dark` del contratto.
 * @param accent Colore d'accento già ricontrollato (serve allo sfondo tenue).
 */
function schemeDeclarations(tokens: ThemeSchemeTokensDto, accent: string): string[] {
  const pageBg = safeColor(tokens.pageBg);
  const cardBg = safeColor(tokens.cardBg);
  const textPrimary = safeColor(tokens.textPrimary);
  const textSecondary = safeColor(tokens.textSecondary);

  const out = [
    decl('--theme-page-bg', pageBg),
    decl('--theme-card-bg', cardBg),
    decl('--theme-card-border', safeColor(tokens.cardBorder)),
    decl('--theme-text-primary', textPrimary),
    decl('--theme-text-secondary', textSecondary),
  ];

  for (const level of THEME_HEADING_LEVELS) {
    // I token dei titoli sono nominati `headingH1`…`headingH6` nel contratto.
    const key = `heading${level.toUpperCase()}` as keyof ThemeSchemeTokensDto;
    out.push(decl(`--theme-heading-${level}`, safeColor(tokens[key])));
  }

  // Ponte cromatico verso i token dei blocchi. `inverse` non ha un token
  // dedicato nel tema: è la coppia sfondo/testo rovesciata (testo principale
  // come sfondo, sfondo pagina come testo), che resta leggibile per
  // costruzione in entrambi gli scheme.
  out.push(decl('--eaidos-global-color-text', textPrimary));
  out.push(decl('--cms-text-color-default', textPrimary));
  out.push(decl('--cms-text-color-muted', textSecondary));
  out.push(decl('--cms-text-color-inverse', pageBg));
  out.push(decl('--cms-bg-subtle', cardBg));
  out.push(decl('--cms-bg-accent', mixHex(accent, pageBg, 0.12)));
  out.push(decl('--cms-bg-inverse', textPrimary));

  return out;
}

/** Dichiarazioni "reali" (non variabili) che dipingono la superficie del selettore. */
const SURFACE_DECLARATIONS = [
  decl('background-color', 'var(--theme-page-bg)'),
  decl('color', 'var(--theme-text-primary)'),
  decl('font-family', 'var(--theme-font-family)'),
  decl('font-size', 'var(--theme-font-size-md)'),
  decl('line-height', 'var(--theme-line-height-md)'),
];

/**
 * Regole di default dei titoli `h1`–`h6`, avvolte in `:where()`: specificità
 * zero. È la parte che rende visibile la sezione "Tipografia" dell'Editor tema
 * sul contenuto — e allo stesso tempo garantisce che **qualunque** classe di
 * stile del blocco (`styleFontSize`, `styleTextColor`, `styleFontFamily`,
 * generate da `style-tokens.module.css` con specificità 0,1,0) vinca sempre su
 * questo default, senza bisogno di `!important` da nessuna delle due parti.
 * @param selector Scope di compilazione.
 */
function headingRules(selector: string): string {
  return THEME_HEADING_LEVELS.map(
    (level: ThemeHeadingLevel) => `:where(${selector}) ${level} {
${[
  decl('font-family', 'var(--theme-font-family-headings)'),
  decl('font-weight', 'var(--theme-heading-weight)'),
  decl('font-size', `var(--theme-${level}-size)`),
  decl('line-height', `var(--theme-${level}-line-height)`),
  decl('color', `var(--theme-heading-${level})`),
].join('\n')}
}`,
  ).join('\n');
}

/** Avvolge un elenco di dichiarazioni in una regola CSS sul selettore dato. */
function rule(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.join('\n')}\n}`;
}

/**
 * Compila il `ThemeConfig` corrente nel blocco CSS da iniettare in un `<style>`.
 * Funzione pura: nessun accesso al DOM, nessun side effect.
 * @param config Configurazione tema (dal server o draft dell'editor).
 * @param options Scope, resa degli scheme, dipintura della superficie.
 */
export function generateThemeCss(config: ThemeConfigDto, options: ThemeCssOptions): string {
  const { selector, scheme = 'auto', paintSurface = true } = options;
  const accent = safeColor(config.colors.accent);

  const base = [
    ...schemeIndependentDeclarations(config),
    ...schemeDeclarations(scheme === 'dark' ? config.dark : config.light, accent),
    ...(paintSurface ? SURFACE_DECLARATIONS : []),
  ];

  const blocks = [rule(selector, base)];

  if (scheme === 'auto') {
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n${rule(
        selector,
        schemeDeclarations(config.dark, accent),
      )}\n}`,
    );
  }

  blocks.push(headingRules(selector));

  return blocks.join('\n');
}

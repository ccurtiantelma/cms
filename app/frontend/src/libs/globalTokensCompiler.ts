/**
 * Compilatore dei "Global Design Tokens" (F04, step 1) — un pugno di token di brand
 * a livello di sito (palette, font base, unità di spaziatura) esposti come custom
 * property CSS al **canvas** dell'editor e, in futuro, al rendering pubblico dei
 * blocchi. Concetto separato e non sovrapposto al Global Theme Customizer (ADR-4,
 * `theme.ts`/`useThemeColor.tsx`): quello governa il tema Mantine della chrome
 * amministrativa, questo governa variabili consumate dai componenti di blocco, che
 * per convenzione di progetto non importano mai Mantine (CLAUDE.md § Frontend
 * Developer — "confine UI ↔ contenuto").
 *
 * Nessun accesso al DOM qui dentro: `compileTokensToCss` è una funzione pura,
 * facile da testare in isolamento. Chi applica la stringa CSS al documento (store,
 * componente canvas) vive altrove.
 *
 * Sicurezza: nessuna stringa libera raggiunge mai il CSS generato. I colori sono
 * vincolati dal tipo a hex `#rrggbb` (stesso principio di `theme.ts` ADR-4 §3), il
 * font è un ID della whitelist `THEME_FONT_FAMILIES` già usata dal Theme Customizer
 * (nessuna mappa duplicata), e i valori dimensionali sono coppie numero+unità già
 * validate a monte, non stringhe libere concatenate.
 */
import { THEME_FONT_FAMILIES, type ThemeFontFamilyId, type ThemeUnit } from '../theme';

/** Le 4 voci della palette di brand esposta ai blocchi. */
export interface GlobalTokensPalette {
  /** Colore primario di brand (hex `#rrggbb`). */
  primary: string;
  /** Colore secondario di brand (hex `#rrggbb`). */
  secondary: string;
  /** Colore testo di base (hex `#rrggbb`). */
  text: string;
  /** Colore di accento (hex `#rrggbb`). */
  accent: string;
}

/** Un valore dimensionale già validato: numero + unità CSS, mai una stringa libera. */
export interface GlobalTokensDimension {
  /** Valore numerico, nell'unità di `unit`. */
  value: number;
  /** Unità CSS del valore — sottoinsieme di `ThemeUnit` privo di `%` (non ha senso per un font-size/spacing di base a sé stante). */
  unit: 'px' | 'em' | 'rem';
}

/** Blocco tipografico dei global token: solo il font di base e la sua dimensione. */
export interface GlobalTokensTypography {
  /** Font di base (ID della whitelist `THEME_FONT_FAMILIES` — stessa fonte del Theme Customizer). */
  mainFont: ThemeFontFamilyId;
  /** Dimensione di base del testo. */
  baseSize: GlobalTokensDimension;
}

/** Blocco di spaziatura dei global token: una singola unità di base da cui i blocchi derivano i propri multipli. */
export interface GlobalTokensSpacing {
  /** Unità di spaziatura di base. */
  baseUnit: GlobalTokensDimension;
}

/**
 * I Global Design Tokens del sito: superficie minima dello step 1 (palette,
 * font di base, unità di spaziatura di base). Nessuna persistenza né UI qui —
 * solo la forma dati e la sua compilazione in CSS.
 */
export interface GlobalTokens {
  palette: GlobalTokensPalette;
  typography: GlobalTokensTypography;
  spacing: GlobalTokensSpacing;
}

/** Id dell'elemento `<style>` che ospita le variabili compilate (documento principale e/o canvas). */
export const GLOBAL_TOKENS_STYLE_TAG_ID = 'eaidos-global-tokens';

/**
 * Classe stabile (non un hash di CSS Module) che marca l'elemento radice del Canvas
 * dell'editor (`EditorCanvas.tsx`). È il selettore su cui `compileTokensToCss` scopa le
 * custom property: mai `:root`, altrimenti i Global Design Tokens (pensati per
 * l'anteprima del contenuto) trapelerebbero nella chrome amministrativa che circonda il
 * canvas (sidebar, toolbar, pannelli), che ha una propria fonte di verità cromatica —
 * il Global Theme Customizer (ADR-4, `theme.ts`/`useThemeColor.tsx`). Una singola
 * costante condivisa fra `EditorCanvas.tsx` (className) e questo modulo (selettore)
 * evita che le due stringhe divergano in silenzio.
 */
export const GLOBAL_TOKENS_CANVAS_SCOPE_CLASS = 'eaidos-canvas-theme-scope';

/** Emette `value + unit` per un valore dimensionale già tipizzato — mai una stringa libera. */
function formatDimension(dimension: GlobalTokensDimension): string {
  return `${dimension.value}${dimension.unit}`;
}

/**
 * Risolve l'ID whitelisted di un font nella stringa di font-stack CSS reale,
 * riusando `THEME_FONT_FAMILIES` (unica fonte di verità, già usata dal Theme
 * Customizer — nessuna mappa duplicata qui).
 * @param fontId Id whitelisted del font (es. `'inter'`).
 */
function resolveFontStack(fontId: ThemeFontFamilyId): string {
  return THEME_FONT_FAMILIES[fontId].stack;
}

/**
 * Compila i Global Design Tokens in un blocco CSS con le custom property consumate dal
 * canvas dell'editor e dal rendering pubblico dei blocchi. Funzione pura:
 * nessun accesso al DOM, nessun side effect — la stringa risultante va applicata da chi
 * possiede il riferimento al documento (vedi `applyGlobalTokensToDocument` in
 * `useBlockEditorStore.ts`).
 *
 * Oltre alle custom property, il blocco dipinge `color`/`font-family` come proprietà
 * reali sul selettore: senza questo, le variabili restano disponibili ma inapplicate — un
 * blocco che non seleziona esplicitamente "default" nel proprio `styleTextColor` erediterebbe
 * il nero di default del browser invece del colore di brand. Ereditate per cascata da ogni
 * discendente, e sovrascritte senza conflitto da qualunque classe dei blocchi che imposta
 * `color` esplicitamente (`style-tokens.module.css`, es. `styleTextColor: 'accent'`).
 *
 * `selector` è obbligatorio e non ha un default `:root`: la scelta dello scope è
 * responsabilità esplicita del chiamante, non un'assunzione di questa funzione — un
 * `:root` implicito qui è esattamente il modo in cui i token del contenuto finirebbero
 * per governare anche la chrome amministrativa attorno al canvas.
 * @param tokens Configurazione corrente dei Global Design Tokens.
 * @param selector Selettore CSS su cui scopare le custom property (es.
 *   `.${GLOBAL_TOKENS_CANVAS_SCOPE_CLASS}` per il canvas dell'editor).
 */
export function compileTokensToCss(tokens: GlobalTokens, selector: string): string {
  const { palette, typography, spacing } = tokens;
  return `${selector} {
  --eaidos-global-color-primary: ${palette.primary};
  --eaidos-global-color-secondary: ${palette.secondary};
  --eaidos-global-color-text: ${palette.text};
  --eaidos-global-color-accent: ${palette.accent};
  --eaidos-global-font-main: ${resolveFontStack(typography.mainFont)};
  --eaidos-global-spacing-unit: ${formatDimension(spacing.baseUnit)};
  color: var(--eaidos-global-color-text);
  font-family: var(--eaidos-global-font-main);
}`;
}

/** Ridondante con `GlobalTokensDimension['unit']`, riesportato per i consumer che validano input utente. */
export const GLOBAL_TOKENS_DIMENSION_UNITS = ['px', 'em', 'rem'] as const satisfies readonly ThemeUnit[];

/** Default di fabbrica dei Global Design Tokens — usati finché l'admin non li personalizza (nessuna UI in questo step). */
export const DEFAULT_GLOBAL_TOKENS: GlobalTokens = {
  palette: {
    primary: '#1c7ed6',
    secondary: '#495057',
    text: '#212529',
    accent: '#f76707',
  },
  typography: {
    mainFont: 'inter',
    baseSize: { value: 16, unit: 'px' },
  },
  spacing: {
    baseUnit: { value: 8, unit: 'px' },
  },
};

/**
 * Descrittori di prop per il registro dei Blocchi (ADR-21 § 2/§ 4,
 * SPEC-F02-blocchi.md § 3.7). Un solo interprete (`validator/`) li legge per
 * validare qualunque albero — nessuna classe `class-validator` per tipo.
 */

/**
 * Insieme **chiuso** dei `kind` di prop: è anche il contratto di
 * sanitizzazione (ADR-21 § 4). Estenderlo è "nuovo schema di blocco" ai fini
 * di `CLAUDE.md` § Ask first — richiede firma, non si aggiunge qui.
 */
export type PropKind =
  | 'richText'
  | 'plainText'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'mediaRef'
  | 'color'
  | 'unitValue'
  | 'border'
  | 'shadow'
  | 'cssClassName'
  | 'htmlId';

/**
 * Campi comuni a ogni descrittore di prop. `default` non compare mai su una
 * prop `required: true` (SPEC-F02 § 3: «un default su una prop obbligatoria
 * significa che non è obbligatoria») — il registro dei cinque tipi del primo
 * rilascio non lo usa affatto, ma resta disponibile per props opzionali
 * future.
 */
interface BasePropSpec {
  /** `true` se la chiave deve essere presente in `props` (SPEC-F02 § 3). */
  required: boolean;
  /** Valore di default, ammesso solo su prop non obbligatoria. */
  default?: unknown;
}

/**
 * Rich text: sanitizzato con un profilo **nominato** (ADR-21 § 4). Il
 * profilo è dichiarato dalla prop, non dal tipo di blocco. `maxLength` è in
 * code point, verificato sul valore sanitizzato (SPEC-F02 § 1.4) — la
 * sanitizzazione vera e propria è T3, fuori scope per questo modulo.
 */
export interface RichTextPropSpec extends BasePropSpec {
  kind: 'richText';
  profile: 'inline' | 'basic';
  maxLength?: number;
}

/**
 * Testo semplice: nessun HTML, nessuno escaping alla persistenza — conservato
 * verbatim (ADR-21 § 4). `nonEmpty` è il vincolo di non-vuoto dopo `trim`,
 * usato **solo** da `image.alt` nel primo rilascio (SPEC-F02 § 3, unico caso
 * con `reason: 'empty'`).
 */
export interface PlainTextPropSpec extends BasePropSpec {
  kind: 'plainText';
  maxLength?: number;
  nonEmpty?: boolean;
}

/**
 * Numero. `min`/`max` sono opzionali (ADR-47 § "Decisione": primo uso reale
 * con intervallo dichiarato è `section.styleOverlayOpacity`, `0 ≤ x ≤ 1`) —
 * assenti, nessun vincolo di range è applicato, comportamento invariato per
 * ogni prop `number` precedente. Il `reason: 'range'` di `BLOCK_PROP_INVALID`
 * è già nell'insieme chiuso (ADR-38 § 2/§ 3/§ 4, per `unitValue`/`border`/
 * `shadow`): questo descrittore lo riusa, non ne introduce uno nuovo.
 */
export interface NumberPropSpec extends BasePropSpec {
  kind: 'number';
  min?: number;
  max?: number;
}

/** Booleano. Nessuna prop dei cinque tipi del primo rilascio lo usa (SPEC-F02 § 3.7). */
export interface BooleanPropSpec extends BasePropSpec {
  kind: 'boolean';
}

/**
 * Nomi di breakpoint ammessi per una prop `responsive` (ADR-29 § 2): elenco
 * **chiuso**, dichiarato una volta nel backend. `default` è l'unica chiave
 * obbligatoria dentro l'oggetto — è il valore che vale ovunque non sia
 * sovrascritto, non "il valore desktop".
 */
export const RESPONSIVE_BREAKPOINTS = ['default', 'tablet', 'mobile'] as const;

/** Uno dei tre nomi di `RESPONSIVE_BREAKPOINTS`. */
export type ResponsiveBreakpointName = (typeof RESPONSIVE_BREAKPOINTS)[number];

/**
 * Valore da un elenco chiuso di stringhe ammesse. `responsive: true` (ADR-29
 * § 3) cambia solo la **forma** del valore atteso — da scalare a
 * `{ default, tablet?, mobile? }` — mai il `kind`: resta `enum`, quindi il
 * contratto di sanitizzazione di ADR-21 § 4 non cambia.
 */
export interface EnumPropSpec extends BasePropSpec {
  kind: 'enum';
  values: readonly string[];
  /** `true` = il valore è un oggetto per breakpoint, non uno scalare (ADR-29 § 2/§ 3). */
  responsive?: boolean;
}

/**
 * URL: schemi ammessi `http`/`https`/`mailto`, root-relative con una sola
 * barra iniziale (SPEC-F02 § 3.6). Nessuna `sanitize-html`: è validazione di
 * schema, non HTML (ADR-21 § 4).
 */
export interface UrlPropSpec extends BasePropSpec {
  kind: 'url';
  maxLength?: number;
}

/**
 * Riferimento a un file della media library: solo forma di `guid` (16 hex),
 * nessuna verifica di esistenza — la risoluzione è di F09 (SPEC-F02 § 3.5).
 */
export interface MediaRefPropSpec extends BasePropSpec {
  kind: 'mediaRef';
}

/**
 * Colore libero (ADR-33 § 3), primo uso reale di questo `kind`. Validato da
 * un pattern **fisso e stretto**, non un campo `pattern` generico riusabile
 * altrove: solo esadecimale a 3 o 6 cifre, niente `rgb()`/`hsl()`/`url()`/
 * parole chiave CSS — la superficie di validazione resta un letterale di
 * colore, mai una forma che assomigli a CSS eseguibile. Non responsive in
 * questo round.
 */
export interface ColorPropSpec extends BasePropSpec {
  kind: 'color';
  default?: string;
}

/**
 * Unità di misura ammesse per `kind: 'unitValue'` (ADR-38 § 2). Elenco chiuso
 * di stringhe: nessuna unità fuori da questo insieme è mai valida, a
 * prescindere da `units` dichiarato dalla singola prop.
 */
export type LengthUnit = 'px' | '%' | 'em' | 'rem' | 'vw' | 'vh';

/**
 * Valore composto libero ma **vincolato** (ADR-38 § 2, RFC-38 § 2): primo
 * `kind` a valore oggetto del registro. `value` non è mai libero — deve
 * cadere dentro `[min, max]` dichiarati dalla prop stessa (ADR-29 § 1: "un
 * token, mai una misura" — qui la misura è ammessa solo perché ha un
 * intervallo dichiarato, non perché è tornata libera). `units` è l'elenco
 * chiuso ammesso per quella prop, sottoinsieme di `LengthUnit`. `min`/`max`
 * si applicano allo stesso modo a qualunque unità in `units` — una
 * semplificazione dichiarata (nessun intervallo per-unità), non un difetto
 * silenzioso.
 */
export interface UnitValuePropSpec extends BasePropSpec {
  kind: 'unitValue';
  units: readonly LengthUnit[];
  min: number;
  max: number;
  default?: { value: number; unit: LengthUnit };
}

/** Stile del tratto per `kind: 'border'` — elenco chiuso, come ogni altro enum del registro. */
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'none';

/**
 * Bordo a forma fissa (ADR-38 § 3): 4 campi, nessuno libero.
 * `width`/`radius` sono vincolati da intervalli **fissi nel validator**
 * (0–12 e 0–48, unità implicita px), non configurabili dalla prop — a
 * differenza di `unitValue`, qui non serve un intervallo per prop perché
 * esiste un solo uso sensato (spessore/raggio di un bordo). `color` riusa lo
 * stesso `HEX_COLOR_PATTERN` di `kind: 'color'` (ADR-33 § 3), non un pattern
 * proprio.
 */
export interface BorderPropSpec extends BasePropSpec {
  kind: 'border';
  default?: { width: number; style: BorderStyle; color: string; radius: number };
}

/**
 * Ombra (box/text) a forma fissa (ADR-38 § 4): 5 campi, tutti con intervallo
 * **fisso nel validator**, non configurabile — stessa scelta di `border` e
 * per lo stesso motivo (un solo uso sensato, nessun bisogno di un intervallo
 * per prop). Unità implicita px.
 */
export interface ShadowPropSpec extends BasePropSpec {
  kind: 'shadow';
  default?: { x: number; y: number; blur: number; spread: number; color: string };
}

/**
 * Nome/i di classe CSS custom (ADR-38 § 5). Pattern **fisso e stretto**,
 * stesso principio di `kind: 'color'` (riga ~118): non un campo `pattern`
 * generico configurabile dal registro — quello sarebbe esso stesso una
 * superficie da validare come sicura (RFC-38, "Alternative valutate"). 1–3
 * token spazio-separati, ciascuno `^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$`, somma
 * ≤ 100 caratteri.
 */
export interface CssClassNamePropSpec extends BasePropSpec {
  kind: 'cssClassName';
}

/**
 * Identificativo HTML custom (ADR-38 § 5). Stesso pattern fisso di
 * `cssClassName`, ma un solo token, ≤ 50 caratteri — mai una lista.
 */
export interface HtmlIdPropSpec extends BasePropSpec {
  kind: 'htmlId';
}

/** Unione discriminata su `kind` di tutti i descrittori di prop ammessi. */
export type PropSpec =
  | RichTextPropSpec
  | PlainTextPropSpec
  | NumberPropSpec
  | BooleanPropSpec
  | EnumPropSpec
  | UrlPropSpec
  | MediaRefPropSpec
  | ColorPropSpec
  | UnitValuePropSpec
  | BorderPropSpec
  | ShadowPropSpec
  | CssClassNamePropSpec
  | HtmlIdPropSpec;

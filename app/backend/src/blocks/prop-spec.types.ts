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
  'richText' | 'plainText' | 'number' | 'boolean' | 'enum' | 'url' | 'mediaRef' | 'color';

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
 * Numero. Nessuna prop dei cinque tipi del primo rilascio lo usa
 * (SPEC-F02 § 3.7). Nessun vincolo di intervallo: l'insieme chiuso dei
 * `reason` di `BLOCK_PROP_INVALID` (SPEC-F02 § 4.1) non ne prevede uno per un
 * range numerico, quindi il descrittore non lo dichiara — aggiungerlo
 * richiederebbe un nuovo `reason` e quindi una revisione della spec.
 */
export interface NumberPropSpec extends BasePropSpec {
  kind: 'number';
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

/** Unione discriminata su `kind` di tutti i descrittori di prop ammessi. */
export type PropSpec =
  | RichTextPropSpec
  | PlainTextPropSpec
  | NumberPropSpec
  | BooleanPropSpec
  | EnumPropSpec
  | UrlPropSpec
  | MediaRefPropSpec
  | ColorPropSpec;

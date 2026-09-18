/**
 * Descrittori di prop per il registro dei Blocchi (ADR-21 § 2/§ 4,
 * SPEC-F02-blocchi.md § 3.7). Un solo interprete (`validator/`) li legge per
 * validare qualunque albero — nessuna classe `class-validator` per tipo.
 */

/**
 * Insieme **chiuso** dei `kind` di prop: è anche il contratto di
 * sanitizzazione (ADR-21 § 4). Estenderlo è "nuovo schema di blocco" ai fini
 * di `CLAUDE.md` § Ask first — richiede firma, non si aggiunge qui. Include
 * `pageRef` (ADR-52 § 3): stessa forma di `mediaRef` ma semantica distinta
 * (una Pagina ha stato di pubblicazione, un file no), firmata a sé. Include
 * `globalSectionRef` (ADR-55 § 1): stessa forma di `pageRef`/`mediaRef` (16
 * hex, nessuna verifica di esistenza/stato a scrittura), semantica distinta
 * perché il bersaglio è una riga `global_sections`, non una Pagina o un file.
 *
 * I nove `kind` da `colorRef` a `filter` sono l'estensione **PropKind v2**
 * firmata con ADR-74/ADR-75/ADR-76/ADR-77 (round R0 "parità Elementor Pro",
 * 2026-09-17) e dettagliata in `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`
 * (dettaglio implementativo di `docs/SPEC-propkind-v2.md` § 3.1–3.9): nessun
 * `kind` v1 esistente cambia forma o comportamento, unione additiva soltanto.
 *
 * I nove `kind` da `layout` a `shapeDivider` sono l'estensione **Container
 * v2** del round R2 "parità Elementor Pro" (ADR-81/ADR-82, 2026-09-17,
 * Sub-Task S1.4): `layout`/`background`/`link`/`animation`/`motion`/
 * `attributes`/`css`/`hideOn` sono gli 8 `kind` dichiarati esplicitamente da
 * `docs/SPEC-propkind-v2.md` § 3.7/§ 3.10-3.15/§ 4.1. `shapeDivider` non è
 * elencato lì: è una scelta di design di questo Sub-Task (ADR-82 §
 * "Decisione" punto 1 lascia esplicitamente aperta l'implementazione di
 * `shapeDividerTop`/`shapeDividerBottom`, "fissata nell'implementazione R2
 * T6") — un `kind` composito dedicato, non un oggetto libero, per coerenza
 * con il resto del registro (stesso principio di `radius`/`gradient`):
 * segnalato come scelta esplicita nel resoconto finale del Sub-Task.
 */
export type PropKind =
  | 'richText'
  | 'plainText'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'mediaRef'
  | 'pageRef'
  | 'globalSectionRef'
  | 'color'
  | 'unitValue'
  | 'border'
  | 'shadow'
  | 'cssClassName'
  | 'htmlId'
  | 'colorRef'
  | 'fontRef'
  | 'typography'
  | 'spacing'
  | 'radius'
  | 'gradient'
  | 'position'
  | 'transform'
  | 'filter'
  | 'layout'
  | 'background'
  | 'link'
  | 'animation'
  | 'motion'
  | 'attributes'
  | 'css'
  | 'hideOn'
  | 'shapeDivider';

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
  /**
   * Modificatore d'envelope (ADR-75 § "Decisione"): `true` cambia la forma
   * del valore atteso da scalare a `{ normal, hover?, focus?, active? }`,
   * mai il `kind`. Combinabile con `responsive` (già presente sui `kind` che
   * lo dichiarano, es. `EnumPropSpec`): l'ordine di nidificazione è sempre
   * **stato → breakpoint → valore**, mai il contrario. Un `kind` che non
   * dichiara mai `stateful` in un blocco (`fontRef`, `spacing`, `radius`,
   * `gradient`, ADR-75 § "Decisione" punto 6) semplicemente non lo espone nel
   * proprio `BlockDefinition`: il campo esiste qui per ogni `PropSpec`, il
   * validatore lo ignora se il `kind` sottostante non lo supporta.
   */
  stateful?: boolean;
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
 * Nomi di breakpoint ammessi per una prop `responsive` (ADR-29 § 2, esteso da
 * ADR-76 § "Decisione" punto 1/2 al Sub-Task S1.3): elenco **chiuso**,
 * dichiarato una volta nel backend, dei 7 viewport Elementor-compatibili
 * (`default, widescreen, laptop, tabletExtra, tablet, mobileExtra, mobile`),
 * nell'ordine dal più largo al più stretto (`widescreen` esclusa dalla
 * cascata, ADR-76 § "Decisione" punto 3) — lo stesso ordine è quello richiesto
 * da `toCss()` (SPEC-PROPKIND-V2-DETAILS.md § 10 punto 3). `default` è
 * l'unica chiave sempre attiva e priva di soglia — è il valore che vale
 * ovunque non sia sovrascritto, non "il valore desktop". Da ADR-76 § "Decisione"
 * punto 5: questo elenco resta l'unione chiusa dei nomi *possibili*; quali
 * siano *attivi* per il sito corrente è un dato letto a runtime da
 * `resolveActiveBreakpoints()` sotto, non da questa costante da sola — una
 * chiave nota ma disattivata non è un errore di validazione.
 */
export const RESPONSIVE_BREAKPOINTS = [
  'default',
  'widescreen',
  'laptop',
  'tabletExtra',
  'tablet',
  'mobileExtra',
  'mobile',
] as const;

/** Uno dei 7 nomi di `RESPONSIVE_BREAKPOINTS`. */
export type ResponsiveBreakpointName = (typeof RESPONSIVE_BREAKPOINTS)[number];

/**
 * Configurazione di attivazione/soglia di un breakpoint non-`default`
 * (ADR-76 § "Decisione" punto 1): `widescreen` porta `minWidth`, le altre 5
 * chiavi portano `maxWidth`. Il valore resta salvato anche quando
 * `active: false` (ADR-76 § "Decisione" punto 4: "disattivare non cancella il
 * dato") — è `resolveActiveBreakpoints()` a filtrarlo, mai un `DELETE`.
 */
export interface BreakpointConfig {
  active: boolean;
  maxWidth?: number;
  minWidth?: number;
}

/**
 * Schema di `app_settings.breakpoints` (ADR-76 § "Decisione" punto 1): `default`
 * non ha configurazione propria (sempre attivo, nessuna soglia) — presente qui
 * solo per simmetria di forma con le altre 6 chiavi, il suo contenuto non è
 * mai letto da `resolveActiveBreakpoints()`. Le altre 6 chiavi sono
 * `BreakpointConfig`.
 */
export interface BreakpointsValue {
  default: Record<string, never>;
  widescreen: BreakpointConfig;
  laptop: BreakpointConfig;
  tabletExtra: BreakpointConfig;
  tablet: BreakpointConfig;
  mobileExtra: BreakpointConfig;
  mobile: BreakpointConfig;
}

/**
 * Breakpoint già risolto: filtrato per `active` (ADR-76 § "Decisione" punto
 * 4/5) e con la soglia già calcolata contro `app_settings.breakpoints`.
 * `mediaQuery` è assente per `'default'` (nessuna media query, il breakpoint
 * di base non ne ha una). Stessa forma richiesta da `toCss()`
 * (SPEC-PROPKIND-V2-DETAILS.md § 10, `ctx.activeBreakpoints`).
 */
export interface ResolvedBreakpoint {
  /** Uno dei 7 nomi chiusi di `ResponsiveBreakpointName`. */
  name: ResponsiveBreakpointName;
  /** Es. `'(max-width: 1024px)'`. Assente per `'default'`. */
  mediaQuery?: string;
}

/**
 * Punto unico che incrocia l'unione chiusa dei 7 nomi con lo stato di
 * attivazione per sito (ADR-76 § "Conseguenze": "una funzione sola usata da
 * entrambi i percorsi", validator e worker di export/compilatore CSS). Non
 * legge `app_settings` da sola: il chiamante passa il valore già letto
 * (`SettingsService.getBreakpoints()` o l'equivalente), questa funzione resta
 * pura.
 *
 * @param settings Valore corrente di `app_settings.breakpoints`.
 * @returns L'elenco dei breakpoint attivi, `default` sempre incluso per
 *   primo, gli altri nell'ordine di `RESPONSIVE_BREAKPOINTS` (dal più largo
 *   al più stretto) con la propria `mediaQuery` già calcolata.
 */
export function resolveActiveBreakpoints(settings: BreakpointsValue): ResolvedBreakpoint[] {
  const resolved: ResolvedBreakpoint[] = [{ name: 'default' }];
  for (const name of RESPONSIVE_BREAKPOINTS) {
    if (name === 'default') continue;
    const config = settings[name];
    if (!config?.active) continue;
    const mediaQuery =
      name === 'widescreen'
        ? `(min-width: ${config.minWidth}px)`
        : `(max-width: ${config.maxWidth}px)`;
    resolved.push({ name, mediaQuery });
  }
  return resolved;
}

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
 * Riferimento a una Pagina: solo forma di `guid` (16 hex), nessuna verifica
 * di esistenza o di stato di pubblicazione a scrittura — la risoluzione
 * `pageGuid → slug` e il filtro "solo `published`" avvengono a valle, nella
 * pipeline SSR (ADR-52 § 3/§ 4). Non è un riuso di `mediaRef`: un file non ha
 * mai stato "non pubblicato", una Pagina sì — kind distinto perché in futuro
 * potrebbe applicarsi una regola (es. hide-if-unpublished) che non riguarda
 * `mediaRef`.
 */
export interface PageRefPropSpec extends BasePropSpec {
  kind: 'pageRef';
}

/**
 * Riferimento a una Sezione Globale (ADR-55 § 1): solo forma di `guid` (16
 * hex), nessuna verifica di esistenza a scrittura — la risoluzione avviene a
 * valle nel job di export (stesso principio di `pageRef`, ADR-52 § 4). Kind
 * distinto da `pageRef`: il bersaglio è sempre una riga `global_sections`,
 * mai una Pagina, e il divieto di ciclo (ADR-55, `insideGlobalSection`) si
 * applica solo a questo `kind`/tipo di nodo, non a `pageRef`.
 */
export interface GlobalSectionRefPropSpec extends BasePropSpec {
  kind: 'globalSectionRef';
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
  /**
   * `true` ammette l'inviluppo stateful di ADR-75 su questo `border` (ADR-82
   * § "Conseguenze": estensione additiva di `BorderPropSpec`/`ShadowPropSpec`
   * con il modificatore, nessuna rottura dei descrittori esistenti che non lo
   * dichiarano). Assente/`false` = comportamento invariato (valore scalare).
   */
  stateful?: boolean;
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
  /** Stessa estensione additiva di `BorderPropSpec.stateful` sopra (ADR-82 § "Conseguenze"). */
  stateful?: boolean;
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

/**
 * Riferimento a colore globale o valore hex diretto (PropKind v2,
 * SPEC-PROPKIND-V2-DETAILS.md § 1; ADR-74–ADR-77, round R0). Sostituisce
 * progressivamente `kind: 'color'` (che resta valido, ADR-33 § 3): il
 * `colorRef` accetta il superset hex 3/6 cifre (+ 8 se `allowAlpha`) più
 * `{ ref: GlobalColorId }` verso `app_settings.global_kit` (ADR-77 § 1/§ 2).
 * `stateful`/`responsive` sono qui ridichiarati esplicitamente (identici a
 * `BasePropSpec`) solo per documentare che sono ammessi su questo `kind` —
 * ADR-75 § "Decisione" punto 6 lo include fra i `kind` che li dichiarano.
 * `cssProperty` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md) è letto solo da
 * `toCss()`, mai dal validatore.
 */
export interface ColorRefPropSpec extends BasePropSpec {
  kind: 'colorRef';
  /** `true` ammette anche `#RRGGBBAA` oltre a `#RGB`/`#RRGGBB` (SPEC-PROPKIND-V2-DETAILS.md § 1). */
  allowAlpha?: boolean;
  stateful?: boolean;
  /** Raro: un `colorRef` quasi mai varia per breakpoint, ma non è escluso dal descrittore. */
  responsive?: boolean;
  /** Proprietà CSS di destinazione (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md), letta da `toCss()`. */
  cssProperty: 'color' | 'background-color' | 'border-color' | 'outline-color';
}

/**
 * Riferimento a font globale o famiglia dichiarata inline (PropKind v2,
 * SPEC-PROPKIND-V2-DETAILS.md § 2). Mai `stateful` (ADR-75 § "Decisione"
 * punto 6: una famiglia di font non ha stato Hover in Elementor); `responsive`
 * ammesso ma raro, dichiarato dal blocco ospite.
 */
export interface FontRefPropSpec extends BasePropSpec {
  kind: 'fontRef';
  responsive?: boolean;
}

/**
 * Blocco tipografico composito (PropKind v2, SPEC-PROPKIND-V2-DETAILS.md § 3):
 * tutti i campi del valore sono opzionali (`{}` è un valore valido). Il
 * modificatore `responsive` opera qui **per campo** (ogni campo presente
 * porta il proprio envelope breakpoint indipendente), non sull'intero
 * oggetto — l'unico `kind` composito con questa granularità. `stateful` opera
 * invece sull'**intero oggetto** (ADR-75 § "Decisione" punto 6): se una prop
 * dichiara entrambi, l'ordine resta stato → (campo) → breakpoint, lo stato è
 * il livello più esterno.
 */
export interface TypographyPropSpec extends BasePropSpec {
  kind: 'typography';
  responsive?: boolean;
}

/**
 * Padding/margin a quattro lati con **una sola** unità condivisa (PropKind
 * v2, SPEC-PROPKIND-V2-DETAILS.md § 4): sostituisce le 8 prop enum
 * `stylePadding*`/`styleMargin*` (migrazione `docs/SPEC-propkind-v2.md` § 6).
 * Mai `stateful` (ADR-75 § "Decisione" punto 6: nessun caso Elementor applica
 * un padding diverso in Hover); `responsive` ammesso sull'intero oggetto
 * `SpacingValue`, non campo per campo (a differenza di `typography`).
 * `target` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md) è letto solo da
 * `toCss()`, mai dal validatore.
 */
export interface SpacingPropSpec extends BasePropSpec {
  kind: 'spacing';
  /** Unità ammesse per questa prop, sottoinsieme di `LengthUnit`. */
  units: readonly LengthUnit[];
  /** Minimo per lato, applicato sullo stesso `unit` dell'intero oggetto. */
  min: number;
  /** Massimo per lato, applicato sullo stesso `unit` dell'intero oggetto. */
  max: number;
  /** Documenta che `min` può essere negativo per questa prop (SPEC-PROPKIND-V2-DETAILS.md § 4 punto 1). */
  allowNegative?: boolean;
  responsive?: boolean;
  /** Lato CSS di destinazione (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md), letto da `toCss()`. */
  target: 'padding' | 'margin';
}

/**
 * Raggio d'angolo a quattro vertici indipendenti (PropKind v2,
 * SPEC-PROPKIND-V2-DETAILS.md § 5). Intervallo **fisso nel validatore**
 * (0–500, unità `'px'|'%'`), stesso principio di `BorderPropSpec`/
 * `ShadowPropSpec`: un solo uso sensato, nessun intervallo per prop. Mai
 * `stateful` né `responsive` (ADR-75 § "Decisione" punto 6, nessun requisito
 * del gap analysis lo chiede).
 */
export interface RadiusPropSpec extends BasePropSpec {
  kind: 'radius';
}

/**
 * Gradiente lineare/radiale (PropKind v2, SPEC-PROPKIND-V2-DETAILS.md § 6).
 * Mai `stateful` in questo round (SPEC-PROPKIND-V2-DETAILS.md § 6 punto 4);
 * `responsive` non dichiarato da nessun uso previsto in R1/R2.
 */
export interface GradientPropSpec extends BasePropSpec {
  kind: 'gradient';
}

/**
 * Modello di posizionamento CSS (PropKind v2, SPEC-PROPKIND-V2-DETAILS.md §
 * 7). Mai `stateful` (nessun requisito lo chiede in questo round); `offset`
 * **può** essere dichiarato `responsive` dal blocco ospite — la forma segue
 * ADR-29 sull'intero oggetto `offset`, non campo per campo (a differenza di
 * `typography`) — `type`/`zIndex`/`sticky` non sono mai avvolti da un
 * envelope. `type: 'fixed'|'absolute'` è vietato dal validatore (non dal
 * descrittore) su un nodo dentro l'albero di una Sezione Globale
 * (SPEC-PROPKIND-V2-DETAILS.md § 7 punto 4, stesso meccanismo di
 * `insideGlobalSection` già usato per ADR-55).
 */
export interface PositionPropSpec extends BasePropSpec {
  kind: 'position';
  responsive?: boolean;
}

/**
 * Trasformazione 2D (PropKind v2, SPEC-PROPKIND-V2-DETAILS.md § 8).
 * `stateful: true` è il caso d'uso dominante (micro-interazioni Hover, ADR-75
 * § "Decisione" punto 6 lo elenca esplicitamente); `responsive` ammesso e
 * indipendente, stesso ordine stato → breakpoint → valore sull'intero oggetto.
 */
export interface TransformPropSpec extends BasePropSpec {
  kind: 'transform';
  stateful?: boolean;
  responsive?: boolean;
}

/**
 * Filtro CSS (`filter`) (PropKind v2, SPEC-PROPKIND-V2-DETAILS.md § 9).
 * `stateful` ammesso per gli stessi effetti hover di `transform` (sfocatura o
 * desaturazione rimossa al passaggio del mouse su un'immagine); `responsive`
 * ammesso e indipendente, stesso principio di `transform`.
 */
export interface FilterPropSpec extends BasePropSpec {
  kind: 'filter';
  stateful?: boolean;
  responsive?: boolean;
}

// ─── Container v2 (ADR-81/ADR-82, round R2 "parità Elementor Pro", Sub-Task S1.4) ───

/** Unità ammesse per una traccia di griglia esplicita (`docs/SPEC-propkind-v2.md` § 4.1, ADR-82 § "Decisione" punto 1). */
export type GridTrackUnit = 'fr' | 'px' | '%';

/**
 * Una singola traccia di `gridTemplateColumns`/`gridTemplateRows`: un valore
 * numerico con unità, o la stringa letterale `'auto'` (mai una stringa CSS
 * libera, ADR-82 § "Alternative valutate", ultima riga).
 */
export type GridTrackValue = { value: number; unit: GridTrackUnit } | 'auto';

/**
 * Valore di `layout.gridTemplateColumns`/`layout.gridTemplateRows` (ADR-82 §
 * "Decisione" punto 1, terzo bullet): due forme chiuse, mai una stringa CSS
 * libera — `{ preset: 'repeat', count }` (`count` 1–12, emette
 * `repeat(<count>, 1fr)`) oppure un array di 1–12 {@link GridTrackValue}
 * (`value` nell'intervallo `[0, 4000]`, stesso intervallo già in uso per
 * `styleWidth`/`styleHeight` di `container` v1).
 */
export type GridTemplateValue = { preset: 'repeat'; count: number } | GridTrackValue[];

/**
 * Valore di `kind: 'layout'` (`docs/SPEC-propkind-v2.md` § 4.1, ADR-82 §
 * "Decisione" punto 1): tutti i campi opzionali (`{}` valido, stesso
 * principio di `TypographyValue`). `align` è il vocabolario flex
 * (`stretch|flex-start|center|flex-end`, identico a `container` v1
 * `alignItems`); `alignItems`/`justifyItems` sono il vocabolario grid
 * (`start|end|center|stretch`) — campi distinti perché Grid e Flexbox usano
 * proprietà CSS diverse per l'allineamento (ADR-82 § "Decisione" punto 1,
 * elenco letterale dei campi).
 */
export interface LayoutValue {
  display?: 'flex' | 'grid';
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  wrap?: 'nowrap' | 'wrap';
  justify?:
    'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  align?: 'stretch' | 'flex-start' | 'center' | 'flex-end';
  gap?: { x: { value: number; unit: LengthUnit }; y: { value: number; unit: LengthUnit } };
  gridTemplateColumns?: GridTemplateValue;
  gridTemplateRows?: GridTemplateValue;
  autoFlow?: 'row' | 'column' | 'row dense' | 'column dense';
  justifyItems?: 'start' | 'end' | 'center' | 'stretch';
  alignItems?: 'start' | 'end' | 'center' | 'stretch';
}

/**
 * Layout composito unificato flex/grid di `container` v2 (`docs/SPEC-propkind-v2.md`
 * § 4.1, ADR-82 § "Decisione" punto 1). **L'intero oggetto** è `responsive`
 * quando il blocco lo dichiara — mai i singoli campi ("un cambio di `display`
 * da `flex` a `grid` per breakpoint è un caso raro ma la forma unica per
 * l'intero oggetto evita 9 envelope indipendenti per un guadagno di
 * granularità che nessun requisito chiede", ADR-82 § "Decisione" punto 1) —
 * e **mai** `stateful` (nessun requisito Elementor applica un layout diverso
 * in Hover).
 */
export interface LayoutPropSpec extends BasePropSpec {
  kind: 'layout';
  responsive?: boolean;
}

/**
 * Valore di `kind: 'background'` (`docs/SPEC-propkind-v2.md` § 3.7). Scope
 * S1.4: il validatore accetta pienamente `type: 'none'|'color'|'gradient'|
 * 'image'` (sotto-campi validati con le stesse regole di `colorRef`/
 * `gradient`, riusate); `video`/`slideshow` sono validati in forma minimale
 * (struttura dichiarata, nessun intervallo raffinato) perché nessun renderer
 * li onora in questo round (debito dichiarato, ADR-82 § "Conseguenze", stesso
 * trattamento di `link`/`animation`/`motion`).
 */
export interface BackgroundValue {
  type: 'none' | 'color' | 'gradient' | 'image' | 'video' | 'slideshow';
  color?: unknown; // ColorRefValue — riusa la validazione di `colorRef`
  gradient?: unknown; // GradientValue — riusa la validazione di `gradient`
  image?: {
    mediaRef: string;
    position: string; // stesso vocabolario a 9 valori di `styleBackgroundPosition`
    attachment: 'scroll' | 'fixed';
    repeat: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
    size: 'auto' | 'cover' | 'contain' | 'custom';
    customSize?: { value: number; unit: LengthUnit };
  };
  video?: {
    mediaRef?: string;
    url?: string;
    start?: number;
    end?: number;
    loop?: boolean;
    playOnMobile?: boolean;
    fallbackMediaRef?: string;
  };
  slideshow?: {
    items: string[]; // mediaRef[], 1–10
    duration?: number;
    transition?: 'fade' | 'slide';
    kenBurns?: boolean;
  };
  overlay?: {
    color?: unknown; // ColorRefValue | GradientValue
    opacity: number; // 0–1
    blend?: string; // BlendMode, stesso elenco chiuso di `filter.blend`
  };
}

/**
 * Sfondo composito unificato (`docs/SPEC-propkind-v2.md` § 3.7): consolida le
 * 9 prop di sfondo di `section` (ADR-50) in un solo `kind`, sempre `stateful`
 * disponibile (`container` lo dichiara `stateful: true`, ADR-82 § "Decisione"
 * punto 1). `allowVideo`/`allowSlideshow` restano dichiarati dal descrittore
 * (`docs/SPEC-propkind-v2.md` § 3.7) ma non sono ancora letti da questo
 * validatore in S1.4 (nessun blocco del round li imposta a `false` per
 * restringere le sotto-forme accettate): documentato come scope ridotto nel
 * resoconto finale.
 */
export interface BackgroundPropSpec extends BasePropSpec {
  kind: 'background';
  allowVideo?: boolean;
  allowSlideshow?: boolean;
  stateful?: boolean;
}

/**
 * Valore di `kind: 'link'` (`docs/SPEC-propkind-v2.md` § 3.12). `href` è o la
 * stessa forma di `UrlPropSpec` (http/https/mailto/root-relative) o un
 * riferimento chiuso a Pagina/Media (stessa forma di `guid` di `pageRef`/
 * `mediaRef`). `attributes`/`dynamic` non sono implementati (fuori scope,
 * altri round, task operativo).
 */
export interface LinkValue {
  href: string | { pageRef: string } | { mediaRef: string };
  target: '_self' | '_blank';
  rel: ('nofollow' | 'noopener' | 'sponsored')[];
  lightbox?: boolean;
}

/**
 * Link composito (`docs/SPEC-propkind-v2.md` § 3.12): sostituisce `button.href`
 * (migrato da ADR-81), aggiunge link a `heading`/`image`/`container`. Mai
 * `stateful`/`responsive` in questo round (nessun requisito lo chiede).
 */
export interface LinkPropSpec extends BasePropSpec {
  kind: 'link';
}

/**
 * Valore di `kind: 'animation'` (`docs/SPEC-propkind-v2.md` § 3.10). `entrance`
 * è un'allowlist chiusa: qui un **sottoinsieme rappresentativo di 12 nomi**
 * dei "~40" citati dallo SPEC (scelta di design di questo Sub-Task,
 * ampliabile senza bump di schema — additivo su un `enum` non cambia forma).
 * Schema-only: nessun renderer in questo round (ADR-82 § "Conseguenze",
 * "debito dichiarato").
 */
export interface AnimationValue {
  entrance?:
    | 'fadeIn'
    | 'fadeInUp'
    | 'fadeInDown'
    | 'fadeInLeft'
    | 'fadeInRight'
    | 'zoomIn'
    | 'zoomInUp'
    | 'bounceIn'
    | 'bounceInUp'
    | 'slideInUp'
    | 'slideInLeft'
    | 'slideInRight';
  duration: 'slow' | 'normal' | 'fast';
  delayMs: number; // 0–5000
}

/** Animazione d'ingresso (`docs/SPEC-propkind-v2.md` § 3.10). Mai `stateful`/`responsive`. */
export interface AnimationPropSpec extends BasePropSpec {
  kind: 'animation';
}

/**
 * Valore di `kind: 'motion'` (`docs/SPEC-propkind-v2.md` § 3.11). Scope S1.4
 * ridotto ai soli campi validabili in forma chiusa senza inventare intervalli
 * non dichiarati dai documenti (stesso principio già applicato a
 * `transform.translateX`/`translateY` in S1.1, `range: null`): nessun
 * renderer JS in questo round (debito dichiarato, ADR-82 § "Conseguenze").
 */
export interface MotionValue {
  scroll?: {
    verticalTranslate?: number;
    opacity?: boolean;
    rotate?: number;
    scale?: number;
  };
  onBreakpoints?: ResponsiveBreakpointName[];
}

/** Effetti di scroll/mouse (`docs/SPEC-propkind-v2.md` § 3.11). Mai `stateful`/`responsive`. */
export interface MotionPropSpec extends BasePropSpec {
  kind: 'motion';
}

/**
 * Valore di `kind: 'attributes'` (`docs/SPEC-propkind-v2.md` § 3.14): array di
 * `{ name, value }`, max 10 elementi. `name` deve appartenere al pattern
 * chiuso `^(data-[a-z0-9-]{1,40}|aria-[a-z]{1,20}|title|role|lang)$` — mai
 * `on*`/`href`/`src`/`style`/`class`/`id` (già coperti da `kind` dedicati).
 * `value` ≤ 200 caratteri.
 */
export type AttributesValue = { name: string; value: string }[];

/** Attributi HTML custom allowlist-chiusa (`docs/SPEC-propkind-v2.md` § 3.14). Mai `stateful`/`responsive`. */
export interface AttributesPropSpec extends BasePropSpec {
  kind: 'attributes';
}

/**
 * CSS custom per-blocco (`docs/SPEC-propkind-v2.md` § 3.15). Il validatore
 * verifica solo che il valore sia una stringa entro `maxLength`
 * (`BlockTreeValidatorService.validateCssValue`): il parsing/sanitizzazione
 * `css-tree` + allowlist proprietà descritto dallo SPEC è implementato in
 * `CssTreeSanitizerService` (`app/backend/src/common/sanitizer/`), a valle
 * del validator nella pipeline (ADR-21 § 3.7), governato da
 * `docs/ai/adr/ADR-78-sanitizzazione-css-e-sandbox-html.md` — approvata
 * 2026-09-18 (Sub-Task S5.1, `kind: 'css'`, punti 1-6/9-10 della Decisione;
 * `kind: 'html'`, punti 7-8, resta fuori scope di quel sub-task).
 */
export interface CssPropSpec extends BasePropSpec {
  kind: 'css';
  maxLength: number;
}

/**
 * Valore di `kind: 'hideOn'` (ADR-81 § "Decisione" punto 2 riga `styleHide*`,
 * ADR-82 § "Decisione" punto 1): array di 0–7 {@link ResponsiveBreakpointName},
 * nessun duplicato — sostituisce `styleHideDesktop`/`Tablet`/`Mobile` di
 * `section`/`heading`/`richText`/`image`/`button` v1.
 */
export type HideOnValue = ResponsiveBreakpointName[];

/** Visibilità per breakpoint (ADR-81/ADR-82). Mai `stateful`/`responsive` (il `kind` stesso è già l'inviluppo breakpoint). */
export interface HideOnPropSpec extends BasePropSpec {
  kind: 'hideOn';
}

/**
 * Allowlist chiusa a 20 nomi per `shapeDividerTop`/`shapeDividerBottom`
 * (ADR-82 § "Decisione" punto 1: "allowlist chiusa a 20 nomi, fissata
 * nell'implementazione R2 T6"). Scelta di design di questo Sub-Task — nessuno
 * SPEC firmato elenca i 20 nomi letteralmente: allowlist geometrica generica
 * ispirata al vocabolario comune degli shape-divider (Elementor stesso ne usa
 * un sottoinsieme), segnalata come scelta esplicita da confermare nel
 * resoconto finale.
 */
export const SHAPE_DIVIDER_STYLES = [
  'mountains',
  'drops',
  'clouds',
  'zigzag',
  'pyramids',
  'triangles',
  'tilt',
  'curve',
  'waves',
  'waveBrush',
  'arrow',
  'split',
  'book',
  'curveAsymmetrical',
  'wavesPattern',
  'wave',
  'zigzagMultiple',
  'waveOpacity',
  'triangleAsymmetrical',
  'curveOpacity',
] as const;

/** Uno dei 20 nomi di {@link SHAPE_DIVIDER_STYLES}. */
export type ShapeDividerStyle = (typeof SHAPE_DIVIDER_STYLES)[number];

/**
 * Valore di `kind: 'shapeDivider'` (ADR-82 § "Decisione" punto 1): elemento
 * decorativo assoluto con SVG inline dall'allowlist di
 * {@link SHAPE_DIVIDER_STYLES}. `color` riusa la forma nuda di `colorRef`
 * (mai `allowAlpha`, stesso principio dei color stop di `gradient`).
 */
export interface ShapeDividerValue {
  style: ShapeDividerStyle;
  color: unknown; // ColorRefValue — riusa la validazione di `colorRef`
  width: { value: number; unit: LengthUnit };
  height: { value: number; unit: LengthUnit };
  flip: boolean;
  invert: boolean;
  aboveContent: boolean;
}

/** Shape divider superiore/inferiore di `container` v2 (ADR-82 § "Decisione" punto 1). Mai `stateful`/`responsive`. */
export interface ShapeDividerPropSpec extends BasePropSpec {
  kind: 'shapeDivider';
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
  | PageRefPropSpec
  | GlobalSectionRefPropSpec
  | ColorPropSpec
  | UnitValuePropSpec
  | BorderPropSpec
  | ShadowPropSpec
  | CssClassNamePropSpec
  | HtmlIdPropSpec
  | ColorRefPropSpec
  | FontRefPropSpec
  | TypographyPropSpec
  | SpacingPropSpec
  | RadiusPropSpec
  | GradientPropSpec
  | PositionPropSpec
  | TransformPropSpec
  | FilterPropSpec
  | LayoutPropSpec
  | BackgroundPropSpec
  | LinkPropSpec
  | AnimationPropSpec
  | MotionPropSpec
  | AttributesPropSpec
  | CssPropSpec
  | HideOnPropSpec
  | ShapeDividerPropSpec;

# SPEC — PropKind v2, dettaglio: interfacce, schemi di validazione, `toCss()`

## Status
[ ] Bozza — round R1 di `docs/PLAN-parita-elementor-pro.md` · [x] Approvata (2026-09-17, contestuale ad ADR-74/75/76/77) · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (la riga copre anche i
round che ne dipendono, R1 incluso, finché l'INDEX non viene aggiornato con una riga propria).

## Relazione con gli altri documenti
Questo documento **non è una firma**: è il dettaglio implementativo di `docs/SPEC-propkind-v2.md`
§ 3.1–3.9 (`colorRef`, `fontRef`, `typography`, `spacing`, `radius`, `gradient`, `position`,
`transform`, `filter`), scritto per rendere eseguibile `PLAN-parita-elementor-pro.md` § R1 T1/T4
(`prop-spec.types.ts`, `toCss()`). Nessun `kind` nuovo rispetto a quelli già enumerati in
`SPEC-propkind-v2.md` § 3: questo documento non è quindi soggetto a `CLAUDE.md` § Ask first per sé
— lo è già stato `SPEC-propkind-v2.md`, di cui condivide l'attesa di RFC/ADR. `gradient` è incluso
qui perché `background` (§ 3.7 di `SPEC-propkind-v2.md`) lo contiene; il dettaglio di `background`,
`link`, `icon`, `attributes`, `css`, `html`, `animation`, `motion`, `query`, `conditions`,
`trigger` resta nel round che li consuma (R2/R4/R6/R7) e non è ripetuto qui.

## ADR applicabili
- `ADR-75-involucro-stateful-e-stati-hover.md` — ordine di nidificazione **stato → breakpoint →
  valore**, vincolante per ogni `kind` che dichiara `stateful: true` in questo documento
  (`colorRef`, `typography`, `transform`, `filter` quando il blocco ospite lo richiede).
- `ADR-76-breakpoints-configurabili.md` — `ResponsiveBreakpointName` non è più l'unione fissa a 3
  nomi di `RESPONSIVE_BREAKPOINTS` (`prop-spec.types.ts` riga 97): ogni riferimento a "breakpoint"
  in questo documento usa `resolveActiveBreakpoints()` (ADR-76 § "Conseguenze"), non la costante
  storica.
- `ADR-77-global-kit-schema.md` — `colorRef`/`fontRef` risolvono `{ ref: GlobalColorId |
  GlobalFontId }` contro `app_settings.global_kit` (`docs/ai/specs/SPEC-GLOBAL-KIT.md`), mai un
  valore finale persistito nel nodo.
- `ADR-21-schema-blocchi-versionamento.md` § 2/§ 4 — un `kind` è un'unione discriminata
  interpretata da un unico validatore; ogni interfaccia sotto estende `BasePropSpec`
  (`prop-spec.types.ts` riga 41) esattamente come i `kind` già in registro.

## Principio di continuità col registro esistente
Ogni interfaccia sotto **si aggiunge** all'unione `PropSpec` (`prop-spec.types.ts` riga 246-261),
mai la sostituisce. `BasePropSpec` guadagna due campi opzionali già previsti da ADR-29/ADR-75 e non
ridichiarati qui:
```ts
interface BasePropSpec {
  required: boolean;
  default?: unknown;
  responsive?: boolean; // ADR-29
  stateful?: boolean;   // ADR-75
}
```
Un `kind` che non dichiara `stateful`/`responsive` in una specifica prop del registro (es.
`spacing`/`radius`/`gradient`, mai `stateful` per costruzione — ADR-75 § 6) semplicemente non li
espone nel proprio `BlockDefinition`: il campo esiste sul tipo TypeScript ma il validatore lo
ignora se il `kind` sottostante non lo supporta (stesso principio del ramo `enum`/`responsive` già
in `block-tree-validator.service.ts`).

---

## 1. `colorRef`

```ts
export interface ColorRefPropSpec extends BasePropSpec {
  kind: 'colorRef';
  allowAlpha?: boolean;
  stateful?: boolean;
  responsive?: boolean; // raro: un colorRef quasi mai varia per breakpoint, ma non è escluso
  cssProperty: 'color' | 'background-color' | 'border-color' | 'outline-color'; // Addendum S1.2, vedi sotto
}

/** Forma del valore, non responsive/stateful (caso base). */
type GlobalColorId = string; // guid 16 hex, oppure 'primary'|'secondary'|'text'|'accent' (ADR-77 § 2)
type ColorRefValue =
  | string                       // '#RGB' | '#RRGGBB' | '#RRGGBBAA' (solo se allowAlpha)
  | { ref: GlobalColorId };
```

### Schema di validazione
1. Se il valore è una stringa: deve corrispondere a `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`, o in più
   `^#[0-9a-fA-F]{8}$` se `allowAlpha: true`. Nessuna altra forma testuale (niente `rgb()`/`hsl()`/
   parole chiave CSS — stesso principio restrittivo di `ColorPropSpec`, `prop-spec.types.ts` riga
   158-169).
2. Se il valore è un oggetto: deve avere **solo** la chiave `ref`, stringa che è o uno dei 4 id
   system riservati (`primary|secondary|text|accent`) o un guid 16 hex minuscolo. Nessuna verifica
   di esistenza a scrittura (stesso principio di `mediaRef`/`pageRef`): un `ref` verso un id
   custom cancellato viene risolto a export-time con fallback `primary` + warning (ADR-77 §
   "Conformità").
3. Un valore che non è né stringa-pattern né oggetto-`ref` produce `reason: 'format'` sul path
   della prop (stesso `reason` già usato per `url`/`mediaRef` malformati).
4. Con `stateful: true`: il valore atteso è l'envelope di ADR-75 § "Decisione" punto 1, con
   `ColorRefValue` come "valore nudo" di ciascun ramo stato/breakpoint. Con `responsive: true` senza
   `stateful`, l'inviluppo è solo quello di ADR-29 (`{default, tablet?, mobile?, ...}` sulle chiavi
   attive di ADR-76). Con entrambi, l'ordine è quello fissato da ADR-75: stato esterno, breakpoint
   interno.

---

## 2. `fontRef`

```ts
export interface FontRefPropSpec extends BasePropSpec {
  kind: 'fontRef';
}

type GlobalFontId = string; // guid 16 hex, oppure 'primary'|'secondary'|'text'|'accent' (ADR-77 § 2)
type FontRefValue =
  | { ref: GlobalFontId }
  | { family: string; source: 'system' | 'google' | 'custom' };
```

### Schema di validazione
1. `{ ref }`: stessa regola di `colorRef` punto 2 sopra, applicata a `fonts[]`/`customFonts[]`
   (`SPEC-GLOBAL-KIT.md` § 1).
2. `{ family, source: 'system' }`: `family` da un elenco chiuso di famiglie di sistema già presenti
   nel foglio dei token (`default|inter|roboto|playfair|montserrat|monospace`, lo stesso vocabolario
   di `styleFontFamily` in `heading.block.ts` riga 61) — nessuna stringa libera.
3. `{ family, source: 'google' }`: `family` deve appartenere a `fonts.google_allowlist`
   (`SPEC-GLOBAL-KIT.md` § 3) — verificato **a scrittura** contro la tabella sincronizzata, non solo
   in forma. Questo è un'eccezione dichiarata al principio "nessuna verifica di esistenza a
   scrittura" di `mediaRef`/`colorRef`: qui la verifica è economica (una tabella piccola, già in
   memoria di processo) e previene la scrittura silenziosa di un nome mai sincronizzato.
4. `{ family, source: 'custom' }`: `family` deve corrispondere a un `customFonts[].family` esistente
   nello stesso controllo del punto 3.
5. Non `stateful` (ADR-75 § 6: la famiglia di un font non ha stato Hover in Elementor). `responsive`
   ammesso ma raro — dichiarato dal blocco ospite, non imposto qui.

---

## 3. `typography`

```ts
export interface TypographyPropSpec extends BasePropSpec {
  kind: 'typography';
}

interface TypographyValue {
  fontFamily?: FontRefValue;
  fontSize?: UnitValue;            // units: 'px'|'em'|'rem'|'vw'|'%'; range 1–400
  fontWeight?: '100'|'200'|'300'|'400'|'500'|'600'|'700'|'800'|'900'|'normal'|'bold';
  textTransform?: 'none'|'uppercase'|'lowercase'|'capitalize';
  fontStyle?: 'normal'|'italic'|'oblique';
  textDecoration?: 'none'|'underline'|'overline'|'line-through';
  lineHeight?: UnitValue;           // units: 'em'|'px'; range 0–10 (em) / 0–200 (px)
  letterSpacing?: UnitValue;        // units: 'px'|'em'; range -20–50
  wordSpacing?: UnitValue;          // units: 'px'|'em'; range -20–100
}
interface UnitValue { value: number; unit: 'px'|'em'|'rem'|'vw'|'%'; }
```

### Schema di validazione
1. Tutti i campi sono opzionali: un valore `{}` è valido (nessun campo obbligatorio dentro
   `typography`, coerente con `SPEC-propkind-v2.md` § 3.3).
2. Ogni campo che porta un `UnitValue` verifica `unit` contro il proprio sottoinsieme dichiarato
   sopra (non l'intero `LengthUnit`, `prop-spec.types.ts` riga 176) e `value` contro il proprio
   intervallo — stesso principio di `UnitValuePropSpec` (riga 189-195), applicato per-campo invece
   che per-prop.
3. **`responsive` opera per campo**, non sull'intero oggetto (`SPEC-propkind-v2.md` § 3.3, ultima
   riga): la forma di un `TypographyValue` "responsive" non è `{default: TypographyValue, tablet?:
   ...}`, è `{ fontSize?: { default, tablet?, mobile? }, fontWeight?: {...}, ... }` — ogni campo
   presente porta il proprio envelope breakpoint indipendente. Questo è l'unico `kind` composito in
   cui il modificatore si applica sotto il primo livello di annidamento, non sopra: la giustificazione
   è che Elementor stesso permette di responsivizzare la sola dimensione del font lasciando il resto
   fisso, un caso reale che un unico envelope a livello di `typography` intero non potrebbe esprimere
   senza forzare ogni campo a seguire la stessa cascata.
4. `stateful` opera invece **sull'intero oggetto** (non per campo): `{ normal: { fontSize:..., ... },
   hover?: { ... } }`, coerente con ADR-75 § "Decisione" punto 6 (la tipografia hover di un pulsante
   cambia in blocco, non campo per campo). Se una prop dichiara sia `stateful` che `responsive`,
   l'ordine resta stato→(campo)→breakpoint: lo stato è il livello più esterno, il breakpoint vive
   dentro ciascun campo del ramo di stato attivo.
5. Un campo con valore fuori forma (`UnitValue` malformato, enum fuori lista) produce
   `reason: 'type'`/`reason: 'enum'` sul path completo del campo (`…props.typography.normal.
   fontSize` o `…props.typography.fontSize.tablet`, a seconda che sia coinvolto `stateful`).

---

## 4. `spacing`

```ts
export interface SpacingPropSpec extends BasePropSpec {
  kind: 'spacing';
  units: readonly LengthUnit[];
  min: number;
  max: number;
  allowNegative?: boolean;
  target: 'padding' | 'margin'; // Addendum S1.2, vedi sotto
}

interface SpacingValue {
  top: number; right: number; bottom: number; left: number;
  unit: LengthUnit;   // un solo `unit` per tutti e quattro i lati
  linked: boolean;    // true = i quattro editor UI sono sincronizzati; non altera il CSS emesso
}
```

### Schema di validazione
1. I quattro lati condividono **un solo** `unit`: non è la stessa libertà di `container.
   stylePaddingTop`/`...Right`/`...Bottom`/`...Left` di oggi (quattro prop `unitValue`
   indipendenti, ciascuna con proprio `units`) — è la semplificazione che `SPEC-propkind-v2.md` §
   3.4 dichiara esplicitamente ("sostituisce le 8 prop enum... con due prop"). Ogni lato verifica
   `[min, max]` (con `allowNegative` che sposta il minimo permesso a un valore negativo dichiarato
   dalla prop, mai libero) sullo stesso `unit` dell'intero oggetto.
2. `linked` è **presentazione, non validazione**: un validatore non deriva né verifica coerenza fra
   `linked: true` e valori dei lati diseguali (stesso principio già stabilito per
   `styleBackgroundType`/`styleBackgroundPosition` in `section.block.ts` riga 206-208, "presentazione,
   non validazione"). L'editor è responsabile di tenerli sincronizzati quando `linked` è vero.
3. Non `stateful` (ADR-75 § 6: nessun caso Elementor applica un padding diverso in Hover).
   `responsive` ammesso: l'intero oggetto `SpacingValue` è il "valore nudo" di ADR-29, non i singoli
   campi (a differenza di `typography`) — un padding non ha un caso d'uso reale in cui un solo lato
   cambi per breakpoint mentre gli altri restano fissi indipendentemente dal resto dell'oggetto.

---

## 5. `radius`

```ts
export interface RadiusPropSpec extends BasePropSpec {
  kind: 'radius';
}

interface RadiusValue {
  tl: number; tr: number; br: number; bl: number; // 0–500
  unit: 'px' | '%';
  linked: boolean;
}
```

### Schema di validazione
1. Intervallo **fisso nel validator** (0–500, unità implicita al singolo valore `'px'|'%'`), stesso
   principio di `BorderPropSpec`/`ShadowPropSpec` (`prop-spec.types.ts` riga 197-223): un solo uso
   sensato, nessun bisogno di un intervallo dichiarato per prop.
2. `border.radius` scalare (oggi dentro `BorderPropSpec.default`) resta accettato in lettura e
   migrato a quattro angoli uguali (`tl=tr=br=bl=<valore>, unit:'px', linked:true`) — stessa funzione
   di migrazione difensiva usata da `ADR-81` per gli altri scalari-diventati-oggetto.
3. Non `stateful`, non `responsive` (nessun requisito del gap analysis lo chiede: un raggio non
   cambia per breakpoint o stato in Elementor Pro).

---

## 6. `gradient`

```ts
export interface GradientPropSpec extends BasePropSpec {
  kind: 'gradient';
}

interface GradientValue {
  type: 'linear' | 'radial';
  angle?: number;              // 0–360, solo 'linear'
  position?: BgPosition;       // solo 'radial'; stesso vocabolario di styleBackgroundPosition (9 valori, section.block.ts riga 218-228)
  stops: GradientStop[];       // 2–6
}
interface GradientStop { color: ColorRefValue; at: number; } // 'at' 0–100
```

### Schema di validazione
1. `stops`: array di 2–6 elementi; ogni `color` segue lo schema di `colorRef` § 1 punto 1/2 sopra
   (nessun `allowAlpha` implicito — un gradiente con stop trasparenti è un caso reale ma non del
   primo rilascio: `allowAlpha` non è un parametro di `GradientPropSpec`, resta `false` per
   costruzione finché un requisito concreto non lo richiede).
2. `angle` obbligatorio con `type: 'linear'` per il renderer (`toCss()`, § 7 sotto) ma non
   obbligatorio nello schema: assente → default `180` (dall'alto verso il basso, convenzione CSS
   `linear-gradient` senza angolo esplicito) applicato dal renderer, non dal validator (stesso
   principio "presentazione, non validazione" di `styleBackgroundPosition`).
3. `position` ammesso solo con `type: 'radial'`: il validatore non rifiuta `position` presente con
   `type: 'linear'` (nessuna logica cross-campo nel validatore, stesso principio dichiarato per
   `image.block.ts` riga 16-18 — "il validator non ha condizionali fra prop"), il renderer lo ignora
   in quel caso.
4. Non `stateful` in questo round (un gradiente hover è un caso raro non richiesto dal gap
   analysis); `responsive` non dichiarato da nessun uso previsto in R1/R2.

---

## 7. `position`

```ts
export interface PositionPropSpec extends BasePropSpec {
  kind: 'position';
}

interface PositionValue {
  type: 'default' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  offset?: { top?: UnitValue; right?: UnitValue; bottom?: UnitValue; left?: UnitValue }; // px|%|vh|vw, -1000–1000
  zIndex?: number; // -10–9999
  sticky?: { edge: 'top' | 'bottom'; offset: UnitValue; onBreakpoints: string[]; stayInParent: boolean };
}
```

### Schema di validazione
1. `offset.*` e `sticky.offset`: `UnitValue` con `unit` in `px|%|vh|vw`, `value` in `[-1000, 1000]`
   (intervallo fisso, stesso trattamento di `radius`/`border`/`shadow`).
2. `sticky.onBreakpoints`: array di chiavi valide contro `resolveActiveBreakpoints()` (ADR-76),
   stesso principio "chiave nota ma disattivata è accettata, chiave sconosciuta è rifiutata" di
   ADR-76 § "Decisione" punto 5, applicato qui a un array invece che a una singola chiave di
   envelope.
3. `sticky` presente con `type` diverso da `'sticky'` non è un errore di validazione (nessuna
   logica cross-campo, come sopra): il renderer lo ignora.
4. **Vincolo del validatore, non del `kind`**: `type: 'fixed'|'absolute'` non è ammesso su un nodo
   figlio di `globalRef` (`SPEC-propkind-v2.md` § 3.8, ultima riga) — implementato come regola di
   albero nel validatore (stesso meccanismo di `insideGlobalSection` già usato per il divieto di
   ciclo di ADR-55), non come vincolo dentro `PositionPropSpec`: il descrittore da solo non conosce
   la posizione del nodo nell'albero.
5. Non `stateful`, non `responsive` sul `type`/`zIndex` (un elemento non cambia il proprio modello di
   posizionamento per breakpoint in modo dichiarativo in questo round); `offset` **può** essere
   dichiarato `responsive` dal blocco ospite (un offset diverso su mobile è un caso reale, es.
   elemento absolute riposizionato), la forma segue ADR-29 sull'intero oggetto `offset`, non campo
   per campo (a differenza di `typography`, qui non c'è un caso d'uso che chieda la granularità
   per singolo lato).

---

## 8. `transform`

```ts
export interface TransformPropSpec extends BasePropSpec {
  kind: 'transform';
  stateful?: boolean;
}

interface TransformValue {
  rotate?: number;   // -360–360 (gradi)
  scale?: number;    // 0–3
  skewX?: number;    // -90–90
  skewY?: number;    // -90–90
  translateX?: UnitValue; // px|%
  translateY?: UnitValue; // px|%
  flipH?: boolean;
  flipV?: boolean;
  origin?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top left' | 'top right' | 'bottom left' | 'bottom right';
}
```

### Schema di validazione
1. Ogni campo numerico verifica il proprio intervallo fisso indicato sopra; `translateX`/
   `translateY` sono `UnitValue` con `unit` in `px|%`, stesso range di `styleWidth`/`styleHeight`
   già in uso su `container`/`image` (0–4000/0–3840, ma qui l'intervallo è quello dichiarato da
   `SPEC-propkind-v2.md` § 3.9 per traslazione — un valore diverso perché il caso d'uso è diverso,
   uno spostamento relativo, non una dimensione assoluta).
2. `stateful: true` è il caso d'uso dominante (ADR-75 § "Decisione" punto 6 lo elenca esplicitamente
   fra i `kind` che lo dichiarano) — un `transform` Hover (es. `scale(1.05)` al passaggio del mouse
   su una card) è il pattern più comune di micro-interazione Elementor. `responsive` ammesso e
   indipendente, stesso principio di `position`.

---

## 9. `filter`

```ts
export interface FilterPropSpec extends BasePropSpec {
  kind: 'filter';
  stateful?: boolean;
}

type BlendMode = 'normal'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'color-dodge'|'color-burn'|'hard-light'|'soft-light'|'difference'|'exclusion';

interface FilterValue {
  blur?: number;       // 0–20 (px)
  brightness?: number; // 0–200 (%)
  contrast?: number;   // 0–200 (%)
  saturate?: number;   // 0–200 (%)
  hue?: number;        // 0–360 (deg)
  grayscale?: number;  // 0–100 (%)
  blend?: BlendMode;
}
```

### Schema di validazione
1. Ogni campo numerico verifica il proprio intervallo fisso (stessa scelta di `transform`: un solo
   uso sensato, nessun `min`/`max` configurabile dalla prop).
2. `blend`: elenco chiuso a 12 valori, lo stesso vocabolario `mix-blend-mode`/`background-blend-mode`
   di CSS — nessuna keyword fuori da questa lista è mai valida.
3. `stateful` ammesso per lo stesso motivo di `transform` (effetti hover su immagini: sfocatura o
   desaturazione che si rimuove al passaggio del mouse è un pattern Elementor comune, gap analysis
   § 1.2 "image: hover (opacity, filters, transform, transition)").

---

## Addendum S1.2 — proprietà CSS per `colorRef`/`spacing`

Gap individuato all'avvio del Sub-Task S1.2 (compilatore `toCss()`): a differenza degli altri 7
`kind` di questo documento, la proprietà CSS di destinazione di `colorRef` e `spacing` **non è
fissa per costruzione** — lo stesso `kind` è riusato per proprietà diverse a seconda del prop che
lo dichiara (`ADR-82-container-unificato-grid-flex.md` righe 102-104/145-147: `padding: spacing` e
`margin: spacing` sullo stesso `container`; gap analysis riga 49 "hover bg/text/border" per
`button`: lo stesso `colorRef` serve sia `styleBackgroundColor` che `styleColor`). Nessuno dei due
descrittori originari (sopra) portava un campo per questa informazione — `toCss()` non potrebbe
determinarla da `kind` + valore da solo.

**Decisione** (approvata in sessione, marketing@antelmagroup.net, 2026-09-17, contestualmente
all'avvio di S1.2): aggiungere un campo **obbligatorio** additivo a ciascuno dei due descrittori
(sopra, già integrato nei blocchi di codice):
- `ColorRefPropSpec.cssProperty`: unione chiusa a 4 valori (`color`/`background-color`/
  `border-color`/`outline-color`), stesso principio delle unioni chiuse già in vigore nel registro
  (niente stringa libera, coerente con `CssClassNamePropSpec`/`HtmlIdPropSpec` § pattern fisso).
- `SpacingPropSpec.target`: unione chiusa a 2 valori (`padding`/`margin`).

Campo **obbligatorio** e non opzionale (a differenza di `stateful`/`responsive`) perché senza di
esso `toCss()` non ha alcun fallback sensato per questi due `kind` — un default silenzioso
produrrebbe CSS errato senza segnalazione, mentre ogni prop che dichiara oggi/in futuro questi
`kind` deve specificarlo esplicitamente. Nessun impatto sul validatore (`block-tree-validator.
service.ts`): il campo è letto solo dal compilatore, la forma del *valore* validato non cambia.
`toCss()` § 10 punto 4 sotto usa questi campi per selezionare la/e proprietà emesse.

---

## 10. `toCss()` — compilazione unica per `kind`

### Firma
```ts
function toCss(
  kind: PropKind,
  spec: PropSpec,
  value: unknown,
  ctx: { blockId: string; activeBreakpoints: ResolvedBreakpoint[] /* ADR-76 */ }
): CssDeclarationBlock[];

interface CssDeclarationBlock {
  selector: string;          // '[data-block="<blockId>"]' (+ ':hover' se stato != 'normal')
  mediaQuery?: string;       // '(max-width: 1024px)' ecc., assente per il breakpoint 'default'
  declarations: { property: string; value: string }[];
}
```

### Algoritmo
1. **Normalizzazione dell'envelope**: se `spec.stateful`/`spec.responsive` sono assenti, il valore è
   trattato come un unico ramo `{ normal: { default: value } }` — la stessa funzione gestisce lo
   scalare e la forma annidata senza un ramo `if` separato per ciascuna combinazione (principio già
   dichiarato da ADR-75 § "Decisione" punto 5 per il validatore, esteso qui al renderer).
2. **Iterazione esterna sugli stati presenti**, nell'ordine `normal, hover, focus, active` (mai
   l'ordine di inserimento dell'oggetto, per garanzia di determinismo del CSS emesso — due export
   dello stesso contenuto producono byte identici, requisito già implicito in ADR-53 § "build
   deterministica"). Per ogni stato: `selector = '[data-block="<id>"]' + (stato === 'normal' ? '' :
   ':' + stato)`.
3. **Iterazione interna sui breakpoint presenti nel ramo di stato**, nell'ordine dei 7 nomi di
   ADR-76 § "Decisione" punto 1 (`default, widescreen, laptop, tabletExtra, tablet, mobileExtra,
   mobile`), **filtrati** contro `ctx.activeBreakpoints` (una chiave presente nel valore ma
   disattivata a livello di sito non produce un blocco — ADR-76 § "Decisione" punto 4). Per ogni
   breakpoint diverso da `default`: `mediaQuery` è la soglia (`max-width`/`min-width`) di quel
   breakpoint nella configurazione corrente, mai un valore cablato nel contenuto.
4. **Funzione di conversione valore→dichiarazioni CSS, una per `kind`**, invocata sul "valore nudo"
   risolto da ciascuna combinazione stato×breakpoint: è qui che ogni interfaccia di questo documento
   ha la propria implementazione (`typographyToDeclarations`, `spacingToDeclarations`, ecc.), mai
   condivisa fra `kind` diversi — stesso principio di specificità già in vigore per `border`/
   `shadow` (`prop-spec.types.ts` righe 197-223), esteso ai nuovi `kind` compositi.
5. **`colorRef`/`fontRef` non emettono mai un valore letterale**: `colorRef` con `{ref}` emette
   `var(--gk-color-<id>)` (`SPEC-GLOBAL-KIT.md` § 3), `colorRef` con hex letterale emette l'hex
   così com'è. Stessa distinzione per `fontRef`. La proprietà CSS emessa è `spec.cssProperty`
   (Addendum S1.2 sopra), mai dedotta dal nome della prop o cablata nel generatore.
5bis. **`spacing` emette sul lato `spec.target`** (Addendum S1.2 sopra): `padding-top/right/
   bottom/left` se `target: 'padding'`, `margin-top/right/bottom/left` se `target: 'margin'` —
   stesso generatore di dichiarazioni per entrambi, cambia solo il prefisso di proprietà letto dal
   descrittore.
6. **Nessuna deduplicazione fra blocchi diversi**: ogni nodo emette il proprio insieme completo di
   `CssDeclarationBlock`, anche se identico a un nodo fratello — coerente con la scelta già fatta per
   il CSS critico inline di ADR-53 § 2 (il costo di duplicazione è accettato in cambio di zero
   dipendenze incrociate fra selettori).

### Esempio — `styleBackground` (`background`, `stateful: true`) su un blocco `button`
Valore salvato:
```json
{
  "normal": { "default": { "ref": "primary" } },
  "hover":  { "default": "#1b5fa8" }
}
```
Output di `toCss()`:
```css
[data-block="b3"] { background-color: var(--gk-color-primary); }
[data-block="b3"]:hover { background-color: #1b5fa8; }
```

### Esempio — `styleFontSize` dentro `typography` (`responsive` per campo) su un `heading`
Valore salvato:
```json
{ "typography": { "fontSize": { "default": { "value": 32, "unit": "px" }, "mobile": { "value": 22, "unit": "px" } } } }
```
Output di `toCss()` (breakpoint `mobile` attivo, soglia 767px, ADR-76 default):
```css
[data-block="b7"] { font-size: 32px; }
@media (max-width: 767px) { [data-block="b7"] { font-size: 22px; } }
```

## Criteri di verifica
- Test snapshot per ciascuno dei 9 `kind`: valore minimo, valore massimo, valore malformato →
  `reason` atteso sul path corretto.
- Test `toCss()` combinatorio: un valore a 4 stati × 3 breakpoint attivi produce esattamente 12
  blocchi (o meno, per i rami assenti), nell'ordine dichiarato al § 10 punto 2/3 — stesso principio
  del test richiesto da ADR-75 § "Conformità".
- Test di non-rottura: nessuna modifica a `PropKind`/`PropSpec` esistenti (righe 17-32, 246-261 di
  `prop-spec.types.ts`) — solo unione additiva.
- Test dedicato `colorRef`/`fontRef`: un `{ref}` verso un id system non risolve mai a `undefined`
  (i 4+4 id system non sono cancellabili, ADR-77 § "Conformità").

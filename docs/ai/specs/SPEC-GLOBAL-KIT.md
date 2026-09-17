# SPEC — Global Kit: schema `app_settings.global_kit` e compilazione `global-kit.css`

## Status
[x] Bozza — round R1 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (round R1 dipendente).

## Relazione con gli altri documenti
Dettaglio implementativo di `ADR-77-global-kit-schema.md` (decisione già firmata a livello di
schema e di meccanismo di risoluzione) e di `docs/SPEC-propkind-v2.md` § 5. Questo documento non
riapre nessuna decisione di ADR-77: ne fissa i DTO, l'endpoint e l'algoritmo di compilazione a un
livello di dettaglio sufficiente per `PLAN-parita-elementor-pro.md` § R1 T3 (`settings/global-kit`).

## ADR applicabili
- `ADR-77-global-kit-schema.md` — riga `app_settings` singleton, 4 colori/4 font system non
  eliminabili, risoluzione a export via CSS custom properties, un solo file rigenerato per cambio
  palette.
- `ADR-76-breakpoints-configurabili.md` — `breakpoints` resta una riga `app_settings` distinta,
  **non** dentro `global_kit` (ADR-77 § "Decisione" punto 1): questo documento non la ridichiara.
- `ADR-78-sanitizzazione-css-e-sandbox-html.md` — `customCode` dentro `global_kit` è la stessa
  superficie regolata da quell'ADR (Admin+, nonce), qui solo la posizione nello schema.
- `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 1/§ 2/§ 3 — `ColorRefValue`/`FontRefValue`/
  `TypographyValue` sono gli stessi tipi usati dentro `themeStyle` qui sotto: nessuna forma
  duplicata per lo stesso concetto.

---

## 1. Schema `app_settings.global_kit` (`value: jsonb`)

```ts
interface GlobalKitValue {
  colors: GlobalColorEntry[];
  fonts: GlobalFontEntry[];
  themeStyle: ThemeStyle;
  layout: LayoutSettings;
  lightbox: LightboxSettings;
  customFonts: CustomFontEntry[];
  customIcons: CustomIconEntry[];
  customCode: CustomCodeEntry[];
}

interface GlobalColorEntry {
  id: 'primary' | 'secondary' | 'text' | 'accent' | string; // string = guid 16 hex per i custom
  label: string;       // ≤ 60 char, libero (etichetta visibile, non identificatore)
  value: string;        // '#RGB'|'#RRGGBB'|'#RRGGBBAA', stesso pattern di ColorRefValue letterale
  system: boolean;      // true per i 4 id riservati, calcolato dal backend, mai scritto dal client
}

interface GlobalFontEntry {
  id: 'primary' | 'secondary' | 'text' | 'accent' | string;
  label: string;
  typography: TypographyValue; // SPEC-PROPKIND-V2-DETAILS.md § 3, senza modificatori stateful/responsive qui
  system: boolean;
}

interface ThemeStyle {
  body: { typography: TypographyValue; color: ColorRefValue; background: ColorRefValue };
  h1: ElementStyle; h2: ElementStyle; h3: ElementStyle; h4: ElementStyle; h5: ElementStyle; h6: ElementStyle;
  link: { color: StatefulColorRef };            // stateful: normal/hover (ADR-75)
  button: ButtonThemeStyle;                     // stateful su background/color/border
  image: { border: BorderValue; radius: RadiusValue; shadow: ShadowValue }; // stateful su shadow
  formFields: { border: BorderValue; radius: RadiusValue; color: ColorRefValue; background: ColorRefValue };
}
interface ElementStyle { typography: TypographyValue; color: ColorRefValue; }
interface ButtonThemeStyle {
  typography: TypographyValue;
  background: StatefulColorRef;
  color: StatefulColorRef;
  border: BorderValue;
  radius: RadiusValue;
}
/** Forma stateful minimale riusata qui: solo normal/hover, mai focus/active per il tema di sito
 * (ADR-75 § "Decisione" punto 3 fissa l'elenco chiuso a 4 stati per le prop di blocco; il tema di
 * sito è un default globale, non un'istanza — restringerlo a normal/hover evita un pannello Site
 * Settings a 4 stati per ogni elemento senza un requisito che lo chieda). */
interface StatefulColorRef { normal: ColorRefValue; hover?: ColorRefValue; }

interface LayoutSettings {
  contentWidth: UnitValue;          // default 1140px, coerente con 'boxed' di section/container
  widgetSpace: UnitValue;           // spaziatura di default fra widget in un container, px
  pageTitleSelector: 'h1' | 'none'; // se 'h1', il titolo pagina del template genera l'unico h1 (ADR-21 § 5)
  defaultContainerPadding: SpacingValue;
}

interface LightboxSettings {
  enabled: boolean;
  bgColor: ColorRefValue;
  uiColor: ColorRefValue;
  showTitle: boolean;
  showDescription: boolean;
  zoom: boolean;
  share: boolean;
}

interface CustomFontEntry {
  id: string;      // guid 16 hex
  family: string;  // ≤ 60 char, allowlist non richiesta (è il nome scelto dall'utente per il proprio font)
  files: { woff2: string /* mediaRef guid */ }[]; // 1 per peso dichiarato in `weights`
  weights: ('100'|'200'|'300'|'400'|'500'|'600'|'700'|'800'|'900')[];
}

interface CustomIconEntry {
  id: string;         // guid 16 hex
  svgMediaRef: string; // guid 16 hex, sanitizzato DOMPurify 'svg-strict' (ADR-80 § 10)
  label: string;       // ≤ 60 char
}

interface CustomCodeEntry {
  id: string;                                  // guid 16 hex
  location: 'head' | 'bodyStart' | 'bodyEnd';
  priority: number;                            // ordine di iniezione fra più snippet, 0–100
  code: string;                                // ≤ 20000 char, nessuna sanitizzazione HTML (ADR-78 non copre customCode: resta Admin+ come unico controllo)
  conditions: ConditionsValue;                 // SPEC-propkind-v2.md § 3.19, riusato identico
}
```

### Vincoli di validazione
1. `colors`/`fonts`: esattamente 4 entry con `system: true` e `id` fra i 4 riservati, sempre
   presenti anche in un kit appena creato (seed di default, non un array che può risultare vuoto).
   Entry custom: `id` guid 16 hex generato dal backend alla creazione, mai accettato dal client in
   `POST` (stesso principio di `mediaRef`/`pageRef`: l'identificatore stabile non è mai un input
   utente). `colors` ≤ 34 entry totali (4 system + 30 custom), `fonts` ≤ 24 (4 + 20) — limiti da
   `ADR-77` § "Decisione" punto 1.
2. `system: true` è **derivato**, non scrivibile: un `PUT` che tenta di impostare `system: false` su
   uno dei 4 id riservati, o `system: true` su un id non riservato, è rifiutato con `400` (DTO-level,
   `class-validator` — questo endpoint non passa dal validatore ad albero dei blocchi, è un DTO
   applicativo ordinario, coerente con ADR-21 § 2 "quel campo non regola le props di blocco").
3. Un `DELETE`/una rimozione dall'array di un'entry con `id` system produce `409` (ADR-77 §
   "Conformità": "non è mai cancellabile via API").
4. `ThemeStyle.*` non ha campi obbligatori a livello di singolo elemento (`h1`, `link`, …): un kit
   può dichiarare solo un sottoinsieme, il resto eredita il default hardcoded del foglio di stile
   base (stesso principio "fallback nel CSS, non nel validator" di ADR-77 § "Decisione" punto 5).
5. `customFonts[].files`: un `woff2` per ogni voce di `weights`, stesso ordine — un peso dichiarato
   senza il proprio file produce `400` (`reason: 'required'` sul path dell'array).
6. `customCode`: RBAC Admin+ enforced dal controller (`app/settings/global-kit`), non dal DTO — un
   `Manager` che invia un `PUT` con `customCode` valorizzato riceve `403` prima ancora che il body
   sia validato (stessa soglia già decisa da ADR-78 § "Decisione" punto 10 per il profilo "sandbox
   libera").

---

## 2. Endpoint

| Metodo | Path | Autenticazione | Note |
|---|---|---|---|
| `GET` | `app/settings/global-kit` | JWT, qualunque ruolo autenticato | Legge il singleton, seed di default se la riga non esiste ancora (stesso pattern lazy-seed di `app_settings.breakpoints`, ADR-76) |
| `PUT` | `app/settings/global-kit` | JWT, **Admin+** per `themeStyle`/`layout`/`customCode`; **Manager+** per `colors`/`fonts`/`customFonts`/`customIcons`/`lightbox` (soglia coerente con la distinzione già introdotta da ADR-77 § "Decisione" punto 6) | Sostituzione integrale del `jsonb` (nessun `PATCH` parziale — stesso pattern già in uso per singleton `app_settings`), lock ottimistico su `version` → `409` |
| `GET` | `public/global-kit.css` | Nessuna (escluso da `AuthMiddleware`, `docs/constitution.md` § Convenzioni API) | Sola lettura, cache HTTP lunga con fingerprint nell'URL (`global-kit.<hash>.css`), rigenerato al `PUT` riuscito |

Il `PUT` che tocca **solo** `colors`/`fonts`/`themeStyle`/`layout`/`lightbox` accoda esclusivamente
la rigenerazione di `global-kit.css` (ADR-77 § "Decisione" punto 4: nessun job `enqueueFullSiteExport`).
Un `PUT` che cambia `layout.contentWidth` **e** contestualmente altera il markup atteso (non i soli
valori dei token) segue invece la strada di `enqueueFullSiteExport` — la distinzione fra le due non è
nello schema ma nel job che elabora la richiesta, fuori scope di questo documento (rinviata
all'implementazione di R1 T3).

---

## 3. Compilazione `global-kit.css`

### Convenzione di naming delle custom property
| Sorgente | Variabile CSS |
|---|---|
| `colors[].value` (id `<id>`) | `--gk-color-<id>` |
| `fonts[].typography.fontFamily` (id `<id>`) | `--gk-font-<id>-family` |
| `fonts[].typography.fontSize` (id `<id>`) | `--gk-font-<id>-size` |
| `fonts[].typography.fontWeight` (id `<id>`) | `--gk-font-<id>-weight` |
| `fonts[].typography.lineHeight` (id `<id>`) | `--gk-font-<id>-line-height` |
| `fonts[].typography.letterSpacing` (id `<id>`) | `--gk-font-<id>-letter-spacing` |
| `layout.contentWidth` | `--gk-layout-content-width` |
| `layout.widgetSpace` | `--gk-layout-widget-space` |
| `layout.defaultContainerPadding` | `--gk-layout-container-padding-{top,right,bottom,left}` |
| `lightbox.bgColor`/`uiColor` | `--gk-lightbox-bg`, `--gk-lightbox-ui` |

Un id custom (guid 16 hex) produce una variabile con quello stesso guid nel nome
(`--gk-color-3f9a1b2c4d5e6f70`): non leggibile a colpo d'occhio, ma stabile — è la stessa scelta già
fatta per `mediaRef`/`pageRef`, coerenza sull'intero progetto preferita alla leggibilità del CSS
generato.

### Algoritmo
1. Leggere `app_settings.global_kit` (unica lettura, nessuna paginazione: il kit è un singleto).
2. Emettere un blocco `:root { ... }` con una dichiarazione per ogni variabile della tabella sopra,
   per **ogni** entry di `colors`/`fonts` (system e custom, nello stesso ciclo — nessuna differenza
   di trattamento in fase di compilazione, la distinzione system/custom vale solo per la
   cancellabilità via API).
3. Emettere le regole di `themeStyle` come selettori di elemento generico (`body`, `h1`…`h6`, `a`,
   `button, .cms-button`, `img`, `input, textarea, select`), ciascuna che referenzia le variabili
   `--gk-*` emesse al punto 2 — **mai** un valore letterale duplicato: se un elemento del tema
   referenzia `{ ref: 'primary' }`, la regola emessa è `color: var(--gk-color-primary)`, non l'hex
   copiato. Gli stati `hover` di `link`/`button` emettono una seconda regola con lo stesso selettore
   più `:hover`, stesso principio di `toCss()` (`SPEC-PROPKIND-V2-DETAILS.md` § 10).
4. Emettere `customFonts[]` come blocchi `@font-face` (un blocco per peso dichiarato in `weights`,
   `src: url(<path risolto da woff2 mediaRef>) format('woff2')`).
5. Nessuna emissione per `customCode`/`customIcons`: vivono in punti diversi della pipeline di export
   (rispettivamente iniezione diretta nell'HTML per `location`, e risoluzione inline per singolo
   utilizzo di `kind: 'icon'` con `set: 'custom'` — mai dentro il foglio del kit).
6. Scrivere il file con fingerprint (`global-kit.<hash-contenuto>.css`) nella cartella statica
   pubblica, aggiornare il riferimento nel template HTML (stesso meccanismo di cache-busting già in
   uso per il CSS critico di ADR-53 § 3).

### Risoluzione dei riferimenti nel worker `static-export`
Per ogni nodo dell'albero con una prop `colorRef`/`fontRef` valorizzata `{ ref: <id> }`:
1. Se `<id>` esiste in `global_kit.colors`/`fonts` (system o custom): emettere `var(--gk-color-<id>)`
   / `var(--gk-font-<id>-*)` nel CSS critico della pagina (mai il valore letterale).
2. Se `<id>` **non** esiste (colore/font custom cancellato dopo che un blocco lo referenziava):
   risolvere al fallback `primary` ed emettere un warning nel report di build (`ADR-77` §
   "Conformità"), mai un crash o una regola CSS mancante.
3. Il worker non richiede una seconda lettura di `global_kit` per pagina: il valore è già risolto una
   volta per l'intera build e riusato per ogni pagina compilata nella stessa esecuzione (stesso
   principio di cache di processo già implicito in ADR-53 § "NFR build + sync entro 5 secondi").

---

## Criteri di verifica
- `GET app/settings/global-kit` su un'istanza senza riga esistente restituisce il seed di default
  (4 colori/4 font system con valori hardcoded, il resto vuoto) senza scrivere nulla finché non
  arriva un `PUT`.
- Un `PUT` che tenta `system: false` su `id: 'primary'` è rifiutato con `400`.
- Un `DELETE`/una rimozione di un'entry `system: true` da `colors[]` è rifiutata con `409`.
- Un `PUT` con `customCode` da un ruolo `Manager` è rifiutato con `403` prima della validazione DTO.
- Un cambio di un solo `colors[].value` rigenera `global-kit.css` e **non** accoda
  `enqueueFullSiteExport` — asserito verificando la coda dei job dopo il `PUT`.
- Un `{ref: <guid inesistente>}` in un blocco pubblicato risolve a `var(--gk-color-primary)` nel CSS
  della pagina esportata, con un warning nel report di build — mai un valore mancante o un errore
  che interrompe l'export.
- `GET public/global-kit.css` non richiede autenticazione (test di integrazione, stesso principio di
  ADR-77 § "Conformità").

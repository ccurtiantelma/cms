# ADR-85 — Registro dei 20 widget base CSS-Only: mixin "Avanzato", pattern di composizione, definizioni Contenuto/Stile/Avanzato

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata nuova: round **R4 — Widget base CSS-only** di
`docs/PLAN-parita-elementor-pro.md` § R4. Riferimenti sostanziali:
`docs/SPEC-propkind-v2.md` § 4.2/§ 4.3, `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.3.

## Numerazione
Vedi `ADR-84-bottom-dock-e-workflow-builder.md` § "Numerazione": round R4, primo numero libero dopo
ADR-84.

## ADR di riferimento (non superate, non modificate)
- `ADR-82-container-unificato-grid-flex.md` § "Decisione" punto 6 e § "Conseguenze": aveva
  dichiarato che il mixin "Avanzato" (`SPEC-propkind-v2.md` § 4.2) *"non è introdotto da questa
  ADR... la definizione formale del mixin resta un task di R2 T3/R4"*, fissando solo l'elenco delle
  prop che dovrà contenere. Questa ADR **è** quel task: definisce formalmente
  `advanced.mixin.ts` (§ "Decisione" punto 1), senza cambiare l'elenco già promesso da ADR-82.
- `ADR-80-provider-media-e-mappe.md` § "Conseguenze": aveva dichiarato esplicitamente aperto un
  dettaglio — *"Il click-to-load video introduce un secondo modulo del bundle pubblico... la
  decisione di merge/separazione è un dettaglio di implementazione di R4, non vincolato da questa
  ADR"*. Questa ADR chiude quel dettaglio (§ "Decisione" punto 6).
- `ADR-74-isole-js-pubbliche.md`/`ADR-53-air-gapped-ssg-zero-db.md` — i 20 widget di questa ADR
  sono **zero-JS pubblico per costruzione** (§ "Decisione" punto 6): nessuno dichiara
  `meta.runtime`, nessuno richiede il bundle `public-runtime.js` per essere visibile e funzionante.
- `ADR-78-sanitizzazione-css-e-sandbox-html.md` — il widget `html` di questo registro **è** il
  consumer diretto di `kind: 'html'` `profile: 'embed'`, invariato.
- `ADR-21-schema-blocchi-versionamento.md` § 2 — pattern "composizione a children" già in uso da
  `accordion`/`accordion-item`, `carousel`/`carousel-slide`, `tabs`/`tab-panel`, `nav-menu`/
  `nav-menu-item`, `form`/`form-field`: questa ADR **applica lo stesso pattern**, non ne inventa uno
  nuovo (§ "Decisione" punto 3).
- `docs/business-rules.md` § Blocchi regola 7 / `docs/glossary.md` — "Il Blocco HTML/embed
  personalizzato è riservato al SuperAdmin": vincolo ereditato, non riaperto, per il widget `html`
  di questo registro (§ "Decisione" punto 5).

---

## Contesto

`docs/PLAN-parita-elementor-pro.md` § R4 elenca 20 widget "base CSS-only" da registrare, renderizzare
e collegare all'inspector: `divider, spacer, icon, iconList, iconBox, imageBox, alert, starRating,
progress, testimonial, socialIcons, shareButtons, pricingTable, cta, flipBox, breadcrumbs,
tableOfContents, html, map, video`. Ognuno ha già una riga di "prop principali" in
`docs/SPEC-propkind-v2.md` § 4.3, ma quel documento — dettaglio del solo `PropKind` — non:

1. distingue quali prop appartengono al tab **Contenuto** e quali al tab **Stile** dell'inspector;
2. formalizza il mixin **Avanzato**, promesso da `ADR-82` ma mai scritto come tipo TypeScript;
3. decide **come** modellare i sotto-elementi ripetibili (`iconList.items`, `socialIcons.items`,
   `pricingTable.features`) o a slot fissi (`flipBox.front`/`back`) — `SPEC-propkind-v2.md` § 4.3 li
   scrive come notazione compatta (`items[{...}]`) senza dire se sono una prop a valore array o una
   composizione a `children`;
4. risolve, per `video`/`map`, il dettaglio lasciato esplicitamente aperto da `ADR-80` sul confine
   fra "zero-JS" (compatibile con R4, indipendente da R5 nel grafo delle dipendenze del PLAN) e
   "richiede il bundle pubblico" (R5+).

Questa ADR chiude tutti e quattro i punti, in modo che i 20 `BlockDefinition` di R4 possano essere
scritti senza altre decisioni in sospeso.

---

## Decisione

### 1. Mixin "Avanzato" — definizione formale

`app/backend/src/blocks/advanced.mixin.ts` (nuovo file), un oggetto TypeScript di descrittori di
prop condiviso per composizione esplicita in ogni `BlockDefinition` (**mai** un meccanismo di
ereditarietà o override implicito — coerente con `ADR-82` § "Decisione" punto 6: "il registro resta
esplicito per tipo: nessun override implicito"):

```typescript
export const ADVANCED_MIXIN_PROPS = {
  margin: { kind: 'spacing', units: ['px', '%', 'em'], min: -200, max: 500, allowNegative: true, required: false },
  padding: { kind: 'spacing', units: ['px', '%', 'em'], min: 0, max: 500, required: false },
  position: { kind: 'position', required: false },
  hideOn: { kind: 'enum', values: RESPONSIVE_BREAKPOINTS, multiple: true, required: false }, // § 2
  animation: { kind: 'animation', required: false },
  motion: { kind: 'motion', required: false },
  transform: { kind: 'transform', stateful: true, required: false },
  filter: { kind: 'filter', stateful: true, required: false },
  opacity: { kind: 'number', min: 0, max: 1, required: false },
  border: { kind: 'border', stateful: true, required: false },
  radius: { kind: 'radius', required: false },
  shadow: { kind: 'shadow', stateful: true, required: false },
  background: { kind: 'background', stateful: true, allowVideo: false, allowSlideshow: false, required: false },
  htmlId: { kind: 'htmlId', required: false },
  cssClass: { kind: 'cssClassName', required: false },
  attributes: { kind: 'attributes', required: false },
  css: { kind: 'css', maxLength: 5000, required: false },
} as const satisfies Record<string, PropSpec>;
```

Ogni `BlockDefinition` dei 20 widget dichiara `props: { ...ADVANCED_MIXIN_PROPS, ...ownContentProps,
...ownStyleProps }` — stessa identica lista di 17 chiavi già enumerata da `ADR-82` § "Decisione"
punto 6, nessuna aggiunta né rimozione: questa ADR ne fissa solo la **forma concreta** (quale
`PropSpec` esatto per ciascuna chiave), non l'elenco, già chiuso da quella decisione. `background`
qui **non** ammette `video`/`slideshow` (`allowVideo: false`, `allowSlideshow: false`): a differenza
di `container` (`ADR-82`, dove lo schema anticipa un renderer non ancora presente), un widget foglia
di R4 non ha un caso d'uso dichiarato per uno sfondo video/slideshow sul singolo widget — restringere
qui evita di accettare un valore che nessun renderer onorerà mai per questi tipi, a differenza del
debito esplicitamente accettato da `ADR-82` per `container`.

### 2. `EnumPropSpec.multiple` — modificatore additivo

`hideOn: BreakpointKey[]` (`SPEC-propkind-v2.md` § 4.1/§ 4.2) non ha mai avuto una forma di
validazione esplicita: nessun documento firmato dice come un array di token da un elenco chiuso si
valida. Questa ADR introduce il modificatore additivo `multiple?: boolean` su `EnumPropSpec`
(`prop-spec.types.ts` riga 109), stesso principio con cui `responsive`/`stateful` sono già stati
aggiunti a `BasePropSpec` (ADR-29/ADR-75): un booleano opzionale che cambia la **forma** del valore
atteso (`string` → `string[]`, ogni elemento validato contro lo stesso `spec.values`), mai il
`kind`. Non combinabile con `responsive` (nessun caso d'uso lo richiede: un `hideOn` "responsive"
non avrebbe senso concettuale, la sua stessa natura è già un elenco di breakpoint). Questo chiude
retroattivamente la forma di `hideOn` (`ADR-82`) e fornisce la forma di `shareButtons.networks`
(§ "Decisione" punto 4.4 sotto) senza introdurre un `kind` nuovo.

### 3. Pattern di composizione per sotto-elementi

Tre widget hanno sotto-elementi **ripetibili e riordinabili** dall'autore (l'utente aggiunge/
rimuove/riordina voci): seguono lo stesso pattern **parent + child block type** già in uso da
`accordion`/`accordion-item`, `carousel`/`carousel-slide`, `tabs`/`tab-panel`, `nav-menu`/
`nav-menu-item` — mai una prop a valore array di oggetti liberi, per lo stesso motivo per cui quei
cinque widget non lo fanno: ogni voce ripetibile diventa un nodo a sé con il proprio `id`, validato,
selezionabile e stilizzabile individualmente con la stessa macchina dell'inspector, senza un
sotto-editor dedicato per ogni prop ad array.

| Parent | Child type | `children.allow` del parent | Props del child |
|---|---|---|---|
| `iconList` | `iconListItem` | `['iconListItem']` | `icon: icon`, `text: plainText`, `link?: link` |
| `socialIcons` | `socialIconItem` | `['socialIconItem']` | `network: enum` (allowlist, § 4.11), `url: url` |
| `pricingTable` | `pricingTableFeature` | `['pricingTableFeature']` | `text: plainText`, `icon?: icon`, `included: boolean` |

Un quarto caso, `flipBox.front`/`flipBox.back`, **non** è ripetibile (esistono sempre esattamente
due facce, mai aggiunte o rimosse dall'autore): usa lo stesso pattern a `children` per riuso della
macchina dell'inspector, ma con una **regola di nesting** dedicata invece che un limite di
cardinalità libero — `flipBox` accetta `children.allow: ['flipBoxFace']`, esattamente 2 figli,
verificati dal validatore d'albero con un vincolo per-tipo analogo a quello già usato da
`global_sections` per lo slot unico (`ADR-40` § "Decisione", indice parziale) ma qui a livello di
albero, non di tabella: un tentativo di aggiungere un terzo `flipBoxFace` o di salvare `flipBox` con
un solo figlio è respinto con `BLOCK_NESTING_NOT_ALLOWED`, `path` sul nodo `flipBox` colpevole.
`flipBoxFace` dichiara `slot: enum('front'|'back')`, `required: true` — il validatore verifica che i
due figli abbiano `slot` diversi (una regola di albero, non di singola prop, stesso principio già
usato da `insideGlobalSection`/dal vincolo "un solo `layoutSlot` attivo" — qui applicato a livello di
singolo nodo `flipBox` invece che di tabella).

### 4. Registro dei 20 widget

Ogni riga sotto elenca **Contenuto** (prop specifiche del widget, valori nella notazione già usata
da `SPEC-propkind-v2.md` § 4.3) e **Stile** (prop specifiche di presentazione, sempre costruite sui
`kind` già approvati — nessun `kind` nuovo introdotto da questa ADR). **Avanzato** è sempre e solo
`ADVANCED_MIXIN_PROPS` (§ "Decisione" punto 1), non ripetuto riga per riga. Ogni widget:
`enabled: true`, `minRole: User` (nessuna soglia oltre l'accesso ordinario all'editor a blocchi),
salvo dove indicato diversamente. Categoria di palette: **"Base"** per tutti e 20 (
`PLAN-parita-elementor-pro.md` § R4: "Palette riorganizzata per categorie Elementor: Layout · Base ·
Pro · Form · Dinamici · Sito" — questi 20 sono la categoria "Base" per intero, nessuno ricade in
"Pro"/"Form"/"Dinamici"/"Sito", che restano popolate dai round successivi R6/R7/R8).

#### 4.1 `divider`
- **Contenuto**: `style: enum('solid'|'dashed'|'dotted'|'double')`, `element:
  enum('none'|'text'|'icon')`, `text?: plainText` (con `element: 'text'`), `icon?: icon` (con
  `element: 'icon'`).
- **Stile**: `color: colorRef`, `weight: unitValue (px, 1–20)`, `width: unitValue (px|%, 0–100 per
  cento o 0–2000 px)`, `align: enum('left'|'center'|'right')`, `gap: unitValue (px, 0–200)`.

#### 4.2 `spacer`
- **Contenuto**: nessuna (widget puramente strutturale).
- **Stile**: `height: unitValue (px|vh, responsive — un'altezza diversa per breakpoint è un caso
  reale dichiarato da Elementor stesso)`.

#### 4.3 `icon`
- **Contenuto**: `icon: icon`, `link?: link`.
- **Stile**: `view: enum('default'|'stacked'|'framed')`, `shape: enum('circle'|'square'|'none')`
  (rilevante solo con `view != 'default'`, presentazione non validazione — stesso principio già
  adottato per `gradient.position`), `size: unitValue (px, 8–400)`, `color: colorRef (stateful)`,
  `background: colorRef (stateful)` (rilevante solo con `view != 'default'`), `rotate: number
  (-360–360)`.

#### 4.4 `iconList` + `iconListItem`
- **`iconList` Contenuto**: nessuna prop propria oltre ai `children` (§ "Decisione" punto 3).
- **`iconList` Stile**: `layout: enum('vertical'|'horizontal'|'inline')`, `spaceBetween: unitValue
  (px, 0–100)`, `divider: boolean`, `iconAlign: enum('left'|'top')`.
- **`iconListItem` Contenuto**: `icon: icon`, `text: plainText`, `link?: link`.
- **`iconListItem` Stile**: `color: colorRef (stateful)`, `typography: typography`.

#### 4.5 `iconBox`
- **Contenuto**: `icon: icon`, `title: plainText`, `titleTag: enum('h2'|'h3'|'h4'|'h5'|'h6'|'div')`
  (mai `h1`, coerente con `ADR-21` § 5/`SPEC-GLOBAL-KIT.md` § 1 `pageTitleSelector` — un solo `h1`
  per pagina, quello del template, mai un widget di contenuto), `description: richText`, `link?:
  link`.
- **Stile**: `position: enum('top'|'left'|'right')`, `iconSpacing: unitValue (px, 0–100)`, `icon:
  { color: colorRef (stateful), background: colorRef (stateful), size: unitValue }`, `title:
  typography`, `description: typography`.

#### 4.6 `imageBox`
- **Contenuto**: `image: mediaRef`, `title: plainText`, `description: richText`, `link?: link`.
- **Stile**: `position: enum('top'|'left'|'right')`, `imageSize: unitValue (px, 20–800)`, `imageGap:
  unitValue (px, 0–100)`, `title: typography`, `description: typography`.

#### 4.7 `alert`
- **Contenuto**: `type: enum('info'|'success'|'warning'|'danger')`, `title: plainText`,
  `description: richText`, `dismissible: boolean`.
- **Stile**: `background: colorRef`, `borderColor: colorRef`, `textColor: colorRef`, `icon:
  boolean` (mostra/nasconde l'icona automatica associata a `type`).

#### 4.8 `starRating`
- **Contenuto**: `rating: number (0–10, step 0.5)`, `scale: enum('5'|'10')`.
- **Stile**: `icon: icon` (default una stella dall'allowlist Tabler, `ADR-80` § 9), `markedColor:
  colorRef`, `unmarkedColor: colorRef`, `size: unitValue (px, 8–100)`.

#### 4.9 `progress` (statico — nessuna animazione di riempimento, § "Decisione" punto 6)
- **Contenuto**: `title: plainText`, `percent: number (0–100)`, `displayPercent: boolean`,
  `innerText?: plainText` (sovrascrive l'etichetta percentuale se presente).
- **Stile**: `barColor: colorRef`, `trackColor: colorRef`, `height: unitValue (px, 4–60)`, `radius:
  radius`.

#### 4.10 `testimonial`
- **Contenuto**: `content: richText`, `image?: mediaRef`, `name: plainText`, `title?: plainText`
  (ruolo/azienda), `imagePosition: enum('top'|'left'|'right')`.
- **Stile**: `align: enum('left'|'center'|'right')`, `content: typography`, `name: typography`,
  `title: typography`, `imageSize: unitValue (px, 20–300)`.

#### 4.11 `socialIcons` + `socialIconItem`
- **`socialIcons` Contenuto**: nessuna prop propria oltre ai `children`.
- **`socialIcons` Stile**: `shape: enum('circle'|'square'|'rounded')`, `columns: number (1–10)`,
  `align: enum('left'|'center'|'right')`.
- **`socialIconItem` Contenuto**: `network: enum` — allowlist chiusa, stesso principio "elenco
  chiuso, mai libero" già applicato a icone/font: `'facebook'|'instagram'|'linkedin'|'x'|'youtube'|
  'tiktok'|'pinterest'|'whatsapp'|'telegram'|'email'|'rss'|'website'`; `url: url` (con `network:
  'email'`, schema `mailto:` ammesso dal `kind: 'url'` esistente, nessuna eccezione da introdurre).
- **`socialIconItem` Stile**: `color: colorRef (stateful)`, `background: colorRef (stateful)`.

#### 4.12 `shareButtons` (link statici, nessuna finestra popup via JS — § "Decisione" punto 6)
- **Contenuto**: `networks: enum, multiple: true` (§ "Decisione" punto 2) — allowlist chiusa
  `'facebook'|'x'|'linkedin'|'whatsapp'|'telegram'|'email'|'pinterest'`, `label: enum('none'|
  'text'|'network')`.
- **Stile**: `view: enum('icon'|'text'|'icon-text')`, `skin: enum('classic'|'minimal'|'framed')`,
  `shape: enum('circle'|'square'|'rounded')`, `color: colorRef (stateful)`.
- **Nota di rendering**: ogni pulsante è un `<a href>` diretto all'URL di condivisione standard del
  network (es. `https://www.facebook.com/sharer/sharer.php?u=<url pagina>`), calcolato dal worker di
  export al momento della build con l'URL pubblico della pagina — nessun JavaScript, nessuna finestra
  popup script-driven (Elementor la apre via `window.open`; qui il link naviga nella stessa scheda o
  in una nuova a scelta di `target`, coerente con "zero-JS" di questo registro).

#### 4.13 `pricingTable` + `pricingTableFeature`
- **`pricingTable` Contenuto**: `title: plainText`, `subtitle?: plainText`, `currency: plainText
  (≤ 5 char, es. "€"/"$")`, `price: plainText (≤ 20 char — testo libero, non `number`: ammette
  formati come "29,99" o "Contattaci")`, `period?: plainText` (es. "/mese"), `button: link`,
  `ribbon?: plainText` (etichetta "Popolare"/"Consigliato").
- **`pricingTable` Stile**: `highlighted: boolean` (evidenzia la card), `background: colorRef
  (stateful)`, `border: border (stateful)`, `title: typography`, `price: typography`, `ribbon: {
  background: colorRef, color: colorRef }`.
- **`pricingTableFeature` Contenuto**: `text: plainText`, `icon?: icon`, `included: boolean`
  (determina l'icona automatica ✓/✗ quando `icon` è assente).
- **`pricingTableFeature` Stile**: `color: colorRef`, `strikethrough: boolean` (con `included:
  false`).

#### 4.14 `cta`
- **Contenuto**: `image?: mediaRef`, `title: plainText`, `description: richText`, `button: link`,
  `ribbon?: plainText`.
- **Stile**: `hoverEffect: enum('none'|'zoom'|'shine'|'move-up')` (interamente CSS: `transition`/
  `transform`/`filter` su `:hover`, nessun JavaScript), `background: background (stateful)`,
  `title: typography`, `description: typography`.

#### 4.15 `flipBox` + `flipBoxFace`
- **`flipBox` Contenuto**: nessuna prop propria oltre ai `children` (esattamente 2, § "Decisione"
  punto 3).
- **`flipBox` Stile**: `effect: enum('flip'|'slide'|'fade')`, `direction: enum('left'|'right'|
  'top'|'bottom')` (rilevante per `effect: 'flip'|'slide'`), `height: unitValue (px, 100–1000)`,
  `durationMs: number (0–2000)`.
- **`flipBoxFace` Contenuto**: `slot: enum('front'|'back'), required: true`, `icon?: icon`,
  `image?: mediaRef`, `title: plainText`, `description?: richText`, `link?: link` (attivo solo sulla
  faccia `back`, presentazione non validazione).
- **`flipBoxFace` Stile**: `background: background (stateful)`, `title: typography`, `description:
  typography`.
- **Nota di rendering**: l'effetto è interamente `transform: rotateY/rotateX` + `transition` CSS su
  hover/focus del contenitore — nessun JavaScript, coerente con "hover CSS" di
  `PLAN-parita-elementor-pro.md` § R4.

#### 4.16 `breadcrumbs`
- **Contenuto**: `separator: enum('/'|'>'|'•'|'→')`, `showHome: boolean`, `homeLabel: plainText`.
- **Stile**: `color: colorRef`, `activeColor: colorRef`, `separatorColor: colorRef`, `typography:
  typography`.
- **Nota di rendering**: il percorso (Home → antenati → pagina corrente) è risolto **staticamente
  dal worker di export** dalla gerarchia `pages.parentId` (`ADR-24`), mai calcolato lato client —
  zero-JS per costruzione, nessuna isola richiesta.

#### 4.17 `tableOfContents` (statico da heading a export — § "Decisione" punto 6)
- **Contenuto**: `title: plainText`, `headingLevels: enum, multiple: true (`'h2'|'h3'|'h4'|'h5'|
  'h6'`)`, `hierarchical: boolean`.
- **Stile**: `collapsible: boolean` (con CSS `<details>`/`<summary>` nativo, **non** un toggle
  JavaScript — zero-JS per costruzione), `minimizeOnMobile: boolean`, `typography: typography`,
  `activeColor: colorRef`.
- **Nota di rendering**: l'indice è generato dal worker di export enumerando gli heading
  effettivamente presenti nell'albero della pagina al momento della build (con id-anchor generati
  deterministicamente, stesso principio "build deterministica" di `ADR-53`) — nessuno scroll-spy
  (evidenziazione della voce attiva durante lo scroll) in R4: quella capacità è esplicitamente
  un'isola JS (`toc`, `ADR-74` § 1) e resta fuori scope, un miglioramento progressivo di R5+ che non
  richiede alcuna modifica di schema quando arriverà.

#### 4.18 `html` (embed allowlist — riservato SuperAdmin)
- **Contenuto**: `code: html` (`kind: 'html'`, `profile: 'embed'`, `ADR-78` § "Decisione" punto 7 —
  solo `<iframe>` da host allowlisted, `sandbox` forzato, nessuno `<script>`).
- **Stile**: `width: unitValue (px|%)`, `height: unitValue (px)`, `aspectRatio: enum('16:9'|'4:3'|
  '1:1'|'custom')`.
- **`minRole: SuperAdmin`** — eredita `docs/business-rules.md` § Blocchi regola 7/`docs/
  glossary.md` ("Il Blocco HTML/embed personalizzato è riservato al SuperAdmin"), **a livello di
  intero widget**, indipendentemente dal profilo di `kind: 'html'` scelto: la soglia di
  `ADR-78` § 10 ("`kind: 'html'` con `profile: 'embed'` segue... nessuna soglia aggiuntiva, lo
  stesso `minRole` del blocco ospite") è compatibile con questa restrizione — è proprio il
  `minRole` del blocco ospite, fissato qui a SuperAdmin dalla regola di dominio preesistente, non
  una soglia aggiuntiva introdotta da questa ADR.

#### 4.19 `map` (OSM embed statico — chiude il dettaglio R4 di ADR-80, § "Decisione" punto 6)
- **Contenuto**: `provider: enum('osm'|'google-embed')` (`ADR-80` § "Decisione" punto 1: `osm`
  raccomandato e unico renderizzato in R4, `google-embed` ammesso nel tipo per compatibilità futura
  ma senza implementazione — stesso schema di rinvio già usato da `ADR-82` per `link`/`animation`/
  `motion` su `container`), `address: plainText` **oppure** `lat: number (-90–90)` + `lng: number
  (-180–180)` (presentazione non validazione: entrambe le forme sono accettate dal validatore,
  il renderer preferisce `lat`/`lng` se presenti), `zoom: number (1–19)`.
- **Stile**: `height: unitValue (px, 150–1200)`, `grayscale: boolean` (filtro CSS `filter:
  grayscale(1)` sull'iframe, puramente estetico).
- **Nota di rendering (chiude il dettaglio R4)**: il widget produce sempre un `<iframe>` statico
  verso `https://www.openstreetmap.org/export/embed.html?bbox=...&marker=<lat>,<lng>` (nessuna
  chiamata JavaScript, nessuna dipendenza Leaflet in questo round) — un singolo marker, zoom fisso,
  nessuna interazione oltre quella nativa dell'iframe stesso (pan/zoom con le dita/il mouse, già
  presenti nell'iframe di OpenStreetMap senza alcun codice del CMS). La versione interattiva con
  Leaflet self-hosted, marker multipli e stile mappa personalizzato (`ADR-80` § "Decisione" punto 2)
  resta **esplicitamente fuori scope di R4**: richiede `meta.runtime: ['map']` e il bundle
  `public-runtime.js`, introdotti da R5/R6 come miglioramento progressivo dello stesso widget — la
  prop `provider`/`lat`/`lng`/`zoom` già scritte oggi restano valide e non richiedono alcuna
  migrazione quando quella capacità arriva (stesso schema di rinvio di `ADR-82`).

#### 4.20 `video` (poster + click-through zero-JS — chiude il dettaglio R4 di ADR-80, § "Decisione" punto 6)
- **Contenuto**: `source: enum('youtube'|'vimeo'|'hosted')`, `url?: url` (con `source: 'youtube'|
  'vimeo'`), `mediaRef?: mediaRef` (con `source: 'hosted'`), `poster?: mediaRef`, `autoplay:
  boolean` (solo `hosted`, § "Decisione" punto 6 nota su `mute`), `mute: boolean`, `loop: boolean`,
  `controls: boolean` (default `true`), `aspectRatio: enum('16:9'|'4:3'|'1:1'|'custom')`.
- **Stile**: `posterOverlayColor: colorRef` (velo scuro sopra il poster), `playIconColor: colorRef`,
  `playIconSize: unitValue (px, 20–200)`.
- **`autoplay: true` richiede `mute: true`** (`ADR-80` § "Decisione" punto 5): vincolo verificato
  dal validatore del blocco (regola cross-prop dichiarata dal `BlockDefinition`, non dal `kind`
  sottostante — `boolean` da solo non conosce l'altro campo), `reason: 'format'` sul path di
  `autoplay` se violato. Rilevante solo per `source: 'hosted'`: un `youtube`/`vimeo` in R4 non ha
  mai autoplay (nota sotto).
- **Nota di rendering (chiude il dettaglio R4)**: per `source: 'youtube'|'vimeo'`, il widget produce
  sempre un poster `<img>` (da `poster` se presente, altrimenti la thumbnail ufficiale della
  piattaforma risolta a build-time) avvolto in un `<a href>` che punta **direttamente all'URL di
  origine del video** (`https://www.youtube.com/watch?v=<id>` o l'equivalente Vimeo, `target:
  '_blank' rel: 'noopener'`) — **zero JavaScript, zero iframe nella pagina di R4**: nessun modulo
  `public-runtime.js` richiesto, coerente con l'indipendenza di R4 da R5 nel grafo delle dipendenze
  di `PLAN-parita-elementor-pro.md` (*"R4 Widget base (CSS-only) ─┐ ... R5 Runtime pubblico ─┴─
  R6"*). L'iniezione in-pagina dell'iframe al click (descritta da `ADR-80` § "Decisione" punto 6
  come meccanismo tramite un modulo del bundle pubblico) resta un **miglioramento progressivo**
  disponibile solo a partire da R5/R6, quando `meta.runtime` e `public-runtime.js` esistono
  davvero: le stesse prop di questo widget (`source`/`url`/`poster`) bastano a produrre entrambi i
  comportamenti, la sola differenza è nel renderer del worker di export, non nello schema —
  nessuna migrazione richiesta quando R5 introdurrà quel miglioramento. `source: 'hosted'` usa
  sempre `<video>` nativo (nessun embed di terze parti, nessuna eccezione ad `ADR-74` § 6), coerente
  con `ADR-80` § "Decisione" punto 7.

### 5. Riepilogo minRole/categoria

Tutti i 20 widget: `enabled: true`, categoria palette **"Base"**, `minRole: User` — **eccetto
`html`, `minRole: SuperAdmin`** (§ 4.18). Nessun altro widget di questo registro tocca superfici
regolate da soglie di ruolo diverse da quella ordinaria dell'editor a blocchi.

### 6. Sintesi zero-JS

Nessuno dei 20 widget dichiara `meta.runtime` (`ADR-74` § 1): ogni comportamento dinamico apparente
(hover di `flipBox`/`cta`, collassabilità di `tableOfContents`, filtro `grayscale` di `map`) è
ottenuto con CSS puro (`:hover`, `transition`, `transform`, `filter`) o markup nativo
(`<details>`/`<summary>`), mai con un event listener JavaScript. Questo chiude esplicitamente, per
R4, i due dettagli che `ADR-80` § "Conseguenze" aveva lasciato aperti per `video`/`map`: entrambi
restano fruibili e completi **senza** attendere il bundle `public-runtime.js` di R5, con un percorso
di miglioramento progressivo (non una riscrittura) già tracciato per quando quel bundle esisterà.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `iconList`/`socialIcons`/`pricingTable.features` come prop a valore array di oggetti liberi (nessun child block) | Un solo nodo da salvare, nessuna gerarchia aggiuntiva | Richiederebbe un sotto-editor dedicato per ogni prop ad array (form annidato non standard), incoerente con il pattern già in uso da `accordion`/`carousel`/`tabs`/`nav-menu`/`form`; nessuna voce individualmente selezionabile/stilizzabile nel canvas | Duplica un problema già risolto altrove nel registro con una soluzione diversa e più povera |
| `flipBox.front`/`back` come oggetto prop composito invece che due `children` | Nessun nuovo tipo di blocco (`flipBoxFace`) | Richiederebbe un `kind` di prop bespoke (una forma annidata icon+plainText+richText+link non riconducibile a nessun `kind` già approvato), quindi una nuova firma di `kind` solo per questo widget — mentre il pattern a `children` risolve lo stesso bisogno con zero `kind` nuovi | Introdurrebbe complessità di validazione non necessaria quando un pattern già approvato basta |
| `map`/`video` con iframe/click-to-load JS-driven fin da R4 (anticipando R5) | Parità comportamentale immediata con Elementor Pro | Rompe l'indipendenza dichiarata R4⊥R5 nel grafo delle dipendenze del PLAN; introduce una dipendenza informale su `public-runtime.js` prima che quel bundle esista, contraddicendo `ADR-74`/`ADR-80` che collocano quel meccanismo esplicitamente a partire da R5 | Il PLAN stesso vieta la dipendenza incrociata; il percorso "zero-JS ora, isola JS come miglioramento dopo" copre lo stesso requisito senza romperla |
| `shareButtons`/`hideOn` come `kind` nuovo dedicato a "elenco di token" invece di `EnumPropSpec.multiple` | Un `kind` con nome esplicito, forse più leggibile | `enum` già valida esattamente lo stesso insieme di valori; `multiple` è un modificatore additivo dello stesso tipo di `responsive`/`stateful`, non un concetto diverso — un `kind` nuovo per questo sarebbe una firma aggiuntiva senza necessità reale | Nessun beneficio che giustifichi una nuova voce nell'unione `PropKind` |
| `html` disponibile a Manager+ invece che solo SuperAdmin, coerentemente con la soglia generica degli altri 19 widget | Più autori possono usarlo, coerenza di soglia con il resto del registro | `docs/business-rules.md` § Blocchi regola 7 e `docs/glossary.md` riservano già questo blocco specifico al SuperAdmin — abbassare la soglia sarebbe un allentamento di una regola di dominio già approvata, fuori dallo scopo di questa ADR (stessa conclusione già raggiunta da `ADR-78` § "Alternative valutate" per lo stesso vincolo) | Fuori scopo, richiederebbe una firma propria sulla regola di dominio |
| `progress`/`starRating` animati via CSS (`@keyframes` su `width`/riempimento) invece che statici | Effetto visivo più vicino a Elementor Pro | Un'animazione di riempimento avviata al caricamento pagina (non collegata allo scroll) è comunque possibile in CSS puro, ma un'animazione "quando entra nel viewport" richiederebbe `IntersectionObserver` (isola JS `observer`, R5) — il PLAN colloca esplicitamente `progress` come "statico" in R4 | Il PLAN stesso qualifica questi widget come statici in R4; l'animazione a comparsa è un miglioramento coerente con `animation`/`meta.runtime` di R5, non di questo round |

---

## Conseguenze

- 24 nuovi `BlockDefinition` in `app/backend/src/blocks/types/`: i 20 widget più i 4 tipi di
  composizione (`iconListItem`, `socialIconItem`, `pricingTableFeature`, `flipBoxFace`) — stesso
  ordine di grandezza già introdotto per `accordion`+`accordion-item`/`carousel`+`carousel-slide`.
- `advanced.mixin.ts` nuovo, importato da tutti i 20 `BlockDefinition` di R4 **e**, in un commit
  separato di allineamento non vincolato da questa ADR, disponibile per `container` v2 (`ADR-82`)
  che già dichiarava le stesse 17 chiavi in forma non condivisa — un refactor di riuso, non un
  cambio di comportamento.
- `EnumPropSpec` guadagna `multiple?: boolean` (estensione additiva, `prop-spec.types.ts`): nessuna
  rottura dei descrittori `enum` esistenti che non lo dichiarano.
- Il validatore d'albero guadagna una regola di nesting per-tipo dedicata a `flipBox` (esattamente 2
  figli `flipBoxFace`, uno per `slot`) — un caso puntuale, non un meccanismo generico di "cardinalità
  di children" da riusare altrove senza un requisito concreto.
- Il worker `static-export` guadagna il rendering dei 20 widget: per `breadcrumbs`/
  `tableOfContents`/`shareButtons`/`map`/`video`, la logica descritta § 4.11/4.12/4.16/4.17/4.19/4.20
  produce markup interamente statico — nessuna dipendenza nuova sul worker (nessun Leaflet, nessuna
  chiamata di rete a build-time verso terze parti: le thumbnail YouTube/Vimeo, se non fornite come
  `poster`, richiederebbero una richiesta HTTP a build-time — **fuori scope di questa ADR**: senza
  `poster` esplicito, il renderer usa un poster segnaposto generico del CMS, nessuna chiamata di rete
  aggiunta all'export, coerente con "build deterministica e air-gapped" di `ADR-53`).
- Nessuna modifica allo schema PostgreSQL: tutti i widget vivono nel `jsonb` esistente
  (`draft_content`/`content`/`content_tree`, invariati).
- `npm run openapi:export && npm run openapi:types` non è richiesto da questa ADR: nessun endpoint
  REST nuovo, solo tipi di blocco (registrati lato applicazione, non esposti come schema OpenAPI a
  sé).

## Conformità

- Test unit per ciascuno dei 24 tipi: valore minimo/massimo/malformato per ogni prop, con `reason`
  atteso sul `path` corretto — stesso principio già richiesto da ogni ADR precedente di questo round.
- Test dedicato `flipBox`: un albero con 0, 1 o 3 figli `flipBoxFace`, o con due figli dello stesso
  `slot`, è respinto con `BLOCK_NESTING_NOT_ALLOWED`; un albero con esattamente un `front` e un
  `back` valida.
- Test dedicato `video`: `autoplay: true` con `mute` assente/`false` è rifiutato con `reason:
  'format'` sul path di `autoplay`, solo per `source: 'hosted'` (per `youtube`/`vimeo` la coppia
  `autoplay`/`mute` non ha effetto sul renderer R4, ma resta comunque validata identicamente per
  coerenza dello schema).
- Test di rendering `map`/`video`: nessun tag `<script>` e nessun modulo `data-runtime-modules`
  nell'HTML esportato per una pagina che contiene solo widget di questo registro — verificato come
  estensione della stessa suite `check-air-gap.js` già in uso per ADR-53/ADR-74.
- Test RBAC: un `Manager` (ruolo 20) riceve un rifiuto nell'inserire un blocco `html` — stesso
  meccanismo di soglia già verificato per il blocco HTML esistente prima di questa ADR.
- Test e2e per ciascuno dei 20 widget: inserimento dalla palette (categoria "Base"), compilazione
  dei campi Contenuto, verifica delle prop Stile applicate nel canvas, salvataggio e ri-lettura
  senza perdita di valore — stesso schema di test già richiesto per i widget esistenti
  (`accordion`/`carousel`/`tabs`).
- Test di escaping: `plainText`/`richText` di ogni widget (in particolare `alert.description`,
  `testimonial.content`, `pricingTableFeature.text`) seguono lo stesso trattamento di sanitizzazione
  server-side già in vigore (`ADR-20`/`ADR-21` § 3.7), nessuna eccezione per questi 20 tipi.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:

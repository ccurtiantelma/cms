# ADR-87 — Dynamic Tags (popover UI, modificatore `dynamic`, `pages.customFields`, `site_identity`) e Query Loop Builder (`kind: 'query'`, blocco `loop`)

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R7 — Collezioni, Dynamic Tags, Loop, Theme Builder** di
`docs/PLAN-parita-elementor-pro.md` § T2/T3. Riferimenti sostanziali:
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3, `docs/SPEC-propkind-v2.md` § 3.17/§ 3.18/§ 4.3 (riga
`loop`), `docs/ai/specs/SPEC-DYNAMIC.md`.

## Numerazione
Vedi `ADR-86-registro-widget-pro-interattivi.md` § "Numerazione": quella ADR occupa **86**, la prima
decisione di R6 che introduce un principio nuovo (il Popup Builder di quel round non ne ha
richiesta una propria, `docs/ai/specs/SPEC-POPUP.md` § "Perché una SPEC e non una nuova ADR"). Questa
ADR è la prima decisione del round successivo che introduce un principio nuovo — occupa quindi il
primo numero libero dopo R6: **87**.

## ADR di riferimento (non superate, non modificate)
- `ADR-79-modello-collezioni-content-types.md` — fondamento di questo round: `collections`/
  `collection_items` (§ "Decisione" punto 1), risoluzione a export-time (punto 3), scoping di
  `loop.item.<key>` (punto 4). Questa ADR **è** in parte la decisione che ADR-79 § "Decisione" punto 5
  aveva dichiarato "fuori scopo... se un round futuro estende `pageEntity` con un campo
  `customFields: jsonb`, sarà una ADR a sé stante" — questa **è** quella ADR (§ 5 sotto).
- `ADR-83-tabella-templates-e-api-libreria.md` § "Decisione" punto 1 — aveva già ammesso `kind:
  'loop-item'` nell'enum di `templates.kind` "da subito ma senza alcun consumer... il Loop Builder è
  R7". Questa ADR **è** quel consumer (§ 8).
- `ADR-85-registro-widget-base-css-only.md` § "Decisione" punto 3 — pattern "cardinalità di
  `children` vincolata dal validatore" già usato per `flipBox` (esattamente 2 figli); questa ADR
  applica lo stesso meccanismo al blocco `loop` (esattamente 1 figlio, § 7).
- `ADR-75-involucro-stateful-e-stati-hover.md` / `ADR-85-registro-widget-base-css-only.md` § "Decisione"
  punto 2 — precedenti diretti per il pattern "nuovo modificatore booleano additivo su
  `BasePropSpec`/`EnumPropSpec`", applicato qui a `dynamic` (§ 3).
- `ADR-48-seo-graph-generation.md` — aveva lasciato esplicitamente aperto il campo "identità del
  sito" (`publisher`/`og:site_name`) e "immagine di copertina della Pagina": questa ADR chiude
  entrambi i debiti (§ 5, § 6).
- `docs/ai/specs/SPEC-RUNTIME.md` § 4.10 (`loopPagination`) e § 4.9 (`search`) — moduli runtime già
  scaffolded e "inerti fino a R7"; questa ADR ne diventa il primo vero consumer per `pagination:
  'loadMore'|'infinite'` (§ 7).

---

## Contesto

`ADR-79` ha introdotto le Collezioni come fondamento di dominio ma ha esplicitamente rinviato a un
round successivo tre pezzi che restano necessari perché Dynamic Tags e Loop Builder siano
utilizzabili: (1) l'interfaccia di autoring dei Dynamic Tags (l'icona ⚡ e il popover menzionati da
`docs/PLAN-parita-elementor-pro.md` § R7 T2, mai definiti a livello di schema), (2) i campi custom per
Pagina (`page.field.<key>`, esplicitamente fuori scopo di ADR-79 § "Decisione" punto 5), (3)
l'"identità del sito" per i tag `site.*`, un gap che `ADR-48` aveva già segnalato e rinviato senza
chiuderlo. Senza questi tre pezzi, l'elenco di tag già chiuso da `docs/SPEC-propkind-v2.md` § 3.17
resta in parte irrisolvibile per costruzione — non un problema di implementazione, un problema di
schema mancante.

Analogamente, `docs/SPEC-propkind-v2.md` § 3.18 ha già dichiarato la *forma* di `kind: 'query'` ma,
come per `conditions`/`trigger` (`SPEC-PROPKIND-V2-DETAILS.md` § "Relazione con gli altri documenti"),
ne ha rinviato lo schema di validazione dettagliato "al round che li consuma": questa ADR è quel
round per `query`. Manca inoltre una decisione su **come** il "template dell'item" del Loop Builder
si rappresenta nell'albero blocchi — `docs/SPEC-propkind-v2.md` § 4.3 lo cita come `itemTemplate
(template ref)` in notazione compatta, senza dire se è un riferimento vivo, una copia, o un figlio
diretto.

---

## Decisione

### 1. Popover Dynamic Tags — icona ⚡ e superficie UI

Ogni prop il cui `PropSpec` dichiara `dynamic: true` (§ 3) espone, nell'inspector, un'icona ⚡
accanto al controllo ordinario della prop (stesso punto di innesto già usato per l'icona breakpoint
di `ADR-29` e per lo *state switcher* di `ADR-75`: un controllo aggiuntivo in testa al campo, non un
secondo tab). Il click apre un popover Mantine con:

1. **Selettore di tag**, raggruppato per prefisso (`Pagina`, `Sito`, `Data`, e — **solo** se il nodo
   corrente è discendente del sotto-albero item-template di un blocco `loop`, § 7 — `Elemento del
   loop`): la stessa verifica di ancestor-scoping già usata da `insideGlobalSection`
   (`ADR-55`/`ADR-59`) determina se il gruppo "Elemento del loop" è mostrato, non un flag separato nel
   contesto React dell'editor.
2. **Campi argomento**, resi dinamicamente in base al tag scelto (oggi il solo caso reale è `format`
   per `date.now`/`page.publishedAt`, un `Select` sull'elenco chiuso di `docs/ai/specs/SPEC-DYNAMIC.md`
   § 2.2 — nessun campo testo libero per un argomento).
3. **Campo Fallback**, che monta lo **stesso** `PropField` già usato per il valore letterale della
   prop ospite (nessun controllo duplicato: un `link` dinamico mostra lo stesso editor di link per il
   proprio fallback) — reso **obbligatorio** nell'UI (bordo di errore, impossibile salvare la sezione
   Stile/Contenuto senza compilarlo) quando la prop ospite è `required: true`, coerente con la
   validazione server-side di `docs/ai/specs/SPEC-DYNAMIC.md` § 4 punto 2.
4. **Campi Prima/Dopo** (`before`/`after`), mostrati solo per prop di `kind` testuale (stesso
   sottoinsieme del § 5 punto 7 di `SPEC-DYNAMIC.md`).
5. Un **badge "dinamico"** compare permanentemente nel campo dopo la chiusura del popover (icona ⚡
   piena invece che vuota), coerente con l'indicatore "hover impostato" già esistente per `ADR-75`.

Nessun nuovo componente di layout (niente terzo tab oltre Contenuto/Stile/Avanzato): il popover è un
overlay dello stesso campo, stesso principio già scelto per `TypographyPopover`
(`docs/PLAN-parita-elementor-pro.md` § R1 T5) e per il pannello "Trigger e Regole" del Popup Builder
(`docs/ai/specs/SPEC-POPUP.md` § 5) — un controllo composito quando la combinazione di sotto-campi lo
giustifica, mai un pannello dedicato per un singolo modificatore.

### 2. Quali prop dichiarano `dynamic: true`

Coerente con `docs/SPEC-propkind-v2.md` § 3.17 ("Qualunque prop `plainText|richText|url|mediaRef|
number|colorRef|link` può dichiarare `dynamic: true`"), questo round attiva il modificatore sulle
prop dove un requisito concreto lo richiede, non su ogni prop di quei `kind` nel registro:
`heading.text`, `richText.content`, `image.image` (`mediaRef`), `button.text`/`button.link`,
`iconBox.title`/`iconBox.description`, `imageBox.image`/`title`/`description`, `testimonial.content`/
`name`/`image`, e ogni prop di `kind` compatibile dei widget che compongono un item-template di Loop
(§ 7) — l'elenco esatto è un dettaglio di implementazione per widget, non vincolato oltre al principio
"il `kind` deve appartenere al sottoinsieme dichiarato da `SPEC-propkind-v2.md` § 3.17", stesso
principio di puntualità già applicato da `ADR-81` § "Decisione" punto 5 per `stateful`.

### 3. Modificatore `dynamic?: boolean` su `BasePropSpec`

Stesso pattern additivo già usato da `ADR-75` (`stateful`) e da `ADR-85` § "Decisione" punto 2
(`EnumPropSpec.multiple`): un booleano opzionale che cambia la **forma** del valore atteso (dal
`kind` nudo a `T | DynamicValue<T>`, `docs/ai/specs/SPEC-DYNAMIC.md` § 1), mai il `kind`. **Non
combinabile con `stateful`/`responsive` sulla stessa prop** (`SPEC-DYNAMIC.md` § 1.1): un tag
dinamico produce un valore unico per l'intera vita della pagina esportata, lo stesso per ogni
stato/breakpoint — nessun caso d'uso del gap analysis chiede un tag diverso per Hover o per Mobile, e
ammetterlo triplicherebbe la combinatoria (stato × breakpoint × dynamic) del validatore e di
`toCss()` senza un beneficio reale, stesso ragionamento già usato per escludere `stateful` da
`spacing`/`radius`/`gradient` (`SPEC-PROPKIND-V2-DETAILS.md` §§ 4-6). Il validatore rifiuta a livello
di registro (verificato da un test che itera l'intero registro dei tipi di blocco, non da un
controllo runtime su un contenuto specifico) qualunque `PropSpec` che dichiari `dynamic: true` insieme
a uno degli altri due modificatori.

Lo schema di validazione completo di `DynamicValue` (forma, obbligatorietà di `fallback`, `args` per
tag, `before`/`after`) è fissato da `docs/ai/specs/SPEC-DYNAMIC.md` § 4 — questa ADR non lo ripete,
decide solo che il modificatore esiste e le sue regole di combinazione con gli altri due.

### 4. Elenco chiuso dei tag: nessuna estensione, due fonti dati nuove

L'elenco di tredici `DynamicTagId` è quello già chiuso da `docs/SPEC-propkind-v2.md` § 3.17 — questa
ADR non ne aggiunge né ne rimuove. Introduce però le due fonti dati che quell'elenco presuppone senza
fornire (§ 5, § 6), risolvendo così i debiti espliciti di `ADR-79`/`ADR-48`.

### 5. `pages.customFields` — colonna nuova, campi liberi per Pagina

`page.field.<key>` richiede un contenitore di campi arbitrari **per singola Pagina**, un concetto
distinto dalle Collezioni (`ADR-79` § "Decisione" punto 5: "Le Collezioni risolvono il caso 'N
elementi con lo stesso schema', non 'campi extra su una singola Pagina'"). A differenza di una
Collezione (che ha uno `schema` dichiarato una volta e applicato a molte righe), una Pagina è
singolare per costruzione (`docs/constitution.md` § "Il modello di contenuto" regola 1): non serve
un secondo motore di schema, basta un elenco di coppie chiave/valore libere, editate direttamente
nel pannello Impostazioni Pagina.

```typescript
// schema.ts — colonna aggiunta a pageEntity, additiva
customFields: jsonb('custom_fields').notNull().default('[]'),
```

```ts
interface PageCustomFieldEntry {
  key: string;   // ^[a-z][a-z0-9_]{0,39}$ — stesso principio "elenco di forma, non di valore" già
                 // usato per `attributes` (SPEC-propkind-v2.md § 3.14), qui applicato alla chiave
  value: string; // plainText, ≤ 500 char, sanitizzato server-side come ogni plainText (ADR-20)
}
// array, ≤ 20 entry, `key` univoca all'interno dell'array (una seconda entry con la stessa `key`
// è respinta 400 — l'unicità qui è locale alla riga, non un vincolo di indice DB: nessuna colonna
// generata, la stessa filosofia "presentazione/validazione applicativa, non un secondo indice" già
// usata per `linked` in `spacing` — SPEC-PROPKIND-V2-DETAILS.md § 4 punto 2)
```

Validato dallo stesso `PagesService`/DTO applicativo che già valida `draftSeo` — **non** un `kind` di
prop del registro blocchi (`customFields` non vive dentro l'albero `jsonb` dei blocchi, vive su
`pages` come `draftSeo`): nessuna estensione di `PropKind`, nessuna modifica a
`BlockTreeValidatorService`. UI: una sezione "Campi personalizzati" nel pannello Impostazioni Pagina
esistente (stesso pannello che ospita SEO/GEO), lista chiave/valore con aggiungi/rimuovi — nessun
nuovo pannello, nessuna nuova rotta.

`page.featuredImage` (§ tabella di `SPEC-DYNAMIC.md` § 2) richiede una colonna aggiuntiva, chiusura
diretta del gap segnalato da `ADR-48` ("nessun campo 'immagine di copertina'"):

```typescript
coverImageMediaId: integer('cover_image_media_id').references(() => fileEntity.id, {
  onDelete: 'restrict',
  onUpdate: 'restrict',
}),
```

Nullable, stesso trattamento di `thumbnailMediaId` su `templates` (`ADR-83`): un upload manuale
opzionale nel pannello Impostazioni Pagina, riuso di `FilesModule`/`mediaRef` esistente, nessuna
pipeline nuova. Questa colonna chiude **anche** retroattivamente il fallback `ogImage` che
`ADR-48` § "Decisione" aveva lasciato esplicitamente senza sorgente ("`ogImage` non ha fallback in
questo taglio: non esiste oggi alcun campo... a cui attingere") — `SeoGraphService` guadagna, in un
commit di allineamento non vincolato in dettaglio da questa ADR, `ogImage ← coverImageMediaId` come
terzo fallback, stesso principio "merge non distruttivo" già stabilito da `ADR-48`.

### 6. `app_settings.site_identity` — identità di sito per i tag `site.*`

Chiude il debito esplicito di `ADR-48` ("nessuna impostazione 'identità del sito' esiste in
`app_settings`... richiede una propria decisione"). Stesso pattern singleton già in uso per
`app_settings.breakpoints`/`global_kit` (`ADR-76`/`ADR-77`):

```ts
interface SiteIdentityValue {
  name: string;              // ≤ 120 char
  tagline: string;           // ≤ 200 char
  logoMediaId: number | null; // FK opzionale verso `files`, stesso principio di `coverImageMediaId`
  url: string;                // URL assoluto https, canonico per page.url/site.url (SPEC-DYNAMIC.md § 2.1)
                               //  e, in un allineamento futuro non vincolato da questa ADR, per
                               //  og:url/canonical di SeoGraphService (stesso gap "og:site_name" di ADR-48)
}
```

Endpoint `GET/PUT app/settings/site-identity`, soglia **Admin+** (coerente con "Gestire tema e
risorse globali", `business-rules.md` riga 131, la riga di permessi già usata per superfici di
configurazione equivalenti come `themeStyle`/`layout` del Global Kit, `SPEC-GLOBAL-KIT.md` § 2).
**Nessun endpoint pubblico**: a differenza di `global-kit.css` (che deve essere raggiungibile dal
browser del visitatore per risolvere le custom property CSS a runtime del rendering), `site_identity`
è consumato **solo** dal worker `static-export` per emettere valori letterali nell'HTML — nessun
riferimento simbolico sopravvive nel markup pubblicato (a differenza di `colorRef`/`fontRef`, che
restano `var(--gk-...)`), quindi non serve una seconda fonte a runtime pubblico. Un cambio di
`site_identity` accoda `enqueueFullSiteExport` (non la rigenerazione mirata di un solo file come per
`global_kit`, `ADR-77` § "Decisione" punto 4): il nome del sito può comparire in decine di pagine
come testo letterale già cotto nell'HTML, non come variabile risolta a runtime — propagarlo richiede
ricompilare ogni pagina che lo referenzia, e questa ADR non introduce un meccanismo di tracciamento
selettivo "quali pagine usano `site.name`" per un round che non lo richiede esplicitamente (stesso
principio "niente scaffolding anticipato" di `ADR-79` § "Decisione" punto 2).

### 7. `kind: 'query'` — schema di validazione

```ts
export interface QueryPropSpec extends BasePropSpec {
  kind: 'query';
}

interface QueryValue {
  source: 'pages' | 'manual' | `collection:${string}`; // slug della Collezione per il terzo caso
  filters: QueryFilter[];       // ≤ 8
  orderBy: string;              // 'title'|'publishedAt'|'createdAt' per 'pages'; una chiave dello
                                 // schema della Collezione per 'collection:<slug>'; ignorato per 'manual'
  order: 'asc' | 'desc';
  limit: number;                // 1–48
  offset: number;                // 0–1000
  excludeCurrent: boolean;
  pagination: 'none' | 'numbers' | 'loadMore' | 'infinite';
  manualRefs?: string[];        // guid, ≤ 48 — rilevante solo con source:'manual' (presentazione, non
                                 // validazione cross-campo, stesso principio di `gradient.position`)
}
interface QueryFilter { field: string; op: 'eq'|'neq'|'gt'|'lt'|'contains'|'in'; value: string; }
```

#### Regole di validazione

1. `source: 'pages'`: `filters[].field`/`orderBy` verificati in **forma** (stringa ≤ 60 char) non in
   esistenza contro le colonne reali di `pages` — stesso principio "nessuna verifica di esistenza a
   scrittura" già stabilito per `mediaRef`/`colorRef`; un `field` che non corrisponde a nessuna
   colonna nota produce, a export-time, zero risultati per quel filtro con un warning di build (mai
   un errore che blocca l'intera pagina), stesso trattamento di `loop.item.<key>` fuori scope
   (`SPEC-DYNAMIC.md` § 3 punto 3).
2. `source: \`collection:${slug}\``: stessa non-verifica di esistenza a scrittura del punto 1,
   applicata allo `slug` della Collezione (`ADR-79` § "Decisione" punto 1: nessuna verifica di
   esistenza per un riferimento di questo tipo) — una Collezione cancellata dopo che un Loop la
   referenzia produce, a export-time, un Loop vuoto con `emptyText` mostrato e un warning, mai un
   crash dell'export.
3. `source: 'manual'`: `manualRefs` è l'unica fonte di item, `filters`/`orderBy`/`limit`/`offset` sono
   accettati ma ignorati dal renderer (stesso principio "presentazione, non validazione cross-campo"
   di `SPEC-PROPKIND-V2-DETAILS.md` § 6 punto 3) — l'ordine di rendering è l'ordine dell'array
   `manualRefs`, non un `orderBy`.
4. `filters`: array ≤ 8, ogni `value` ≤ 200 char; per `op: 'in'`, `value` è una stringa con valori
   separati da virgola (nessun secondo `kind` per un array di valori — un solo campo testo, stesso
   principio di economia già scelto per `shareButtons.networks` con `EnumPropSpec.multiple`, qui non
   applicabile perché i valori non sono un enum chiuso).
5. `pagination: 'loadMore'|'infinite'` dichiara `meta.runtime: ['loopPagination']` sul nodo `loop`
   ospite (per istanza, stesso principio già usato per `animation`/`motion` sul mixin Avanzato,
   `SPEC-RUNTIME.md` § 5.1 punto 2) — `'numbers'`/`'none'` non richiedono alcun modulo runtime (le
   pagine `?page=N` sono pre-generate a export, zero JS, § 7 sotto).
6. `excludeCurrent`: rilevante solo quando la pagina che ospita il Loop è essa stessa un item del
   `source` interrogato (es. un blocco "articoli correlati" dentro la pagina di un articolo che lista
   la stessa collezione) — il worker esclude, dopo aver eseguito la query, l'item il cui guid coincide
   con la pagina/item corrente, **prima** di applicare `limit`/`offset` (altrimenti un `limit: 4` con
   l'item corrente incluso e poi rimosso produrrebbe 3 risultati invece di 4, comportamento
   sorprendente).

### 8. Blocco `loop` — un solo figlio, item-template come sotto-albero

`loop` (`docs/SPEC-propkind-v2.md` § 4.3) è un nuovo `BlockDefinition`: contenitore analogo a
`container` v2 per il proprio layout esterno (`columns`, `gap` — dichiarati come `layout` ridotto,
riuso dello stesso vocabolario di `ADR-82` § "Decisione" punto 1 limitato a `display: 'grid'`,
`gridTemplateColumns`, `gap`), ma con una regola di nesting dedicata: **esattamente un figlio**, la
radice del proprio item-template, verificata dal validatore d'albero con lo stesso meccanismo già
usato da `ADR-85` § "Decisione" punto 3 per `flipBox` ("`flipBox` accetta `children.allow:
['flipBoxFace']`, esattamente 2 figli... un tentativo... è respinto con `BLOCK_NESTING_NOT_ALLOWED`").
Qui `children.allow: '*'` (qualunque tipo di blocco può essere la radice dell'item-template, coerente
con la libertà di composizione di `container`), ma la **cardinalità** è vincolata a 1, non a 2: un
`loop` con 0 o con più di 1 figlio diretto è respinto con lo stesso codice, `path` sul nodo `loop`
colpevole.

**Contenuto**: `query: query` (§ 7), `emptyText: plainText` (mostrato al posto della griglia quando la
query risolve a zero item — mai una griglia vuota silenziosa). **Stile**: `columns: number (1–6,
responsive)`, `gap: unitValue`. **Avanzato**: stesso mixin comune di `ADR-85` § "Decisione" punto 1.

Perché un figlio unico e non un riferimento vivo a un Template (`templates.kind: 'loop-item'`,
`ADR-83`): un Template è sempre **copiato**, mai referenziato (`ADR-83` § "Decisione" punto 2) —
tenere l'item-template come figlio diretto dell'albero del `loop` è la stessa scelta già fatta per
ogni altro contenuto di Pagina, e **non contraddice** l'esistenza di `templates.kind: 'loop-item'`:
quel valore d'enum resta il meccanismo con cui un autore **inserisce** un design pronto come
item-template (tramite `TemplateLibraryModal`, § 9 sotto), esattamente come inserirebbe qualunque
altro sotto-albero da un Template — dopo l'inserimento, quel sotto-albero è indipendente e vive come
il figlio unico del `loop`, non come un riferimento persistente al Template di origine. Questo chiude
per intero il debito lasciato aperto da `ADR-83`: *"`popup`/`loop-item` sono valori ammessi
nell'enum... senza alcun consumer... il Loop Builder è R7"*.

Un `loop` non annidabile dentro sé stesso al di sopra di `MAX_DEPTH` (`ADR-82`, 8) segue lo stesso
limite generale dell'albero — nessun limite di annidamento specifico per `loop`.

### 9. Editor "Loop item template" — contesto fittizio, riuso della libreria Template

Coerente con `docs/PLAN-parita-elementor-pro.md` § R7 T3 ("editor 'Loop item template' con canvas con
item fittizio dalla collezione, contesto `loop.item`"): quando l'autore seleziona il figlio unico di
un nodo `loop` nel canvas, l'editor imposta un contesto locale `loop.item` con i dati del **primo**
item risolto dalla `query` corrente (o un item sintetico coi soli nomi di campo se la query non
risolve ancora nulla, es. Collezione vuota) — usato **esclusivamente** per l'anteprima nel canvas
(popover Dynamic Tags del § 1 che mostra il gruppo "Elemento del loop" con valori di esempio accanto
al nome del tag), mai persistito, mai inviato al backend: un meccanismo puramente editoriale, stesso
principio già scelto per l'anteprima trigger del Popup Builder ("un meccanismo puramente editoriale,
non un'API del runtime pubblico", `SPEC-POPUP.md` § 5).

`TemplateLibraryModal.tsx`, quando aperta dal contesto di editing del figlio di un `loop`, guadagna il
filtro implicito `kind: 'loop-item'` sulla tab "Blocchi" — stessa estensione già introdotta da
`SPEC-POPUP.md` § 5 per il contesto Popup Builder con `kind: 'popup'`, nessuna quinta tab.

### 10. Paginazione statica a export-time

`pagination: 'numbers'`: il worker `static-export`, per ogni pagina che contiene un `loop` con questa
modalità, genera N file `<slug>/page/2/`, `<slug>/page/3/`… (stesso schema di URL già anticipato da
`docs/SPEC-propkind-v2.md` § 3.18 e da `SPEC-RUNTIME.md` § 4.10), ciascuno con lo stesso layout di
pagina ma con l'item-template ripetuto sul sottoinsieme di risultati di quella pagina — nessuna
differenza di markup salvo il contenuto del `loop` stesso e i link di paginazione (Precedente/
Successivo/numeri), generati staticamente, zero JS. `pagination: 'loadMore'|'infinite'`: stessa
generazione di file `?page=N` sottostante, consumata a runtime dal modulo `loopPagination`
(`SPEC-RUNTIME.md` § 4.10, già scaffolded e "inerte fino a R7" — questa ADR è il primo `meta.runtime`
reale che lo attiva). `pagination: 'none'`: **solo** la prima pagina di risultati (`limit`), nessun
file aggiuntivo.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `loop.item` come riferimento vivo a un Template (`itemTemplateGuid` invece di un figlio) | Un solo posto da aggiornare per cambiare il design di tutti i Loop che lo usano | Contraddice direttamente `ADR-83` § "Decisione" punto 2 ("il Template è sempre una copia, mai un riferimento") — introdurrebbe un secondo meccanismo di riferimento vivo nel progetto, diverso da Sezioni globali (che già coprono quel caso d'uso) | Duplicazione di un concetto già esistente (Sezione globale) con semantica diversa e incoerente |
| `page.field`/`site.name` risolti senza nuove colonne, riusando `draftSeo`/una chiave `app_settings` generica esistente | Nessuna migrazione | `draftSeo` ha un contratto già chiuso (`PageSeoDto`) che non prevede campi arbitrari; nessuna chiave `app_settings` esistente rappresenta "identità di sito" senza sovraccaricarne il significato | Violerebbe Single Source of Truth, introdurrebbe un contratto implicito non dichiarato |
| Un `kind` di prop nuovo (`dynamicTag`) invece del modificatore `dynamic` su `BasePropSpec` | Un solo campo `kind` da leggere | Moltiplicherebbe i `kind` per ogni combinazione compatibile (`plainText` dinamico, `mediaRef` dinamico, …), esattamente l'errore già corretto da `ADR-29`/`ADR-75` per `responsive`/`stateful` | Ripete un errore già risolto due volte in questo stesso registro |
| `dynamic` combinabile con `stateful`/`responsive` | Massima flessibilità teorica | Nessun requisito del gap analysis lo chiede; moltiplica la combinatoria di validatore/`toCss()`/UI per un caso mai richiesto da Elementor stesso in questa forma | Over-engineering rispetto alla parità richiesta |
| Paginazione Loop sempre e solo `loadMore`/`infinite` (mai pagine statiche `numbers`) | Un solo meccanismo da implementare | Una paginazione a numeri di pagina è un requisito esplicito del gap analysis (§ 3, "paginazione statica pre-renderizzata") e non richiede JS: scartarla peggiorerebbe l'accessibilità/SEO rispetto a Elementor Pro stesso | Non raggiunge la parità dichiarata |

---

## Conseguenze

- `BasePropSpec` guadagna `dynamic?: boolean` (estensione additiva, `prop-spec.types.ts`); un test di
  registro verifica l'incompatibilità con `stateful`/`responsive`.
- `pages` guadagna due colonne: `customFields: jsonb` (default `'[]'`), `coverImageMediaId: integer`
  (FK nullable verso `files`) — entrambe additive, nessuna migrazione di dati esistenti oltre al
  default.
- `app_settings.site_identity` nuova riga singleton, endpoint `GET/PUT app/settings/site-identity`
  (Admin+), consumata **solo** dal worker di export (nessun endpoint pubblico).
- `SeoGraphService` (`ADR-48`) guadagna, in un commit di allineamento separato, `ogImage ←
  coverImageMediaId` come fallback aggiuntivo — non vincolato in dettaglio da questa ADR oltre alla
  disponibilità della colonna.
- `PropKind` guadagna `query` (nuovo `kind`, `docs/SPEC-propkind-v2.md` § 3.18 già lo dichiarava, qui
  ne viene fissato lo schema di validazione completo).
- Un nuovo `BlockDefinition`, `loop`, e una nuova regola di nesting nel validatore d'albero
  (cardinalità esattamente 1 figlio).
- `TemplateLibraryModal.tsx` guadagna il filtro implicito `kind: 'loop-item'` per il contesto Loop
  Builder (stessa estensione già fatta per `kind: 'popup'`).
- Il worker `static-export` guadagna: risoluzione del contesto `loop.item` durante l'iterazione
  (`ADR-79` § "Decisione" punto 4, qui reso concreto), generazione di file `?page=N` per `loop` con
  paginazione statica, attivazione reale del modulo `loopPagination` (`SPEC-RUNTIME.md` § 4.10).
- Il popover Dynamic Tags (§ 1) è un componente frontend condiviso, riusato da ogni prop con
  `dynamic: true` — nessuna duplicazione per widget.
- Nessuna modifica allo schema PostgreSQL oltre alle due colonne di `pages` e alla riga singleton di
  `app_settings`.

## Conformità

- Test di registro: nessuna `PropSpec` dichiara `dynamic: true` insieme a `stateful`/`responsive`.
- Test `customFields`: un array con più di 20 entry o con due entry dalla stessa `key` è respinto
  `400`; una `key` fuori pattern è respinta `400` sul path corretto.
- Test `site_identity`: `GET` su un'istanza senza riga restituisce il seed di default (stringhe
  vuote, `logoMediaId: null`) senza scrivere nulla; un `PUT` da un `Manager` è respinto `403`.
- Test `query`: `source: 'collection:<slug-inesistente>'` è accettato in scrittura, produce un Loop
  vuoto (con `emptyText`) e un warning nel report a export-time, mai un errore bloccante.
- Test `loop`: un albero con 0 o 2+ figli diretti di un nodo `loop` è respinto con
  `BLOCK_NESTING_NOT_ALLOWED`; un albero con esattamente 1 figlio valida.
- Test `excludeCurrent`: un Loop su `source: 'pages'` con `excludeCurrent: true`, eseguito nella
  compilazione della pagina che è essa stessa uno dei risultati, esclude quella pagina **prima**
  dell'applicazione di `limit` — verificato con un test che conta esattamente `limit` risultati
  distinti dalla pagina ospite.
- Test paginazione statica: un Loop con `pagination: 'numbers'` e più item di quanti ne stiano in
  `limit` produce i file `page/2/`, `page/3/`… attesi, ciascuno con lo stesso layout e un sottoinsieme
  disgiunto di risultati; `pagination: 'loadMore'` produce `meta.runtime: ['loopPagination']` unito
  al `data-runtime-modules` della pagina (estensione del test snapshot di `SPEC-RUNTIME.md` § 5.3).
- Test `page.field`/`page.featuredImage`: coperti da `docs/ai/specs/SPEC-DYNAMIC.md` § "Criteri di
  verifica", non ripetuti qui.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:

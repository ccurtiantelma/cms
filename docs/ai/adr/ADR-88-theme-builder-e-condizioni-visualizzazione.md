# ADR-88 — Theme Builder: tabella `theme_templates` (header/footer/single/archive/404/search) e algoritmo di valutazione delle `conditions`

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R7 — Collezioni, Dynamic Tags, Loop, Theme Builder** di
`docs/PLAN-parita-elementor-pro.md` § T4/T5. Riferimenti sostanziali:
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3 (riga "Theme Builder"), `docs/SPEC-propkind-v2.md`
§ 3.19 (`conditions`).

## Numerazione
Vedi `ADR-87-dynamic-tags-e-query-loop-builder.md` § "Numerazione": round R7, primo numero libero
dopo ADR-87.

## ADR superate da questa decisione
**`ADR-64-template-di-tema-site-templates.md` è superata per intero da questa ADR**, con l'eccezione
esplicita del punto 5 (§ "Continuità" sotto). Motivo: ADR-64 aveva già introdotto lo stesso concetto
di dominio (un template risolto automaticamente per rotta, con condizioni di visualizzazione) sotto
il nome `site_templates`, ma con tre limiti che questa ADR chiude — gli stessi tre che ADR-64 §
"Conseguenze" aveva **essa stessa segnalato come debito esplicito**:

1. *"Il resolver non ha consumer: né `app/public-site` né `ExportProcessor` lo chiamano, quindi oggi
   un Template di tema non cambia il sito pubblicato. Collegarlo all'export statico (ADR-53) richiede
   una decisione propria..."* — questa ADR è quella decisione (§ "Decisione" punto 5).
2. *"`language` non è validato contro le lingue del sito... Va vincolato prima di collegare il
   resolver, altrimenti un Template può non verificare mai una Pagina reale"* — questa ADR vincola
   `locale` (§ "Decisione" punto 2).
3. *"`single_post`/`archive` sono ammessi in scrittura ma senza semantica: il resolver restituisce
   `null`... finché non esiste una decisione sui tipi di contenuto"* — `ADR-79` è quella decisione
   (Collezioni); questa ADR dà a `single`/`archive` la semantica che ADR-64 aveva riservato per quando
   sarebbe arrivata (§ "Decisione" punto 3).

Poiché nessuno dei tre debiti aveva un consumer in produzione (punto 1 lo dichiara esplicitamente:
"un Template di tema non cambia il sito pubblicato"), questa ADR può ridisegnare `type`/`displayConditions`
senza alcun rischio di regressione osservabile sul pubblico — non è il caso di `ADR-72` che ha dovuto
preservare un comportamento già attivo, è più vicino al caso di `ADR-82` che ha potuto ridisegnare
`section`/`container` avendo cura solo della compatibilità di lettura (`ADR-21` § 3), non del
comportamento pubblico già in produzione.

## ADR di riferimento superate solo in parte (invariate per il resto)
- `ADR-40-sezioni-globali-e-layout.md` — **superata limitatamente al meccanismo di risoluzione
  header/footer per `layoutSlot`** (§ "Decisione" punto 4: le due Sezioni Globali assegnate a
  `header`/`footer` diventano righe `theme_templates`). La tabella `global_sections` **resta invariata
  come entità** per il proprio ruolo residuo (§ "Continuità" sotto): Sezioni riferite altrove
  nell'albero via `globalRef` (`ADR-55`/`ADR-59`), non toccate da questa ADR.

## ADR di riferimento (non superate, non modificate)
- `ADR-79-modello-collezioni-content-types.md` § "Decisione" punto 6 — aveva anticipato esattamente
  questa ADR: *"un `collection_item` published è visibile solo attraverso un Loop... o, se un round
  futuro lo richiede, tramite un Theme Template `archive`/`single` (ADR di R7 non ancora scritta,
  dipendente da questa)"*. Questa ADR **è** quella ADR (§ "Decisione" punto 3).
- `docs/SPEC-propkind-v2.md` § 3.19 — forma di `kind: 'conditions'`, già dichiarata come consumata da
  "Theme/Popup" fin dal titolo della sezione; `docs/ai/specs/SPEC-POPUP.md` § 2.2 ne è già il primo
  consumer concreto ("nessuna variante per Popup rispetto a Theme"). Questa ADR **è** il secondo
  consumer, identico, promesso da quel documento.
- `ADR-83-tabella-templates-e-api-libreria.md` — `templates` (design riusabile, copiato all'inserimento)
  resta un'entità del tutto distinta da `theme_templates` (risolto automaticamente per rotta, mai
  scelto e inserito a mano) — stessa distinzione di meccanismo di consumo già tracciata da ADR-64
  § "Alternative scartate" fra `site_templates` e la libreria Template, qui ereditata identica.
- `ADR-53-air-gapped-ssg-zero-db.md` — build-on-publish, zero database sul pubblico: la risoluzione
  di `theme_templates` avviene **sempre e solo** nel worker `static-export`, mai a runtime pubblico
  (§ "Decisione" punto 5).
- `ADR-21-schema-blocchi-versionamento.md` § 3 — `contentTree` di ogni riga `theme_templates` passa
  per la stessa `BlockTreeValidatorService` di ogni altra tabella che persiste un albero, invariato.

## Assunzione di dominio coinvolta
Nessuna modifica a `docs/business-rules.md`. La riga di permessi editoriali "Gestire Menu, Template,
Sezioni globali" (✅ SuperAdmin/Admin/Manager, ❌ User, `business-rules.md` riga 125) si applica
identica a `theme_templates`, come già si applicava a `site_templates` (ADR-64 § "Alternative
scartate": "la soglia Admin sarebbe... la riga... è Manager+, e il codice la applica già") — nessuna
nuova riga RBAC.

---

## Contesto

`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3 chiude la voce Theme Builder con il gap architetturale
già individuato: *"tabella `theme_templates` + `display_conditions` valutate a export"*. Il progetto
ha già costruito, nell'ambito di una RFC precedente (`RFC-40-theme-builder-template-registry.md`),
esattamente questo concetto — `site_templates`, con un `TemplateResolverService` e uno schema di
condizioni funzionante — ma **senza mai collegarlo all'unica pipeline che conta**, il worker
`static-export`. Il risultato è un'entità completa, testata, con RBAC e superficie pubblica di
risoluzione, che **non ha mai cambiato una sola pagina pubblicata** (ADR-64 § "Conseguenze", citato
sopra). Ricostruire lo stesso concetto da zero sotto un nome diverso (`theme_templates`) sarebbe
ingiustificabile se non fosse che tre cambiamenti sostanziali — richiesti dal gap analysis e da
`ADR-79`, entrambi successivi ad ADR-64 — rendono la forma esistente insufficiente: (1) header/footer
devono entrare nello stesso meccanismo (oggi vivono altrove, `global_sections`), (2) le condizioni
devono riusare `kind: 'conditions'` invece di una forma bespoke (per essere lo stesso meccanismo già
promesso identico ai Popup), (3) `single`/`archive` devono avere una semantica reale legata alle
Collezioni, non restare "ammessi ma senza consumer".

Il secondo problema tecnico, distinto dal primo, è la migrazione delle righe `global_sections` già
assegnate a `header`/`footer`: quell'assegnazione (`layoutSlot`) è un meccanismo di risoluzione a sé
(un solo header/una sola footer attivi globalmente, `ADR-40` § "Decisione", vincolo di unicità
parziale sulla colonna) — sostituirlo con `theme_templates` (che ammette **più** righe dello stesso
`kind` distinte da `conditions` diverse, § "Decisione" punto 4) è un cambiamento di potenza
espressiva, non solo di nome, e richiede una migrazione dei dati esistenti, non solo dello schema.

---

## Decisione

### 1. Una tabella nuova, `theme_templates`, che sostituisce `site_templates`

Stessa "Struttura obbligatoria ogni tabella" della constitution, stesso pattern strutturale di
`site_templates`/`templates` (entità mutabile con audit completo):

```typescript
// schema.ts
export const themeTemplateEntity = pgTable(
  'theme_templates',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),

    name: varchar('name', { length: 255 }).notNull(),

    /** Elenco chiuso — sostituisce il `type` di site_templates, vedi § "Decisione" punto 3. */
    kind: varchar('kind', { length: 20 }).notNull(),

    /** Ordine di risoluzione quando più righe dello stesso `kind` verificano `conditions` per la
     * stessa pagina/item: vince la `priority` più alta, stesso meccanismo già in uso da ADR-64 § 3
     * ("in ordine di `priority` decrescente"), qui però con un significato più ricco perché più
     * righe attive dello stesso `kind` sono la norma, non l'eccezione (§ "Decisione" punto 4). */
    priority: integer('priority').notNull().default(0),

    /** locale a cui questo Template si applica; NOT NULL, vincolato contro le lingue configurate del
     * sito (§ "Decisione" punto 2) — chiude il debito esplicito di ADR-64 § "Conseguenze". */
    locale: varchar('locale', { length: 10 }).notNull(),

    /** Stesso envelope jsonb `{ version, blocks }` di ADR-21, un solo nodo radice (`header`/`footer`:
     * un `container` v2 con `tag: 'header'|'footer'`; `single`/`archive`/`404`/`search`: un
     * `container` v2 generico che compone liberamente altri blocchi, incluso `loop` per `archive`,
     * ADR-87). Stessa `BlockTreeValidatorService` di ogni altra tabella. */
    contentTree: jsonb('content_tree').notNull(),

    /** kind: 'conditions' (SPEC-propkind-v2.md § 3.19), schema di validazione già fissato da
     * quel documento e riusato identico — nessuna variante, § "Decisione" punto 4. */
    conditions: jsonb('conditions').notNull().default('[]'),

    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft|published
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    updatedBy: integer('updated_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  },
  (t) => [
    uniqueIndex('theme_templates_guid_idx').on(t.guid),
    index('theme_templates_kind_locale_idx').on(t.kind, t.locale, t.status, t.isActive),
  ],
);
```

`status: draft|published` è nuovo rispetto ad ADR-64 (che non lo aveva): stesso vocabolario di
`pages.status` e `site_popups.status` (`SPEC-POPUP.md` § 1.2), per lo stesso motivo — un Theme
Template `draft` non deve mai comparire in un export, indipendentemente da `conditions`, coerente con
il fatto che ora questa tabella **ha** un consumer reale (§ "Decisione" punto 5).

### 2. `locale` — chiude il debito di ADR-64

`locale` è validato a scrittura contro l'elenco delle lingue configurate del sito (stesso meccanismo
già in uso per `pages.locale`, `ADR-36`) — non più una stringa libera con default cablato `IT` come in
`site_templates`. Un `theme_templates` risolve **solo** per pagine/item dello stesso `locale`: nessuna
cascata fra lingue (un header in italiano non "ricade" su una pagina in inglese priva di un proprio
header) — un sito con N lingue attive richiede N righe `header` (una per lingua) se vuole un header in
ogni lingua, comportamento esplicito, mai un fallback silenzioso fra lingue diverse (a differenza della
cascata fra breakpoint di `ADR-76`, che ha senso perché breakpoint sono gradi di un'unica dimensione
mentre le lingue sono contenuti indipendenti per costruzione, `ADR-36`).

### 3. `kind` — elenco chiuso, sostituisce `type` di `site_templates`

```ts
type ThemeTemplateKind = 'header' | 'footer' | 'single' | 'archive' | '404' | 'search';
```

- **`header`/`footer`**: sostituiscono il meccanismo `global_sections.layoutSlot` (§ "Decisione"
  punto 4). Il `contentTree` ha come radice un `container` v2 con `tag: 'header'`/`'footer'`
  rispettivamente (coerente con l'enum `tag` già dichiarato da `ADR-82` § "Decisione" punto 1).
- **`single`**: template per la pagina di dettaglio di **un item di Collezione** — chiude il debito
  esplicito di `ADR-79` § "Decisione" punto 6 ("tramite un Theme Template `archive`/`single`") e di
  `ADR-64` § "Alternative scartate" (il vecchio `single_post`, "ammesso ma senza semantica"). Si
  applica tramite `conditions` con `scope: 'collection'` (ogni item della Collezione referenziata) o
  `scope: 'collectionItem'` (un singolo item, override puntuale) — mai per singole Pagine: una Pagina
  ha sempre il proprio `contentTree` diretto, non un Theme Template risolto (`docs/constitution.md`
  § "Il modello di contenuto" regola 1, invariata). Questo è il motivo per cui il vecchio
  `site_templates.type: 'single_page'` **non ha un successore**: non descriveva un caso reale
  compatibile col modello costituzionale, era un'ambiguità dello schema precedente che questa ADR
  risolve eliminandolo, non migrandolo.
- **`archive`**: template per la pagina di elenco di una Collezione — si applica con `conditions`
  `scope: 'collection'`, tipicamente componendo un blocco `loop` (`ADR-87`) con `query.source:
  \`collection:${slug}\`` e `excludeCurrent: false`. Chiude il vecchio `site_templates.type: 'archive'`
  ("ammesso ma senza semantica") con la semantica reale ora disponibile grazie ad `ADR-79`.
- **`'404'`**: successore diretto di `error_404` (rinominato per coerenza col vocabolario Elementor-
  compatibile del gap analysis) — si applica con `conditions` `scope: 'notFound'`, risolto quando il
  worker compila la pagina di errore del sito.
- **`search`**: successore diretto di `search_results` — `scope: 'search'`.
- Nessun successore per il vecchio `loop_item`: quel valore descriveva un template auto-risolto per
  "l'elemento di un loop", un concetto che `ADR-87` § "Decisione" punto 8 ha già risolto in modo
  diverso e più coerente (l'item-template è il figlio diretto del nodo `loop`, eventualmente copiato
  da un Template di libreria `kind: 'loop-item'`) — un secondo meccanismo di risoluzione automatica
  per lo stesso concetto introdurrebbe un doppio binario, esplicitamente evitato.

### 4. `conditions` — riuso identico di `kind: 'conditions'`, nessuna forma bespoke

```ts
type ConditionsValue = Array<{
  effect: 'include' | 'exclude';
  scope: 'site' | 'pages' | 'page' | 'collection' | 'collectionItem' | 'locale' | 'notFound' | 'search';
  ref?: string;
}>;
```

Stessa forma già fissata da `docs/SPEC-propkind-v2.md` § 3.19 e già resa concreta da
`docs/ai/specs/SPEC-POPUP.md` § 2.2 per i Popup — questa ADR non ne ridichiara lo schema di
validazione, lo riusa **identico**, chiudendo esplicitamente la promessa già scritta in quel documento
("nessuna variante per Popup rispetto a Theme"). Regole di risoluzione, riusate identiche da
`SPEC-POPUP.md` § 3.1 punti 2-3 (che le aveva già enunciate "per la prima volta con un algoritmo
concreto", dichiarandosi esplicitamente riusabile da questa ADR):
- Array vuoto = nessuna pagina/item corrisponde (stato iniziale di un Template appena creato, non un
  errore di validazione).
- Un `exclude` che corrisponde esclude sempre, indipendentemente dall'ordine nell'array; altrimenti un
  `include` che corrisponde include.
- `scope: 'collection'|'collectionItem'` sono pienamente risolvibili in questo round (a differenza di
  quando `SPEC-POPUP.md` li aveva accettati "in forma" senza risoluzione possibile in R6, prima che
  `ADR-79` esistesse per davvero come fondamento): un `theme_templates` con `kind: 'single'|'archive'`
  e `conditions` su questi due scope produce match reali contro `collections`/`collection_items`.

Questa ADR **sostituisce** integralmente la forma `displayConditions` di `site_templates` (`effect ×
entire_site|specific_page|path_pattern`, ADR-64 § "Decisione" punto 4): `path_pattern` (con wildcard
`*`) non ha un successore diretto — `scope: 'pages'` con `ref` verso un guid di Pagina copre il caso
"pagine specifiche" con lo stesso principio "elenco esplicito, non pattern libero" già preferito
altrove nel registro (allowlist invece di pattern-matching, coerente con `ADR-78`/`ADR-80`); un
sotto-albero di Pagine (es. "tutte le pagine sotto `/blog/`") si esprime oggi solo elencando i guid
figli, non con un pattern — limite accettato, un pattern libero riaprirebbe la stessa superficie di
ambiguità che il progetto ha sempre evitato per i campi discriminanti.

### 5. Risoluzione a export-time — chiude il debito "nessun consumer" di ADR-64

Per ogni pagina/item in fase di build, il worker `static-export`:

1. Legge l'insieme dei `theme_templates` con `status: 'published'`, `isActive: true`, `locale`
   corrispondente (una sola lettura per l'intera esecuzione, stesso principio di cache di processo di
   `SPEC-GLOBAL-KIT.md` § 3 e di `SPEC-POPUP.md` § 3.1 punto 1).
2. Per `header`/`footer`: valuta `conditions` di ogni riga di quel `kind` contro l'identità della
   pagina corrente (stesso algoritmo del punto 3 di `SPEC-POPUP.md` § 3.1); fra le righe che
   corrispondono, sceglie quella con `priority` più alta (nuovo rispetto ai Popup, dove più Popup
   possono comparire insieme sulla stessa pagina — qui **una sola** riga vince per slot, un
   `container` non può avere due elementi `<header>` sullo stesso lato del documento). Se nessuna
   riga corrisponde, la pagina è compilata **senza** quello slot (nessun header/footer, non un
   fallback nascosto) — un warning di build segnala il caso, non un errore bloccante.
3. Per `single`/`archive`/`404`/`search`: risolti **al posto** del `contentTree` diretto della
   Pagina, solo quando il worker sta compilando rispettivamente un item di Collezione (`single`), la
   pagina di elenco di una Collezione (`archive`), la pagina 404 del sito, o la pagina risultati di
   ricerca — mai per una Pagina ordinaria con proprio contenuto esplicito (regola 1 della
   constitution, invariata).
4. Il `contentTree` risolto (`header`/`footer`/`single`/`archive`/`404`/`search`) attraversa la stessa
   pipeline di render di ogni altro contenuto (`toCss()`, risoluzione `colorRef`/`fontRef`/`dynamic`,
   `SPEC-DYNAMIC.md`) — un `single` risolto per un item di Collezione riceve il contesto `{item}`
   necessario per i tag `page.field.<key>`-equivalenti sui campi della Collezione (nello stesso spirito
   di `loop.item.<key>`, qui applicato a un item risolto per rotta invece che per iterazione).
5. **Nessuna cache incrementale in questo round**: un cambio a un `theme_templates` (nuove
   `conditions`, nuovo `contentTree`) accoda `enqueueFullSiteExport`, stesso principio già scelto da
   `SPEC-POPUP.md` § 3.1 punto 6 per lo stesso motivo (è markup che cambia la forma del file, non un
   token risolto via CSS custom property come `global_kit`) — un'ottimizzazione "solo le pagine
   impattate" resta un miglioramento futuro non bloccante, stesso principio di `ADR-53` §
   "Conseguenze".
6. **`public/global-sections/active` e `public/site-templates/resolve` sono rimossi**: entrambi erano
   endpoint pensati per una risoluzione a runtime (rispettivamente SSR e generico), incompatibile col
   regime air-gapped di `ADR-53` che nessuno dei due aveva mai raggiunto in produzione per questo
   consumo specifico (§ "ADR superate", punto 1) — la risoluzione avviene ora **una sola volta a
   build-time**, il risultato è già markup statico nel file HTML, nessuna richiesta pubblica
   aggiuntiva serve o è mai servita a runtime.

### 6. Migrazione: `global_sections` (header/footer) → `theme_templates`

Script di migrazione dati, eseguito una tantum all'attivazione di questa ADR: ogni riga
`global_sections` con `layoutSlot: 'header'`/`'footer'` produce una nuova riga `theme_templates` con
`kind` corrispondente, `contentTree` copiato (stesso principio "copia, non spostamento distruttivo"
già preferito ovunque in questo progetto per migrazioni con impatto sul contenuto), `conditions:
[{effect:'include', scope:'site'}]` (equivalente esatto del comportamento precedente: un header/footer
valido ovunque, `PLAN-parita-elementor-pro.md` § R7 T4: "le due `globalSection` diventano
`theme_templates` con condizione `site`"), `locale` impostato alla lingua di default del sito (il
vecchio `global_sections` non distingueva per lingua). La riga `global_sections` di origine **non è
cancellata**: il proprio `layoutSlot` è impostato a `'none'` dallo stesso script (torna a essere una
Sezione riusabile via `globalRef`, coerente col resto del proprio ciclo di vita, `ADR-55`/`ADR-59`) —
nessuna perdita di contenuto, nessuna riga orfana.

### 7. Migrazione: `site_templates` → `theme_templates`

Per le righe `type: 'error_404'`/`'search_results'` (le uniche che ADR-64 dichiarava realmente
"risolvibili" prima di questa ADR, anche se senza consumer): migrazione diretta,
`kind: '404'`/`'search'`, `conditions: [{effect:'include', scope:'notFound'}]`/
`[{effect:'include', scope:'search'}]`, `contentTree` copiato invariato, `status: 'draft'` (mai
`'published'` automaticamente: una riga che non ha mai influenzato il sito pubblicato non deve
iniziare a farlo silenziosamente al primo deploy di questa ADR — un Admin deve rivedere e pubblicare
esplicitamente). Per `type: 'single_page'`/`'loop_item'`/`'single_post'`/`'archive'` (nessuno dei
quattro aveva una semantica pubblica prima di questa ADR, § "ADR superate" punto 3): nessuna
migrazione automatica — le righe restano nella vecchia tabella `site_templates`, che questa ADR
**deprecata ma non cancella** (`ADR-21` § 3.5, stesso principio "il vecchio resta nel registro,
leggibile, fuori dalla superficie attiva" applicato qui a livello di tabella intera invece che di tipo
di blocco), con un avviso nell'admin che invita a ricreare manualmente il contenuto rilevante come
riga `theme_templates` con `kind`/`conditions` scelti a mano — nessun default inventato per una
semantica che, per costruzione, ADR-64 stessa non aveva mai definito.

### 8. RBAC e route del builder

`api/v1/app/theme-templates` (CRUD), soglia **Manager+**, stessa di ADR-64 e della riga
"Gestire Menu, Template, Sezioni globali". Il Theme Builder riusa integralmente
`FullScreenEditorLayout.tsx` come chrome, rotta `/studio/theme/:guid` — stesso pattern già stabilito
per il Popup Builder (`SPEC-POPUP.md` § 5, `/studio/popup/:guid`) e per l'editor di Pagina
(`ADR-54`). Il pannello "Display Conditions" è un **componente condiviso**,
`DisplayConditionsEditor.tsx`, montato sia dal Theme Builder sia dal pannello "Trigger e Regole" del
Popup Builder (`SPEC-POPUP.md` § 5) per la porzione `conditions` — nessuna seconda implementazione
dello stesso editor di regole `include`/`exclude`/`scope`/`ref` per due consumer che condividono
esattamente lo stesso `kind`.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Estendere `site_templates` in place (rinominare colonne, aggiungere `conditions`) invece di una tabella nuova | Nessuna migrazione di tabella | Il salto di vocabolario `type` (`single_page/search_results/loop_item/error_404/single_post/archive` → `header/footer/single/archive/404/search`) non è una rinomina 1:1 (§ "Decisione" punto 3): alcuni valori spariscono, altri cambiano significato — una migrazione di colonna nasconderebbe questo salto semantico dietro un'illusione di continuità | Il gap analysis chiede esplicitamente una tabella `theme_templates`; il salto semantico va reso esplicito, non mascherato |
| Mantenere `global_sections.layoutSlot` per header/footer, `theme_templates` solo per single/archive/404/search | Nessuna migrazione dati per header/footer | Due meccanismi di risoluzione paralleli per lo stesso concetto (template auto-risolto con condizioni) — esattamente il doppio binario che questa stessa ADR elimina per `site_templates`/`theme_templates` | Incoerenza interna, viola il principio "Theme Builder è un solo meccanismo" richiesto dal gap analysis |
| `path_pattern` con wildcard, ereditato identico da ADR-64, invece di `scope: 'pages'` con `ref` esplicito | Copre sotto-alberi di URL senza elencare ogni guid | Riapre una superficie di pattern-matching libero che il resto del registro evita deliberatamente (whitelist-first, `ADR-78`/`ADR-80`); nessun requisito del gap analysis lo richiede esplicitamente per il Theme Builder | Incoerenza con le convenzioni di validazione già stabilite, nessun beneficio che compensi |
| Un solo Header/Footer attivo globalmente (vincolo di unicità come `global_sections`), invece di più righe con `conditions` diverse | Modello più semplice, nessuna scelta di `priority` | Elementor Pro stesso supporta più header con condizioni diverse (es. header dedicato per una sezione del sito) — è precisamente il valore aggiunto del Theme Builder rispetto alle Sezioni Globali fisse | Non raggiunge la parità dichiarata, rende `theme_templates` un sinonimo ridondante di `global_sections` |
| Migrazione automatica di `single_page`/`archive`/`single_post`/`loop_item` con una `conditions` indovinata | Nessuna riga abbandonata nell'admin | ADR-64 non aveva mai dato semantica a questi valori: qualunque `conditions` inventata sarebbe un default silenzioso su un caso che nessuna decisione precedente ha mai definito | Viola "mai un default inventato silenziosamente" (`ADR-21` § 3.6, `ADR-81` § "Alternative") |

---

## Conseguenze

- Una tabella nuova (`theme_templates`), che sostituisce `site_templates` come meccanismo attivo;
  `site_templates` resta nello schema, deprecata, per le righe non migrabili automaticamente (§
  "Decisione" punto 7) — nessuna `DROP TABLE`.
- `ThemeTemplatesModule` nuovo, sostituisce `TemplateResolverService`/il controller pubblico di
  ADR-64; `api/v1/public/site-templates/resolve` e `public/global-sections/active` rimossi (§
  "Decisione" punto 5.6).
- Uno script di migrazione dati una tantum (§ "Decisione" punto 6/7), eseguito all'attivazione di
  questa ADR, non un job ricorrente.
- Il worker `static-export` guadagna uno stadio di risoluzione `theme_templates` per ogni pagina/item
  compilato — misurabile contro l'NFR "build + sync entro 5 secondi" di `ADR-53`, stesso principio già
  richiesto per ogni stadio aggiunto al worker da questo round (`SPEC-DYNAMIC.md`, `SPEC-RUNTIME.md`).
- `global_sections` resta come tabella per Sezioni riusabili via `globalRef`, con `layoutSlot` che in
  pratica non produce più mai `'header'`/`'footer'` per le righe nuove (il valore resta nello schema
  per compatibilità di lettura delle righe storiche, `ADR-21` § 3.5) — nessuna nuova riga dovrebbe
  impostarlo a quei due valori dopo questa ADR, vincolo enforced lato UI (l'opzione sparisce dal
  form), non lato validatore DB (nessun `CHECK` che romperebbe la lettura di righe storiche).
- `DisplayConditionsEditor.tsx` nuovo componente frontend condiviso fra Theme Builder e Popup Builder.
- Nessuna modifica al modello di Collezioni (`ADR-79`), consumato in sola lettura da `single`/`archive`.

## Conformità

- Test di migrazione: ogni riga `global_sections` con `layoutSlot: 'header'`/`'footer'` produce
  esattamente una riga `theme_templates` con `conditions: [{effect:'include', scope:'site'}]` e lo
  stesso `contentTree`; la riga di origine ha `layoutSlot: 'none'` dopo la migrazione.
- Test di migrazione: righe `site_templates` con `type: 'error_404'`/`'search_results'` producono
  righe `theme_templates` con `status: 'draft'` (mai `'published'` automaticamente).
- Test di risoluzione: due righe `header` con `conditions` diverse (una `site`, una `pages` su un
  sotto-insieme) e `priority` diverse — la pagina che verifica entrambe riceve quella con `priority`
  più alta; una pagina che non verifica nessuna riceve nessun header (nessun fallback nascosto).
- Test `exclude` prevale su `include`: stesso criterio già verificato per i Popup
  (`SPEC-POPUP.md` § "Criteri di verifica"), qui applicato a `theme_templates`.
- Test `single`/`archive`: una pagina di dettaglio item risolve il `theme_templates` con `kind:
  'single'` e `conditions` che verificano `scope: 'collection'`/`'collectionItem'` per quella
  Collezione; nessuna Pagina ordinaria (con proprio `contentTree`) risolve mai un `theme_templates`.
- Test di non regressione air-gap: nessuna richiesta verso `public/site-templates/resolve` o
  `public/global-sections/active` compare in `check-air-gap.js` — entrambe le rotte non esistono più.
- Test RBAC: un `User` (ruolo 30) riceve `403` su scrittura di `theme_templates`, `200` su lettura —
  stesso test già richiesto da `ADR-64`/`ADR-83`.
- Un cambio di `conditions`/`contentTree` su un `theme_templates` `published` accoda
  `enqueueFullSiteExport`; un cambio su uno `draft` non accoda alcun job.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:

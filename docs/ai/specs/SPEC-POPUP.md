# SPEC — Popup Builder: entità `site_popups`, schema `trigger`/`conditions`, protocollo di frequenza e apertura runtime

## Status
[x] Bozza — round R6 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (la riga copre anche i round
che ne dipendono, R6 incluso, finché l'INDEX non viene aggiornato con una riga propria — stessa
convenzione di `docs/ai/specs/SPEC-RUNTIME.md`).

## Relazione con gli altri documenti
Questo documento **non è una firma di ADR**: è il dettaglio implementativo di quattro decisioni già
approvate a livello di principio, nessuna delle quali viene riaperta qui:

1. `docs/SPEC-propkind-v2.md` § 3.19 (`conditions`) e § 3.20 (`trigger`) hanno già dichiarato la
   *forma* di questi due `kind` ("Theme/Popup") ma ne hanno esplicitamente rinviato lo schema di
   validazione dettagliato "al round che li consuma" (`docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`
   § "Relazione con gli altri documenti": *"il dettaglio di... `query`, `conditions`, `trigger`
   resta nel round che li consuma (R2/R4/R6/R7) e non è ripetuto qui"*). Questo documento **è**
   quel dettaglio per R6 (§ 2).
2. `ADR-83-tabella-templates-e-api-libreria.md` ha già enumerato `kind: 'popup'` come valore chiuso
   della colonna `templates.kind`, dichiarando esplicitamente *"`popup`/`loop-item` sono valori
   ammessi nell'enum da subito ma senza alcun consumer... il Popup Builder è R6"* (§ "Decisione"
   punto 1). Questo documento **è** quel consumer (§ 1).
3. `ADR-74-isole-js-pubbliche.md` ha già nominato `popup` come uno dei dieci moduli chiusi del
   bundle pubblico. `docs/ai/specs/SPEC-RUNTIME.md` § 4.8 ne fissa il contratto DOM/JS; questo
   documento ne fissa il protocollo applicativo (trigger, condizioni, frequenza) che quel modulo
   esegue.
4. `ADR-53-air-gapped-ssg-zero-db.md` resta il regime invariato di consegna: un popup diventa
   markup statico incluso nel file HTML della pagina al momento dell'export, mai una richiesta a
   runtime verso un'API pubblica.

### Perché una SPEC e non una nuova ADR
`docs/PLAN-parita-elementor-pro.md` § "Riepilogo" (redatto 2026-09-16) prevedeva un'ADR dedicata al
Popup Builder per il round R6. Nel momento in cui questo documento viene scritto, le decisioni
architetturali che quell'ADR avrebbe dovuto prendere sono **già tutte coperte** da ADR precedenti
(punti 1–4 sopra): non resta da decidere *se* introdurre isole JS, *quale* forma dare a
`trigger`/`conditions`, o *come* modellare la copia di un sotto-albero riusabile — resta solo da
**comporre** quei pezzi in un'entità concreta. Lo stesso principio di demarcazione già usato per
`docs/ai/specs/SPEC-GLOBAL-KIT.md` (dettaglio di `ADR-77`, non una nuova ADR) si applica qui: una
SPEC fissa DTO, endpoint e algoritmi entro i vincoli già approvati; un'ADR è necessaria solo quando
si introduce un principio nuovo, un rischio nuovo o una dipendenza nuova — nessuno dei tre casi
ricorre in questo documento. La tabella nuova `site_popups` (§ 1) è quindi un'estensione di schema
analoga a quella che `SPEC-GLOBAL-KIT.md` § 1 ha fissato per `app_settings.global_kit`, non una
decisione di principio: la sua forma **replica** lo stesso pattern strutturale già usato da
`global_sections`/`site_templates`/`templates` (tabelle mutabili con audit completo, già approvato
quattro volte in questo stesso progetto), non ne inventa uno nuovo.

## ADR applicabili
- `ADR-83-tabella-templates-e-api-libreria.md` — `templates.kind = 'popup'` è la libreria di design
  riusabile; `site_popups` (§ 1) è l'entità "attiva sul sito", stessa relazione già stabilita fra
  `templates.kind = 'page'` e `pages` (un Template è sempre copiato, mai referenziato).
- `ADR-74-isole-js-pubbliche.md` — il modulo `popup`, il budget condiviso, CSP/nonce.
- `docs/SPEC-propkind-v2.md` § 3.19/§ 3.20 — forma di `conditions`/`trigger` (riportata qui solo per
  comodità di lettura, non ridichiarata).
- `ADR-21-schema-blocchi-versionamento.md` — il contenuto del popup (`contentTree`) è validato dalla
  stessa `BlockTreeValidatorService` di ogni altra tabella che persiste un albero blocchi.
- `ADR-54-editor-isolato-rotta-studio.md` — il Popup Builder riusa `FullScreenEditorLayout.tsx`
  come chrome (§ 5), non introduce una seconda shell di editing.

---

## 1. Modello dati

### 1.1 Due entità distinte, stessa relazione già in uso per i Template

| Entità | Ruolo | Copia o riferimento | Tabella |
|---|---|---|---|
| **Template di popup** (`ADR-83`) | Design riusabile in libreria, non attivo su alcuna pagina | — | `templates`, `kind = 'popup'` |
| **Popup** (questo documento) | Istanza attiva del sito, con trigger/condizioni/frequenza propri | Il proprio `contentTree` è **sempre una copia**, presa da un Template al momento della creazione oppure scritta da zero nel builder | `site_popups` (nuova) |

Questa relazione è **identica** a quella già stabilita da `ADR-83` § "Chiarimento terminologico" fra
`templates.kind = 'page'` e la tabella `pages`: un Template di Pagina è copiato quando si crea una
Pagina; un Template di Popup è copiato quando si crea un Popup. Nessun nuovo principio di copia
viene introdotto — solo una seconda entità "attiva" che, come `pages`, possiede un proprio ciclo di
vita (bozza/pubblicato), oltre al `contentTree` ereditato dal Template di origine.

### 1.2 Tabella `site_popups`

Stessa "Struttura obbligatoria ogni tabella" della constitution, stesso pattern strutturale di
`global_sections`/`site_templates`/`templates` (`id serial`, `guid char(16)`, soft delete
`isActive`, `version` per lock ottimistico, audit `createdAt/updatedAt/createdBy/updatedBy`):

```typescript
// schema.ts
export const sitePopupEntity = pgTable(
  'site_popups',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),

    name: varchar('name', { length: 255 }).notNull(),

    /**
     * Stesso envelope jsonb `{ version, blocks }` di ADR-21, validato da BlockTreeValidatorService
     * — nessun secondo validatore per questa tabella (SPEC-propkind-v2.md § 1 principio "un unico
     * interprete"). `blocks.length === 1`: un solo nodo radice di tipo `popup` (§ 1.3), stesso
     * vincolo di servizio già applicato da ADR-83 § "Decisione" punto 3 per i Template non-page.
     */
    contentTree: jsonb('content_tree').notNull(),

    /** kind: 'trigger' (SPEC-propkind-v2.md § 3.20), schema di validazione § 2.1 sotto. */
    trigger: jsonb('trigger').notNull(),

    /** kind: 'conditions' (SPEC-propkind-v2.md § 3.19), schema di validazione § 2.2 sotto. */
    conditions: jsonb('conditions').notNull().default('[]'),

    /**
     * Stato editoriale, stesso vocabolario chiuso già in uso per `pages.status`
     * (`draft|published`) — nessun terzo stato: un Popup `draft` non è mai incluso nell'export
     * di alcuna pagina, indipendentemente da `conditions`.
     */
    status: varchar('status', { length: 20 }).notNull().default('draft'),

    /** Nullable: guid del Template di origine, solo a scopo di tracciabilità editoriale — non un
     * riferimento vivo (§ 1.1: la copia è indipendente dal Template fin dalla creazione, coerente
     * con ADR-83 § "Decisione" punto 2, "modificare o cancellare un Template... non altera i nodi
     * già inseriti"). Nessuna FK: il Template di origine può essere cancellato senza vincolo. */
    sourceTemplateGuid: char('source_template_guid', { length: 16 }),

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
    uniqueIndex('site_popups_guid_idx').on(t.guid),
    index('site_popups_status_idx').on(t.status, t.isActive),
  ],
);
```

Nessuna colonna `locale`/`siteId` in questo round: il CMS resta a sito singolo per il contenuto
(`docs/constitution.md` § "Un sito, pagine"), coerente con ogni altra tabella di questo progetto.

### 1.3 Blocco radice `popup` — nuovo `BlockDefinition`

Il `contentTree` di un Popup ha sempre esattamente un nodo radice di tipo **`popup`**, un
contenitore analogo a `container` v2 (`ADR-82`) ma con superficie ridotta: rappresenta la finestra
modale stessa, non un layout di pagina.

```
tag: div (fisso, nessuna scelta di tag semantico: un popup non è mai <section>/<article>)
size: enum('small'|'medium'|'large'|'fullscreen'|'custom')  — 'custom' abilita width/height
width/height: unitValue (px|%|vw|vh), rilevanti solo con size:'custom'
position: enum('center'|'top'|'bottom'|'top-left'|'top-right'|'bottom-left'|'bottom-right')
overlay: { color: colorRef, opacity: 0–1, closeOnClick: boolean }
closeButton: { show: boolean, position: enum('inside'|'outside'), color: colorRef }
entranceAnimation: animation   — riusa lo stesso kind di ADR-85/SPEC-RUNTIME § 4.1 (kind: 'animation'), nessuna forma nuova
background: background (stateful)  — stesso kind di container
border/radius/shadow: stateful, stessi kind di container
padding: spacing
htmlId, cssClass, attributes, css   — stesso mixin Avanzato di ADR-85 § 1, sottoinsieme applicabile (nessun `position`/`hideOn`/`margin`/`motion`/`transform`/`filter`/`opacity`/`border` duplicato oltre a quanto già elencato sopra: un popup non è posizionato nel flusso della pagina, il proprio posizionamento è governato da `position` enum sopra, non dal `kind: 'position'` del mixin)
children.allow: '*'  — stesso principio di container: qualunque widget può comporre il contenuto del popup
```

`meta.runtime: ['popup']` statico (§ 5.2 di `SPEC-RUNTIME.md`, non per-istanza: ogni Popup, per
definizione, richiede il modulo `popup`). Nessun bump di versione di schema per `container`: `popup`
è un tipo di blocco **nuovo**, non una variante di `container` — non condivide `v`/migrazioni.

---

## 2. Schema di validazione `trigger` e `conditions`

### 2.1 `trigger`

Forma già dichiarata da `SPEC-propkind-v2.md` § 3.20:

```ts
interface TriggerValue {
  onLoad?: { delayS: number };                                    // 0–120
  onScroll?: { direction: 'down' | 'up'; percent: number };       // percent 0–100
  onScrollToElement?: { htmlId: string };                          // ≤ 60 char, `[a-zA-Z][\w-]*`
  onClick?: { count: number };                                     // 1–20, click su qualunque elemento con data-popup-trigger-click sulla stessa pagina
  onInactivity?: { s: number };                                    // 5–600
  onExitIntent?: boolean;
  frequency: {
    showUpTo: number;                                              // 1–50, 0 = illimitato
    perSession?: boolean;
    perDays?: number;                                              // 1–365, mutuamente esclusivo con perSession (presentazione, non validazione cross-campo — § 2.1 punto 4)
    hideAfterClose: boolean;
  };
  devices: BreakpointKey[];                                        // sottoinsieme di resolveActiveBreakpoints(), § 2.1 punto 5
  schedule?: { from: string; to: string };                         // ISO 8601 UTC, assente = sempre attivo
}
```

#### Regole di validazione

1. **Almeno un trigger di apertura dichiarato**: `onLoad`, `onScroll`, `onScrollToElement`,
   `onClick`, `onInactivity` o `onExitIntent` — un `TriggerValue` con nessuno dei sei presenti è
   rifiutato con `400`, `reason: 'required'` sul path `trigger` (un Popup senza alcun modo di
   aprirsi non è un valore ammissibile, a differenza di una prop opzionale ordinaria: qui la
   presenza del contenitore stesso implica un contratto minimo).
2. **Combinabili, non esclusivi**: Elementor stesso ammette più condizioni di apertura
   contemporanee (es. `onScroll` **e** `onExitIntent` insieme, il primo che si verifica apre il
   popup) — il validatore non impone un solo trigger attivo, coerente con "nessuna logica
   cross-campo nel validatore" già affermato per altri `kind` compositi
   (`SPEC-PROPKIND-V2-DETAILS.md` § 7 punto 3).
3. **`onExitIntent` è un booleano puro**: nessun parametro (a differenza di Elementor Pro, che non
   ne espone comunque) — il runtime lo interpreta sempre come "il puntatore esce dal bordo
   superiore della viewport", unico algoritmo, nessuna configurabilità aggiuntiva che non
   servirebbe un caso reale.
4. **`frequency.perSession`/`perDays` sono presentazione, non validazione incrociata**: il
   validatore accetta entrambi presenti contemporaneamente (il renderer/runtime applica
   `perDays` se presente, altrimenti `perSession`, mai una combinazione — § 3.2), stesso principio
   già stabilito per `gradient.position`/`type` (`SPEC-PROPKIND-V2-DETAILS.md` § 6 punto 3).
   `showUpTo: 0` è un valore ammesso col significato esplicito "nessun limite di conteggio" (non
   un errore, non un default improprio).
5. **`devices`**: array di chiavi valide contro `resolveActiveBreakpoints()` (`ADR-76`), stesso
   principio "chiave nota ma disattivata è accettata, chiave sconosciuta è rifiutata" già applicato
   da `sticky.onBreakpoints` (`SPEC-PROPKIND-V2-DETAILS.md` § 7 punto 2). Array vuoto **non** è
   equivalente a "tutti i device": è interpretato dal runtime come "nessun device", popup mai
   mostrato — se l'autore vuole tutti i device deve dichiararli esplicitamente (nessun default
   implicito su un campo obbligatorio che cambia significato in base all'assenza di valore,
   principio già seguito per ogni altro campo `required` di questo registro).
6. **`schedule.from`/`to`**: se presenti, `to` deve essere cronologicamente successivo a `from`
   (unica regola cross-campo di questo `kind`, verificata perché la violazione produrrebbe un popup
   strutturalmente mai mostrabile — un caso diverso da "presentazione non validata": qui l'accettazione
   di un intervallo invertito sarebbe un dato palesemente insensato per costruzione, non un caso
   d'uso legittimo lasciato al renderer). Fuori da questo singolo controllo, `schedule` resta un
   oggetto puramente dichiarativo interpretato a runtime (§ 3.3), non a export-time: un Popup con
   `schedule` non richiede una ri-pubblicazione quando la finestra temporale scade o inizia,
   coerente con l'air-gap (nessun job schedulato lato server per attivare/disattivare un Popup a
   una certa ora).

### 2.2 `conditions`

Forma già dichiarata da `SPEC-propkind-v2.md` § 3.19, riusata identica (nessuna variante per Popup
rispetto a Theme):

```ts
type ConditionsValue = Array<{
  effect: 'include' | 'exclude';
  scope: 'site' | 'pages' | 'page' | 'collection' | 'collectionItem' | 'locale' | 'notFound' | 'search';
  ref?: string; // guid|id, obbligatorio per scope 'pages'|'page'|'collection'|'collectionItem', assente per 'site'|'notFound'|'search'|'locale' (locale usa un codice, non un guid)
}>;
```

#### Regole di validazione (specifiche per il consumo Popup di questo round)

1. **`scope: 'collection'|'collectionItem'` sono ammessi nel tipo fin da subito ma senza alcuna
   risoluzione possibile in R6**: le Collezioni non esistono prima di `ADR-79`/R7. Un Popup salvato
   con una condizione su quello scope in R6 è validato in **forma** (stesso principio "nessuna
   verifica di esistenza a scrittura" già stabilito per `colorRef`/`mediaRef`) ma **non produce mai
   un match** nel worker di export finché R7 non introduce il modello Collezioni — stesso schema di
   rinvio già usato da `ADR-82`/`ADR-85` per prop accettate prima del proprio renderer.
2. **Array vuoto = nessuna pagina corrisponde**: coerente con `devices` (§ 2.1 punto 5), un Popup
   senza alcuna condizione dichiarata non appare da nessuna parte — non è un errore di validazione,
   è lo stato iniziale di un Popup appena creato prima che l'autore ne definisca l'ambito
   (`status: 'draft'` nella pratica lo terrebbe comunque fuori dall'export, § 3.1, ma la regola vale
   anche per un Popup pubblicato con `conditions: []` per negligenza — nessun popup fantasma per
   omissione).
3. **Risoluzione `include`/`exclude`**: un `exclude` con `ref` corrispondente prevale sempre su
   qualunque `include` per la stessa pagina, indipendentemente dall'ordine nell'array (stesso
   principio "exclude vince" già anticipato in linea di massima da `SPEC-propkind-v2.md` § 3.19 per
   Theme Builder, applicato qui per la prima volta con un algoritmo concreto, § 3.1).

---

## 3. Risoluzione a export-time (worker `static-export`)

### 3.1 Algoritmo, per ogni pagina in fase di build

1. Leggere l'insieme dei `site_popups` con `status: 'published'` e `isActive: true` (una sola
   lettura per l'intera esecuzione di build, stesso principio di cache di processo già usato da
   `SPEC-GLOBAL-KIT.md` § 3 "Risoluzione dei riferimenti" per `global_kit`).
2. Per ciascun Popup, valutare `conditions` contro l'identità della pagina corrente (guid, stato
   "not found" se la build sta producendo la pagina 404 del sito — fuori scope dettagliato qui,
   riferimento a R7 per lo scope `notFound`/`search` completo): un `exclude` che corrisponde
   esclude sempre, altrimenti un `include` che corrisponde include; nessun `include` che corrisponde
   e nessun `exclude` che corrisponde ⇒ il Popup non compare su questa pagina.
3. Per ogni Popup risultante incluso: renderizzare `contentTree` con la stessa pipeline di
   `toCss()`/render blocchi già usata per ogni altro contenuto (`SPEC-PROPKIND-V2-DETAILS.md` § 10),
   producendo un frammento HTML `<div data-popup="<guid>" hidden data-popup-config='{…}'>…</div>`
   iniettato **una volta** in coda al `<body>` della pagina (mai dentro il flusso principale del
   documento — un popup non è mai figlio del contenitore di pagina).
4. `data-popup-config` è un JSON serializzato di `{ trigger: TriggerValue }` — **non** include
   `conditions` (già consumate a questo stadio, irrilevanti a runtime: se il frammento è nella
   pagina, la condizione è già risolta positivamente) né `contentTree` (già renderizzato in markup).
5. Aggiungere `'popup'` all'unione `meta.runtime` della pagina (`SPEC-RUNTIME.md` § 5.2) se almeno
   un Popup risulta incluso — coerente con "nessun tag `<script>` per una pagina che non ne ha
   bisogno" anche quando la pagina stessa non dichiara alcun blocco `meta.runtime` proprio.
6. **Nessuna cache incrementale per Popup in questo round**: un cambio a un `site_popups` (nuovo
   trigger, nuove condizioni) accoda `enqueueFullSiteExport` (stesso meccanismo di `ADR-45`/`ADR-53`
   già in uso per un cambio di markup atteso) — a differenza del Global Kit (`ADR-77` § "Decisione"
   punto 4), un Popup **non** è un token risolto via CSS custom property: è markup e configurazione
   che cambia la forma del file, quindi richiede la rigenerazione delle pagine che il nuovo insieme
   di condizioni tocca. Un'ottimizzazione che rigeneri solo le pagine effettivamente impattate (invece
   di un fan-out totale) è un miglioramento futuro non bloccante per questo round, coerente con
   "costo proporzionale al numero di pagine" già accettato da `ADR-53` § "Conseguenze" per ogni
   rebuild di massa.

### 3.2 Frequenza — protocollo `localStorage`

Chiave: `cms_popup_<guid>`. Valore (JSON):

```ts
interface PopupFrequencyState {
  shownCount: number;
  lastShownAt: string;   // ISO 8601
  closedAt?: string;     // ISO 8601, presente solo se l'utente ha chiuso esplicitamente
}
```

**Algoritmo di apertura** (eseguito dal modulo `popup` del runtime, `SPEC-RUNTIME.md` § 4.8, a ogni
innesco di trigger valutato positivamente):
1. Se `hideAfterClose: true` e `closedAt` è presente ⇒ non aprire mai più (nessuna finestra
   temporale: la chiusura esplicita è definitiva per questo visitatore, comportamento Elementor
   identico per l'opzione equivalente).
2. Se `showUpTo > 0` e `shownCount >= showUpTo` ⇒ non aprire.
3. Se `frequency.perDays` presente: se `now − lastShownAt < perDays` giorni ⇒ non aprire. Se
   `frequency.perSession` presente (e `perDays` assente): usare `sessionStorage` invece di
   `localStorage` per l'intero stato (stessa struttura, storage diverso — "per sessione" significa
   per scheda/finestra del browser corrente, azzerato alla chiusura, mai persistito oltre).
4. Altrimenti, aprire: incrementare `shownCount`, aggiornare `lastShownAt = now`, scrivere lo stato.
5. Alla chiusura esplicita (click su `data-popup-close` o `overlay.closeOnClick`): scrivere
   `closedAt = now` nello stesso oggetto.

**Nessuno stato lato server**: coerente con `ADR-74` § 6 (zero chiamate di rete oltre le eccezioni
chiuse) e con lo stesso principio già applicato a `countdown` evergreen
(`SPEC-RUNTIME.md` § 4.4) — la frequenza è un'esperienza per-browser, non per-account (il CMS non
ha un concetto di account del visitatore pubblico, coerente con l'assenza totale di autenticazione
lato pubblico di `ADR-53`).

### 3.3 Valutazione trigger a runtime

Il modulo `popup` (`SPEC-RUNTIME.md` § 4.8) valuta, nell'ordine in cui l'evento corrispondente si
verifica per primo (nessuna priorità dichiarata fra i sei trigger, il browser decide l'ordine reale
degli eventi):
- `onLoad`: `setTimeout(open, delayS * 1000)` all'inizializzazione del modulo.
- `onScroll`: un listener di scroll condiviso (stesso `raf-throttle` di `motion`,
  `SPEC-RUNTIME.md` § 3) calcola la percentuale di scroll verticale della pagina; al superamento
  della soglia nella direzione dichiarata, apre e disattiva il proprio listener (un trigger di
  apertura si consuma una sola volta per caricamento di pagina, indipendentemente da `frequency` —
  la frequenza regola *se* l'apertura è permessa, non *quante volte per pagina* il trigger tenta).
- `onScrollToElement`: `IntersectionObserver` sull'elemento `htmlId` indicato.
- `onClick`: incrementa un contatore su ogni click che avviene su un nodo con
  `data-popup-trigger-click="<guid>"` (emesso dal worker su un widget/link scelto dall'autore come
  innesco — nessun click "su qualunque punto della pagina", che aprirebbe il popup in modo non
  intenzionale); apre al raggiungimento di `count`.
- `onInactivity`: un timer resettato da `pointermove`/`keydown`/`scroll`, apre se nessun evento
  utente si verifica per `s` secondi.
- `onExitIntent`: `mouseleave` sul `document` con `event.clientY <= 0` (il puntatore esce dal bordo
  superiore) — **non disponibile su touch** (nessun evento equivalente esiste su mobile): un Popup
  che dichiara solo `onExitIntent` e nessun altro trigger non si apre mai su un visitatore mobile,
  comportamento accettato e coerente con lo stesso limite di Elementor Pro stesso su questo trigger,
  non una lacuna di questa implementazione.
- **`schedule`**: verificato come **precondizione** prima di valutare qualunque trigger (se
  `now` è fuori da `[from, to]`, nessun trigger viene mai armato) — controllo eseguito
  interamente lato client con l'orologio del visitatore (nessuna chiamata di rete per sincronizzare
  l'ora, coerente con l'air-gap; un'imprecisione dell'orologio locale del visitatore è un rischio
  accettato, identico a quello di qualunque countdown lato client).
- **`devices`**: verificato allo stesso modo di `motion.onBreakpoints`
  (`SPEC-RUNTIME.md` § 4.7) contro il breakpoint attivo corrente, incluso il ricalcolo al resize.

---

## 4. Endpoint API

### `GET api/v1/app/site-popups`
- **Guard**: JWT, qualunque ruolo con accesso all'editor (lettura), stessa soglia di
  `GET app/templates` (`ADR-83`).
- **Query**: `status?`, `search?`, `page`/`pageSize`.
- **Response 200**: `{ items: SitePopupListItemDto[], total }` — lista leggera senza `contentTree`
  (stesso principio "lista leggera, dettaglio pesante" di `ADR-83`).

### `GET api/v1/app/site-popups/:guid`
- **Response 200**: `SitePopupDetailDto` — tutti i campi più `contentTree` migrato alla lettura
  (`ADR-21`, stessa funzione di migrazione già in uso per ogni altra tabella che persiste un
  albero).

### `POST api/v1/app/site-popups`
- **Guard**: `GuardManager` (Manager+, stessa soglia di "Gestire Menu, Template, Sezioni globali",
  `business-rules.md` riga 125, estesa qui ai Popup per coerenza di dominio: creare un elemento
  visibile su più pagine del sito è un'azione editoriale di ampiezza equivalente).
- **Request body**: `CreateSitePopupDto { name, contentTree, trigger, conditions, sourceTemplateGuid? }`.
- **Response 201**: `{ guid, name, status: 'draft', version }` — sempre creato in bozza, mai
  pubblicato dalla creazione (coerente con `pages.status`).
- **Response 400**: `contentTree` non valido (`BlockTreeValidatorService`, stesso formato di errore
  con `path`), oppure `contentTree.blocks.length !== 1` o `blocks[0].type !== 'popup'`, oppure
  `trigger` senza alcun trigger di apertura (§ 2.1 punto 1).

### `PATCH api/v1/app/site-popups/:guid`
- **Guard**: `GuardManager`, lock ottimistico su `version` → `409`.
- **Request body**: sottoinsieme parziale di `CreateSitePopupDto` più `status?: 'draft'|'published'`.
- **Response 200**: entità aggiornata. Un cambio che porta `status` a `'published'` o che modifica
  `contentTree`/`trigger`/`conditions` di un Popup già `published` accoda `enqueueFullSiteExport`
  (§ 3.1 punto 6).

### `DELETE api/v1/app/site-popups/:guid`
- **Guard**: `GuardManager`. Soft delete (`isActive = false`); un Popup disattivato è trattato come
  assente da ogni build successiva (equivalente a `status: 'draft'` ai fini dell'export, ma
  distinto per la UI: un Popup soft-deleted non compare più nella libreria).
- **Response 204**.

---

## 5. Popup Builder — riuso della chrome esistente

Il builder riusa **integralmente** `FullScreenEditorLayout.tsx` (`ADR-54`) come chrome
(topbar/canvas iframe/sidebar), la stessa rotta pattern di `/studio/:guid` applicata a
`/studio/popup/:guid` — nessun nuovo componente di shell, nessuna nuova modalità di montaggio del
canvas (il canvas resta l'iframe same-origin di `ADR-72`, il nodo radice `popup` renderizzato al suo
interno con le proprie dimensioni/posizione simulate nel canvas via CSS, non un vero overlay
browser durante l'editing).

**Superfici aggiunte, non sostituite**:
- Un pannello "Trigger e Regole" nella sidebar (accanto a Contenuto/Stile/Avanzato del nodo radice
  `popup`), con i controlli per `trigger`/`conditions`/`frequency` — non un `PropField` generico
  come gli altri `kind`: la combinazione di sei trigger opzionali più condizioni più frequenza
  giustifica un pannello dedicato, coerente con il trattamento già riservato a pannelli compositi
  complessi come `TypographyPopover` (`PLAN` § R1 T5).
- **Anteprima trigger**: un pulsante "Test apertura" nella topbar del builder forza l'apertura del
  popup nel canvas **ignorando** `trigger`/`frequency`/`conditions` (mostra sempre il contenuto,
  utile per verificare stile/contenuto senza dover riprodurre lo scroll/l'inattività reali) — un
  meccanismo puramente editoriale, non un'API del runtime pubblico (`SPEC-RUNTIME.md` § 4.8 non
  espone alcuna funzione `window.CmsPopup` per questo scopo, il forzamento avviene nel canvas admin
  con un semplice stato locale del builder, mai nel bundle pubblico).
- La libreria Template (`TemplateLibraryModal.tsx`, `ADR-83` § "Conseguenze") guadagna, quando aperta
  dal contesto Popup Builder, il filtro implicito `kind: 'popup'` sulla tab "Blocchi" — nessuna
  quarta tab, riuso dello stesso filtro già esistente per `kind`.

---

## Criteri di verifica

- Un `TriggerValue` senza alcuno dei sei trigger di apertura è respinto `400` con `reason:
  'required'` sul path `trigger` (§ 2.1 punto 1).
- Un `TriggerValue` con `schedule.to` antecedente a `schedule.from` è respinto `400` (§ 2.1 punto 6).
- Un `ConditionsValue` con `scope: 'collection'` è accettato in scrittura ma non produce mai un
  Popup incluso nell'export finché la Collezione referenziata non esiste — asserito con un test che
  pubblica un Popup con questo scope e verifica che nessuna pagina lo includa (§ 2.2 punto 1).
- Un `exclude` su una pagina prevale su un `include` di scope più ampio (`site`) per la stessa
  pagina, verificato con un test dedicato sull'algoritmo § 3.1 punto 2.
- `POST` con `contentTree.blocks.length !== 1` o con un tipo di nodo radice diverso da `popup` è
  respinto `400` prima dell'invocazione del validatore d'albero generico (stesso principio di
  `ADR-83` § "Conformità").
- Una pagina con almeno un Popup incluso porta `'popup'` nel proprio `data-runtime-modules`, anche
  se nessun altro blocco della pagina richiede il runtime — verificato come estensione del test
  snapshot di `SPEC-RUNTIME.md` § 5.3.
- Un cambio di `trigger`/`conditions`/`contentTree` su un `site_popups` con `status: 'published'`
  accoda `enqueueFullSiteExport`; un cambio con `status: 'draft'` non accoda alcun job (§ 3.1
  punto 6, § 4 `PATCH`).
- Test Playwright end-to-end per ciascuno dei sei trigger (simulando scroll, inattività con clock
  di test, click ripetuti, exit intent via evento sintetico `mouseleave`) su una pagina statica
  esportata di prova, verificando apertura al momento atteso e rispetto di `frequency` su
  ricaricamento della pagina con `localStorage` precompilato.
- Un Popup con `hideAfterClose: true`, chiuso una volta, non si riapre su un ricaricamento
  successivo della stessa pagina nello stesso browser (stato `localStorage` preservato fra
  ricaricamenti in un test Playwright con contesto di storage persistente).
- Un `User` (ruolo 30) riceve `403` su `POST`/`PATCH`/`DELETE` di `site-popups`, `200` su `GET` —
  stesso test RBAC già richiesto da `ADR-83` per `templates`.

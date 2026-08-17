# Spec — F01 Gestione Pagine

## Status

[x] Bozza — **in attesa di approvazione umana** · [ ] Approvata · [ ] Superseded

> Generata dall'Orchestrator il 2026-08-13. Nessuna implementazione può iniziare
> prima dell'approvazione (Constitution, Principle 4). In particolare, le modifiche
> a `app/backend/src/db/schema.ts` richiedono approvazione esplicita separata
> (CLAUDE.md → "Ask first").
>
> **Revisione del 2026-08-17** su richiesta esplicita dell'umano, a valle delle decisioni
> confermate lo stesso giorno. Modificato: due indici univoci parziali filtrati su
> `is_active` (§ Schema DB) · `page_revisions` come tabella append-only, senza
> `isActive`/`updatedAt`/`updatedBy`/`version` (§ Schema DB) · **sanitizzazione delle
> props di stringa dentro F01** (§ Sanitizzazione) · mappatura constraint → `409`
> (§ Logica di servizio) · `403` amministrativo allineato a ADR-18 (§ Endpoint) ·
> A3 e A5 risolte (§ Vincoli e assunzioni).

## Feature di riferimento

`docs/ai/features/F01-gestione-pagine.md`

## ADR applicabili

- `ADR-2-security-baseline.md` — auth, RBAC, redazione log
- `ADR-8-storage-abstraction-files.md` — pattern `entity`/`entityId` non-FK, riusato qui
- `ADR-12-notifiche-persistenti-realtime.md` — `AppGateway.emitToUser` per la presenza in editor
- `ADR-18-ownership-per-riga.md` — **bloccante, in attesa di firma**: dove vive il check di
  ownership, helper condiviso, predicato di lista, `403` vs `404`

**ADR mancanti che questa spec presuppone** (da produrre prima o insieme
all'implementazione, vedi "Rischi aperti"):
- Strategia di versionamento/revisioni (snapshot completo vs. diff) — **bloccante per lo
  schema**: autorizza `page_revisions` come tabella append-only
- Formato e versionamento dello schema dei blocchi (necessaria per F02, questa spec ne
  dipende solo per il campo `content`)

## Outcomes tecnici

Al termine esistono:
- Tabelle `pages` e `page_revisions` in `app/backend/src/db/schema.ts` + migrazione
- Modulo `app/backend/src/pages/` con controller, service, DTO
- Endpoint amministrativi sotto `api/v1/app/pages`
- Pagine frontend `PagePages.tsx` (elenco) e `PagePageDetail.tsx` (dettaglio/bozza)
- Servizio `pages.service.ts` e tipi `pages.types.ts` nel frontend
- Collezioni Bruno in `bruno/pages/`
- Test unit + integration + contract

## In scope

- Modello dati Pagina e Revisione
- CRUD amministrativo con RBAC
- Macchina a stati con transizioni validate server-side
- Slug: generazione, unicità, riservati, validazione dei cicli di gerarchia
- Revisioni: creazione a ogni pubblicazione, elenco, dettaglio, ripristino
- Controllo ottimistico dei salvataggi concorrenti
- Audit log delle azioni sensibili

## Out of scope

Quanto elencato in "Out of scope" della feature F01. In particolare: nessun endpoint
`public/`, nessuna validazione per tipo di blocco, nessuna UI di editing visuale.

## Vincoli e assunzioni

**Vincoli** (da `docs/constitution.md`): stack immutabile; `jsonb` per il contenuto
strutturato; soft delete; FK `restrict`; `guid` nelle URL amministrative;
`AppConstants` per le env; nessun `any` non commentato; Mantine v7 esclusivo.

**Assunzioni globali risolte il 2026-08-17** (`docs/business-rules.md`), che questa spec
non deve più trattare come aperte:

- **A2 confermata** — il contenuto è un albero di blocchi JSON: `draftContent`/`content`
  restano `jsonb`.
- **A3 confermata** — le traduzioni sono righe autonome legate da `translationGroupId`;
  la scelta S4 (colonna opaca, non tabella) è confermata nella stessa sede.
- **A4 confermata con correzione** — nessun ruolo nuovo, ma serve ownership per riga:
  vedi ADR-18 e § Logica di servizio, punto 8.
- **A5 confermata: mono-sito, più lingue** — **nessuna colonna `siteId`** su `pages` né su
  `page_revisions`, nessun `applyScopeFilter` in nessuna query di questa feature, nessun
  parametro "in previsione". L'unico punto di innesto di un eventuale multi-sito futuro è
  `Utils.applyScopeFilter(authInfo)` (`docs/business-rules.md` § Conseguenza di A5).
- **A6 resta aperta** e non tocca F01 in nessun punto.

**Assunzioni esplicite di questa spec** (oltre a quelle globali in
`docs/business-rules.md`):

| # | Assunzione | Stato | Impatto se sbagliata |
|---|---|---|---|
| S1 | La Revisione è uno **snapshot completo** del contenuto, non un diff incrementale | ⏳ Da formalizzare nell'ADR sulle revisioni | Con contenuti molto grandi e molte revisioni cresce lo spazio occupato; il diff sarebbe più compatto ma molto più complesso da ripristinare |
| S2 | La **bozza di lavoro** vive sulla riga `pages` (colonne `draftContent`/`draftSeo`), non su una tabella separata | ⏳ Da approvare con lo schema | Una tabella separata reggerebbe meglio più bozze parallele per la stessa Pagina, che qui non sono previste |
| S3 | Il controllo ottimistico usa un contatore `version` sulla riga `pages`, non un hash del contenuto | ⏳ Da approvare con lo schema | Equivalente in pratica; il contatore è più economico da confrontare |
| S4 | Il campo `translationGroupId` è un `char(16)` opaco generato alla creazione, non una FK a una tabella `translation_groups` | ✅ **Confermata** il 2026-08-17 con A3 | — |

## Schema DB (Drizzle)

> **Proposta soggetta ad approvazione esplicita** — nessuna modifica a `schema.ts` senza
> via libera umana.

### Tabelle nuove

```typescript
// schema.ts — bozza indicativa, non ancora approvata

export const pageEntity = pgTable(
  'pages',
  {
    id: serial('id').primaryKey(),
    guid: char('guid', { length: 16 }).notNull(),   // unicità via uniqueIndex, vedi sotto

    // Identità pubblica
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    locale: varchar('locale', { length: 10 }).notNull(),
    parentId: integer('parent_id'),            // self-FK, restrict
    translationGroupId: char('translation_group_id', { length: 16 }).notNull(),

    // Ciclo di vita
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    publishedAt: timestamp('published_at'),
    scheduledAt: timestamp('scheduled_at'),
    publishedRevisionId: integer('published_revision_id'),  // FK → page_revisions, restrict

    // Contenuto in lavorazione (S2)
    draftContent: jsonb('draft_content').notNull(),
    draftSeo: jsonb('draft_seo').notNull(),

    // Concorrenza (S3)
    version: integer('version').notNull().default(1),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: integer('created_by').notNull(),   // FK → users.id, restrict
    updatedBy: integer('updated_by').notNull(),   // FK → users.id, restrict
  },
  (t) => [
    uniqueIndex('pages_guid_idx').on(t.guid),

    // Unicità dello slug: DUE indici parziali, non uno solo. Vedi § "Unicità dello slug".
    uniqueIndex('pages_slug_locale_root_uq')
      .on(t.locale, t.slug)
      .where(sql`${t.parentId} is null and ${t.isActive}`),
    uniqueIndex('pages_slug_locale_child_uq')
      .on(t.locale, t.parentId, t.slug)
      .where(sql`${t.parentId} is not null and ${t.isActive}`),

    index('pages_status_locale_idx').on(t.status, t.locale),
    index('pages_translation_group_idx').on(t.translationGroupId),
    index('pages_parent_idx').on(t.parentId),
    index('pages_created_by_idx').on(t.createdBy),   // predicato di ownership, ADR-18 D6
  ],
);

// Tabella APPEND-ONLY: struttura ridotta a `id`/`guid`/`createdAt`/`createdBy`
// (CLAUDE.md § Database). Nessun `isActive`, `updatedAt`, `updatedBy`, `version`:
// vedi § "Perché `page_revisions` è append-only".
export const pageRevisionEntity = pgTable(
  'page_revisions',
  {
    id: serial('id').primaryKey(),
    guid: char('guid', { length: 16 }).notNull(),   // unicità via uniqueIndex, vedi sotto

    pageId: integer('page_id').notNull(),        // FK → pages.id, restrict
    revisionNumber: integer('revision_number').notNull(),

    // Snapshot immutabile (S1)
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: integer('created_by').notNull(),   // FK → users.id, restrict
  },
  (t) => [
    uniqueIndex('page_revisions_guid_idx').on(t.guid),
    uniqueIndex('page_revisions_page_number_uq').on(t.pageId, t.revisionNumber),
  ],
);
```

### Unicità dello slug — due indici parziali, entrambi filtrati su `is_active`

Un unico `uniqueIndex(locale, parentId, slug)` **non funziona**, per due motivi distinti:

1. In PostgreSQL, dentro un indice univoco `NULL` non è uguale a `NULL`. Con `parentId`
   nullable, due pagine **root** con lo stesso `locale` e lo stesso `slug` verrebbero
   inserite entrambe senza errore. L'indice proteggerebbe solo le pagine figlie, cioè non
   il caso più frequente: la home e le pagine di primo livello.
2. Il soft delete è obbligatorio: senza un predicato su `is_active`, una pagina eliminata
   occuperebbe il proprio slug per sempre. Eliminata `/chi-siamo`, non se ne potrebbe più
   creare una con lo stesso percorso.

I due indici parziali chiudono entrambi i difetti con lo stesso strumento, senza imporre
PostgreSQL ≥ 15 come requisito di prodotto (che `nullsNotDistinct()` richiederebbe e che
oggi non è scritto da nessuna parte). `.where()` è supportato dalla versione di Drizzle in
uso.

**Conseguenza approvata dall'umano il 2026-08-17**: il **soft delete libera lo slug**.
Ripristinare una pagina eliminata il cui slug è stato nel frattempo riassegnato fallisce
con `409`. È il comportamento voluto: fallire rumorosamente è preferibile a due pagine che
rivendicano la stessa URL pubblica.

**Impatto sulla risoluzione pubblica (F03)**: la risoluzione avviene per
`(locale, percorso)`. Senza il fix, la stessa coppia può corrispondere a due righe, la
query restituisce un vincitore arbitrario e la chiave di cache diventa ambigua. Con il
fix, la risoluzione è deterministica per costruzione. Costa niente adesso; dopo che esiste
contenuto costa una migrazione con deduplica manuale.

### Perché `page_revisions` è append-only

Le business rules impongono che le Revisioni non si modifichino e non si cancellino. Una
tabella che dichiara `updatedAt`, `updatedBy` e `isActive` afferma il contrario nello
schema: chi legge fra sei mesi conclude che aggiornare o "eliminare" una revisione è
previsto, e `isActive` è precisamente lo scivolo verso la cancellazione logica che la
regola vieta.

`page_revisions` porta quindi la struttura ridotta prevista da `CLAUDE.md` § Database per
le tabelle append-only: `id`, `guid`, `createdAt`, `createdBy`. Nessun `version`: non c'è
concorrenza su righe che non vengono mai aggiornate. È la stessa forma già in uso da
`audit_log`, l'altra tabella append-only del progetto.

> ⚠️ La **potatura** delle revisioni eccedenti (`business-rules.md` § Revisioni, regola 5)
> resta **fuori da F01** e non va implementata: contraddice la regola 2 della stessa
> sezione e il divieto di `DELETE` fisico. Va sciolta in ADR prima che esista una politica
> di retention, non prima che esista F01.

`relations(...)` vanno definite dopo le tabelle, come da convenzione: `pages` →
`parent`/`children`, `revisions`, `publishedRevision`, `author`.

**Nota sul ciclo di FK**: `pages.publishedRevisionId` → `page_revisions.id` e
`page_revisions.pageId` → `pages.id` formano una dipendenza circolare. Va gestita
inserendo prima la Revisione e aggiornando poi `publishedRevisionId` nella stessa
transazione; `publishedRevisionId` resta nullable per questo motivo.

### Forma del contenuto (`draftContent` / `content`)

```jsonc
{
  "version": 1,
  "blocks": [
    {
      "id": "b1a2c3d4",
      "type": "richText",
      "props": { "html": "<p>Testo sanitizzato lato server</p>" },
      "children": []
    }
  ]
}
```

In F01 la validazione si ferma alla forma esterna (`version` numerico, `blocks` array,
ogni nodo con `id`/`type`/`props`/`children`). La validazione per `type` arriva con F02.

## Sanitizzazione — dentro F01, non dopo

**Il punto in una riga**: F01 valida solo la forma esterna dell'albero, quindi accetta
qualsiasi `type` con qualsiasi `props` — incluso un `props.html` contenente `<script>`.
Senza sanitizzatore, la prima feature del CMS viola il divieto assoluto "HTML non
sanitizzato persistito" e apre una **XSS stored** che finirebbe nelle Revisioni
**immutabili** già scritte quando arriverà F02. A quel punto non è più risanabile senza
riscrivere righe che per definizione non si riscrivono.

Regola per F01:

1. **Ogni prop di tipo stringa** dell'albero, a qualunque profondità e sotto qualunque
   `type`, viene sanitizzata **prima della persistenza** contro una allowlist di tag e
   attributi. Non si sanitizza "il blocco `richText`": F01 non sa quali blocchi esistono,
   quindi tratta come potenzialmente ostile **ogni** stringa.
2. La sanitizzazione è **server-side e pre-persistenza**. Quella lato client è cosmetica
   e non conta come difesa.
3. L'allowlist di F01 è **volutamente minima e restrittiva** (formattazione inline e
   struttura di paragrafo di base): nessun `<script>`, nessun `<iframe>`, nessun handler
   `on*`, nessuna URL `javascript:`. L'allowlist **per tipo di blocco** è un contratto di
   dominio e appartiene al registro dei blocchi di F02: F01 non la anticipa, applica un
   minimo comune denominatore più stretto.
4. Si sanitizza **sia** `draftContent` (a ogni `PATCH`) **sia** lo snapshot che entra in
   `page_revisions` alla pubblicazione. La seconda non è ridondante: è l'unica che
   protegge una riga che non potrà più essere corretta.
5. Chiavi e struttura dell'albero non vengono alterate: la sanitizzazione tocca i
   **valori** stringa, non la forma. Un albero sanitizzato resta lo stesso albero.
6. La sanitizzazione **non è silenziosa a metà**: o il valore è sanitizzabile e viene
   persistito ripulito, o l'intera richiesta è respinta. Non si salva mai un albero
   parzialmente trattato, coerentemente con la regola "mai un albero parzialmente valido".

> **La libreria non viene installata da questa spec.** Serve una nuova dipendenza npm e
> `CLAUDE.md` § Ask first la subordina ad approvazione umana: va **proposta** con
> motivazione e alternative valutate, mai aggiunta d'iniziativa. Vedi il task dedicato nel
> plan di F01.

## Endpoint (`@Controller('app/pages')`)

| Metodo | Path | Ruolo minimo | Descrizione |
|---|---|---|---|
| `GET` | `/api/v1/app/pages` | User | Elenco paginato (`?p&i&q&o&d`), filtri `status`, `locale`. User vede solo le proprie bozze |
| `POST` | `/api/v1/app/pages` | User | Crea una Pagina in `draft` |
| `GET` | `/api/v1/app/pages/:guid` | User | Dettaglio con bozza corrente |
| `PATCH` | `/api/v1/app/pages/:guid` | User (proprie) / Manager (tutte) | Aggiorna la bozza. Richiede `version` nel body → `409` se non combacia |
| `DELETE` | `/api/v1/app/pages/:guid` | Admin | Soft delete |
| `POST` | `/api/v1/app/pages/:guid/status` | Manager (User solo per `review`) | Transizione di stato: `{ status, scheduledAt? }` |
| `GET` | `/api/v1/app/pages/:guid/revisions` | User | Elenco paginato delle Revisioni |
| `GET` | `/api/v1/app/pages/:guid/revisions/:revisionGuid` | User | Dettaglio di una Revisione |
| `POST` | `/api/v1/app/pages/:guid/revisions/:revisionGuid/restore` | Manager | Crea una nuova bozza dallo snapshot |

Codici di errore attesi: `400` transizione non ammessa / ciclo di gerarchia / slug
riservato / albero malformato · `401` non autenticato · `403` ruolo insufficiente **o
riga altrui** · `404` guid inesistente o soft-deleted · `409` slug duplicato o `version`
obsoleta.

### `403` sulla superficie amministrativa — confermato, non è una contraddizione

Su `api/v1/app/*` una riga esistente e attiva che il chiamante non può toccare risponde
**`403`**, non `404`. La regola "404, mai 403" delle business rules vale sulla superficie
**pubblica anonima**, dove il `404` serve a non rivelare l'esistenza di contenuto non
pubblicato. Su una superficie autenticata il chiamante è già dentro il perimetro
editoriale: il `403` è corretto e più diagnostico, e distingue "non esiste" da "non è
tua". Il `404` amministrativo resta riservato a guid inesistente o riga soft-deleted.
Dettaglio e casistica completa in `ADR-18-ownership-per-riga.md` § D7.

I due `409` portano `code` distinti e non intercambiabili — `PAGE_VERSION_CONFLICT`
(conflitto di editing) e `PAGE_SLUG_DUPLICATE` (slug già in uso) — perché il frontend deve
mostrare due messaggi diversi.

## Logica di servizio — punti non negoziabili

1. **Macchina a stati esplicita**: la mappa delle transizioni ammesse è una costante del
   servizio, non una catena di `if`. Ogni transizione non presente viene respinta.
2. **Pubblicazione transazionale**: creazione della Revisione, aggiornamento di
   `publishedRevisionId`/`publishedAt`/`status` e scrittura in audit log avvengono nella
   stessa transazione. Un fallimento parziale non deve lasciare una Pagina pubblicata
   senza Revisione.
3. **`PATCH` con `version`**: il `WHERE` dell'update include `version = :version` e
   incrementa `version`; zero righe aggiornate ⇒ `409`.
4. **Slug**: normalizzazione (minuscolo, translitterazione degli accenti, separatore `-`),
   controllo dei riservati, unicità delegata al constraint DB e mappata a `409` — mai una
   `SELECT` preventiva usata come garanzia (race condition).
5. **Gerarchia**: prima di assegnare `parentId`, risalire la catena degli antenati e
   respingere se si incontra la Pagina stessa.
6. **Audit log**: `publish`, `unpublish`, `archive`, `restore-revision`, `delete`.
7. **Nessun HTML renderizzato lato server** (Principle 7).
8. **Ownership per riga** (ADR-18): dopo il caricamento della riga e prima di ogni
   scrittura, `assertRowOwnership(authInfo, row, AppUserRoles.Manager, …)`. Negli elenchi
   paginati il predicato di ownership entra nella `WHERE` — della query dei dati **e** di
   quella del conteggio — non in un filtro applicato dopo la paginazione.
9. **Sanitizzazione dell'albero** prima di ogni persistenza di `draftContent` e prima
   dell'inserimento dello snapshot in `page_revisions` (vedi § Sanitizzazione).
10. **Mappatura degli errori Postgres → HTTP.** Oggi **non esiste nel repository**:
    nessun `ConflictException`, nessuna gestione del codice PG `23505`, e
    `AllExceptionsFilter` traduce un errore Postgres grezzo in `500 UNKNOWN_ERROR`. Senza
    questo mapper uno slug duplicato risponderebbe `500`, non `409`. Va costruito dentro
    F01, leggendo `err.constraint` (**non** il testo del messaggio):

    | Constraint | Risposta |
    |---|---|
    | `pages_slug_locale_root_uq` · `pages_slug_locale_child_uq` | `409` `PAGE_SLUG_DUPLICATE` |
    | `page_revisions_page_number_uq` | `409` `REVISION_NUMBER_CONFLICT` |
    | `pages_guid_idx` · `page_revisions_guid_idx` | `500` — collisione di guid: è un bug interno, non un errore dell'utente |

    I nomi degli indici vivono in una costante del mapper e sono coperti da test: se
    qualcuno rinomina un indice, il test rompe invece di degradare in silenzio a `500`.

## Frontend

```
src/pages/pages/PagePages.tsx          ← elenco con filtri stato/lingua
src/pages/pages/PagePageDetail.tsx     ← dettaglio: metadati, stato, cronologia revisioni
src/services/pages.service.ts
src/types/pages.types.ts
```

- Elenco con `usePaginatedList` (hook esistente) e `useColumnVisibility`
- Azioni di stato dietro conferma esplicita per quelle irreversibili nell'immediato
  (archiviazione, soft delete)
- Ogni chiamata in `try/catch` con `notifications.show` in caso di errore
- Il `409` da conflitto mostra un messaggio dedicato ("La pagina è stata modificata da
  un altro utente"), distinto dal `409` da slug duplicato

## Test richiesti

**Unit** (`test/unit/pages/pages.service.spec.ts`): macchina a stati (ammesse e vietate),
normalizzazione slug, rilevamento cicli di gerarchia, incremento `version`,
**sanitizzazione dell'albero** (payload XSS noto → valore neutralizzato, struttura
dell'albero invariata).

**Integration** (`test/e2e/pages.e2e-spec.ts`): CRUD completo, `409` su slug duplicato,
`409` su salvataggio concorrente, `403` per User che tenta di pubblicare, `403` per User
sulla bozza altrui, `404` su Pagina soft-deleted, immutabilità delle Revisioni.

Casi di regressione **obbligatori**, ciascuno legato a un difetto specifico corretto in
questa revisione:

| Caso | Difetto che copre |
|---|---|
| Due pagine **root**, stesso `locale` e stesso `slug` → la seconda dà `409` | Indice univoco inefficace su `parentId` nullable |
| Pagina soft-deleted → lo stesso slug torna creabile senza errore | Slug bloccato per sempre dal soft delete |
| `<script>alert(1)</script>` in una `props` stringa → **a database** il valore è neutralizzato | XSS stored nelle revisioni immutabili |
| Elenco paginato: il **totale** restituito a un `User` conta solo le proprie righe, con almeno una pagina altrui presente | Filtro di ownership applicato dopo la paginazione (ADR-18 D6) |
| `User` su `PATCH` di **propria** pagina in stato `review` → `403` | "Propria **bozza**" letto come "propria" |

**Contract** (`bruno/pages/`): un `.yml` per ogni endpoint della tabella sopra, con
header `Authorization: Bearer {{token}}`.

## Rischi aperti (da risolvere prima dell'approvazione)

| # | Rischio | Proposta |
|---|---|---|
| R1 | Lo schema dei blocchi non è ancora deciso: `content` resta un `jsonb` poco vincolato per `type` e `props` | Accettabile in F01 **perché la sanitizzazione entra qui** (§ Sanitizzazione): resta scoperta la validazione semantica per tipo di blocco, non la sicurezza. Se F02 slitta si accumula contenuto non validato da migrare, ma non contenuto pericoloso |
| R2 | Snapshot completo per revisione (S1): crescita dello spazio con contenuti grandi | Accettata per F01 (sito nuovo, poche revisioni). La potatura **non si implementa qui**: la regola 5 delle business rules contraddice la regola 2 e il divieto di `DELETE` fisico, e va sciolta in ADR prima che esista contenuto in volume |
| R3 | Dipendenza circolare di FK `pages` ↔ `page_revisions` | Gestita in transazione, `publishedRevisionId` nullable. Da verificare con `drizzle-kit generate` prima di considerare chiusa la questione |
| R4 | `scheduled` senza un job che pubblichi: lo stato esisterebbe senza effetto | Dichiarato out of scope in F01; da coprire in F03 insieme all'invalidazione di cache. Da segnalare in UI come "programmazione non ancora attiva" |
| R5 | La libreria di sanitizzazione non è ancora approvata | La sanitizzazione è un requisito di F01, la **dipendenza** no: va proposta con alternative e attende firma. Se la proposta venisse respinta senza alternativa, F01 non può persistere contenuto — è un blocco, non un rinvio |

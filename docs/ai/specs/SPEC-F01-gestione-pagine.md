# Spec — F01 Gestione Pagine

## Status

[x] Bozza — **in attesa di approvazione umana** · [ ] Approvata · [ ] Superseded

> Generata dall'Orchestrator il 2026-08-13. Nessuna implementazione può iniziare
> prima dell'approvazione (Constitution, Principle 4). In particolare, le modifiche
> a `app/backend/src/db/schema.ts` richiedono approvazione esplicita separata
> (CLAUDE.md → "Ask first").

## Feature di riferimento

`docs/ai/features/F01-gestione-pagine.md`

## ADR applicabili

- `ADR-2-security-baseline.md` — auth, RBAC, redazione log
- `ADR-8-storage-abstraction-files.md` — pattern `entity`/`entityId` non-FK, riusato qui
- `ADR-12-notifiche-persistenti-realtime.md` — `AppGateway.emitToUser` per la presenza in editor

**ADR mancanti che questa spec presuppone** (da produrre prima o insieme
all'implementazione, vedi "Rischi aperti"):
- Formato e versionamento dello schema dei blocchi (necessaria per F02, questa spec ne
  dipende solo per il campo `content`)
- Strategia di versionamento/revisioni (snapshot completo vs. diff)

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

**Assunzioni esplicite di questa spec** (oltre a quelle globali A1–A6 in
`docs/business-rules.md`):

| # | Assunzione | Impatto se sbagliata |
|---|---|---|
| S1 | La Revisione è uno **snapshot completo** del contenuto, non un diff incrementale | Con contenuti molto grandi e molte revisioni cresce lo spazio occupato; il diff sarebbe più compatto ma molto più complesso da ripristinare |
| S2 | La **bozza di lavoro** vive sulla riga `pages` (colonne `draftContent`/`draftSeo`), non su una tabella separata | Una tabella separata reggerebbe meglio più bozze parallele per la stessa Pagina, che qui non sono previste |
| S3 | Il controllo ottimistico usa un contatore `version` sulla riga `pages`, non un hash del contenuto | Equivalente in pratica; il contatore è più economico da confrontare |
| S4 | Il campo `translationGroupId` è un `char(16)` opaco generato alla creazione, non una FK a una tabella `translation_groups` | Una tabella dedicata servirebbe solo se il gruppo dovesse portare metadati propri |

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
    guid: char('guid', { length: 16 }).notNull().unique(),

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
    uniqueIndex('pages_slug_locale_parent_uq').on(t.locale, t.parentId, t.slug),
    index('pages_status_locale_idx').on(t.status, t.locale),
    index('pages_translation_group_idx').on(t.translationGroupId),
  ],
);

export const pageRevisionEntity = pgTable(
  'page_revisions',
  {
    id: serial('id').primaryKey(),
    guid: char('guid', { length: 16 }).notNull().unique(),

    pageId: integer('page_id').notNull(),        // FK → pages.id, restrict
    revisionNumber: integer('revision_number').notNull(),

    // Snapshot immutabile (S1)
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').notNull(),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: integer('created_by').notNull(),   // FK → users.id, restrict
    updatedBy: integer('updated_by').notNull(),   // FK → users.id, restrict
  },
  (t) => [uniqueIndex('page_revisions_page_number_uq').on(t.pageId, t.revisionNumber)],
);
```

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
riservato · `401` non autenticato · `403` ruolo insufficiente · `404` guid inesistente o
soft-deleted · `409` slug duplicato o `version` obsoleta.

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
normalizzazione slug, rilevamento cicli di gerarchia, incremento `version`.

**Integration** (`test/e2e/pages.e2e-spec.ts`): CRUD completo, `409` su slug duplicato,
`409` su salvataggio concorrente, `403` per User che tenta di pubblicare, `403` per User
sulla bozza altrui, `404` su Pagina soft-deleted, immutabilità delle Revisioni.

**Contract** (`bruno/pages/`): un `.yml` per ogni endpoint della tabella sopra, con
header `Authorization: Bearer {{token}}`.

## Rischi aperti (da risolvere prima dell'approvazione)

| # | Rischio | Proposta |
|---|---|---|
| R1 | Lo schema dei blocchi non è ancora deciso: `content` resta un `jsonb` poco vincolato | Accettabile in F01 se F02 arriva subito dopo. Se F02 slitta, si accumula contenuto non validato da migrare |
| R2 | Snapshot completo per revisione (S1): crescita dello spazio con contenuti grandi | Politica di potatura configurabile, che non tocca mai l'ultima Revisione pubblicata |
| R3 | Dipendenza circolare di FK `pages` ↔ `page_revisions` | Gestita in transazione, `publishedRevisionId` nullable. Da verificare con `drizzle-kit generate` prima di considerare chiusa la questione |
| R4 | `scheduled` senza un job che pubblichi: lo stato esisterebbe senza effetto | Dichiarato out of scope in F01; da coprire in F03 insieme all'invalidazione di cache. Da segnalare in UI come "programmazione non ancora attiva" oppure da anticipare qui |

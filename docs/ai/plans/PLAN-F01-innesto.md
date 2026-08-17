# Plan — F01 Innesto sulla base tecnica esistente

## Spec di riferimento

`docs/ai/specs/SPEC-F01-gestione-pagine.md` (bozza, non approvata) ·
`docs/ai/features/F01-gestione-pagine.md`

> Prodotto dall'Orchestrator il 2026-08-17 su richiesta esplicita. Nessuna
> dipendenza installata, nessuna modifica a `schema.ts`.
>
> **Metodo**: Fase A è stata svolta leggendo il codice, non le docs. Dove il
> codice contraddice la documentazione, il codice vale come stato attuale e la
> divergenza è segnalata senza allinearla.
>
> **Revisione del 2026-08-17 (seconda passata)**, su decisioni confermate
> dall'umano. Cambiato rispetto alla prima stesura:
>
> - **Il sanitizzatore entra in F01**, non in F02 (nuovo T3; Fase A.6 e la
>   matrice dei rischi riscritte di conseguenza). Era l'errore più grave della
>   prima stesura: rimandarlo significava aprire una XSS stored destinata a
>   finire in Revisioni immutabili.
> - **A2, A3, A4, A5 confermate**; A6 resta aperta e non blocca. Il vecchio T1
>   (ADR ownership) è **prodotto**: `ADR-18-ownership-per-riga.md`, in attesa
>   di firma. La sezione "Blocchi" è ridotta di conseguenza.
> - **La regola sulle colonne obbligatorie è stata riscritta**, non eccettuata
>   (`CLAUDE.md` § Database): entità mutabili → struttura completa, tabelle
>   append-only → `id`/`guid`/`createdAt`/`createdBy`. Le due deroghe che la
>   prima stesura chiedeva caso per caso non servono più.
> - **La contraddizione D5 della Documentation Policy è risolta** in `CLAUDE.md`.
> - **Vincolo di isolamento dei componenti dei blocchi** aggiunto in Fase B.3.

---

## FASE A — Verifica del codice esistente

### Tabella di sintesi

| # | Voce | Stato reale | Gap rispetto a F01 | Costo |
|---|---|---|---|---|
| 1 | `version` su tabelle esistenti | **Nessuna** delle 5 tabelle lo ha ([schema.ts:30-218](../../../app/backend/src/db/schema.ts#L30-L218)) | `pages` nasce nuova con `version`: nessun retrofit necessario, e la regola riscritta in `CLAUDE.md` non lo impone alle 5 esistenti | **Nullo** per F01 — deciso il 2026-08-17: **non si retrofitta** |
| 2 | Guard RBAC | Factory `requireRole()` a sole soglie di ruolo ([guard.ts:18-41](../../../app/backend/src/auth/guard.ts#L18-L41)) | L'ownership per riga **non** va nei guard: serve un check nel service, con precedente già in casa ([files.service.ts:109](../../../app/backend/src/files/files.service.ts#L109)) | **Basso** — 1 helper + predicati di query |
| 3 | `AuthMiddleware` esclusioni | 6 path `auth/*` + `health` in `.exclude()` ([app.module.ts:117-134](../../../app/backend/src/app.module.ts#L117-L134)), `/metrics` bypassato nel middleware ([auth.middleware.ts:43-46](../../../app/backend/src/auth/auth.middleware.ts#L43-L46)) | `public/*` = **una riga**. Ma la superficie pubblica ha due buchi collaterali (throttler, CORS) | **Una riga** per l'esclusione, F03 per il resto |
| 4 | Redis / BullMQ | **Cablati e funzionanti**: 2 code reali, repeatable job, health indicator ([app.module.ts:85-87](../../../app/backend/src/app.module.ts#L85-L87), [files-cleanup.scheduler.ts:27-50](../../../app/backend/src/queues/files-cleanup-queue/files-cleanup.scheduler.ts#L27-L50)) | Pattern di **cache assente**: `RedisService` non ha `scan`/`keys`/tagging ([redis.service.ts:41-99](../../../app/backend/src/redis/redis.service.ts#L41-L99)) | **Nullo per F01** (niente da cachare), medio in F03 |
| 5 | `FilesModule` | Storage generico: blob + metadata tecnici, driver local/S3, soft delete, cleanup orfani | Distanza da media library editoriale: **grande** (alt/didascalia, varianti, MIME reale, lista, URL pubblica, conteggio riferimenti) | **Alto**, tutto in F09 — zero in F01 |
| 6 | Sanitizzatore HTML server-side | **Assente**. Nessuna dipendenza (`sanitize-html`/`dompurify`/`xss`) in `app/backend/package.json`; l'unico `sanitize*` in codice è la redazione dei log | Serve **dentro F01**, alla prima riga di contenuto persistita — non a F02 | **Approvazione umana** (nuova dipendenza da proporre, non installare) + T3 |
| 7 | Workspaces root | `"workspaces": ["app/*"]` ([package.json:5-7](../../../package.json#L5-L7)) | Un terzo workspace è raccolto da `npm ci` ma **non** da Docker e CI, che enumerano i workspace a mano | **Medio**: 2 Dockerfile (5 punti), 1 job CI, script `clean` |
| 8 | Riuso frontend | `usePaginatedList`, `useColumnVisibility`, store Zustand, interceptor Axios, componenti lista: **riusabili** | `ErrorBoundary` non parametrizzabile, nessun ramo `409` nell'interceptor, nessuno store di documento, nessuna lib DnD | **Basso** per F01, medio per F04 |

### 1. `version` e struttura obbligatoria delle colonne

Nessuna delle cinque tabelle esistenti (`users` [schema.ts:30](../../../app/backend/src/db/schema.ts#L30), `audit_log` [:68](../../../app/backend/src/db/schema.ts#L68), `app_settings` [:102](../../../app/backend/src/db/schema.ts#L102), `files` [:136](../../../app/backend/src/db/schema.ts#L136), `notifications` [:184](../../../app/backend/src/db/schema.ts#L184)) dichiara una colonna `version`. Il lock ottimistico descritto in `CLAUDE.md` come parte della struttura obbligatoria **non esiste oggi in nessuna riga del database**. Migrazioni presenti: 4 (`0000`→`0003`).

Altre divergenze fra la struttura dichiarata obbligatoria e il codice reale:

- `createdAt`/`updatedAt` sono **nullable** ovunque (`.defaultNow()` senza `.notNull()`), mentre SPEC-F01 propone `.notNull().defaultNow()` — la nuova tabella sarebbe più stretta delle esistenti.
- `audit_log` non ha `isActive`, `updatedAt`, `updatedBy`, e le sue FK usano `onDelete:'set null'` ([schema.ts:75-82](../../../app/backend/src/db/schema.ts#L75-L82)), non `restrict` come prescritto "sempre".

**Quante migrazioni servono**: tecnicamente **una sola** — `drizzle-kit generate` emette un unico file per l'intero diff dello schema, quindi `ALTER TABLE ... ADD COLUMN version integer NOT NULL DEFAULT 1` su cinque tabelle sta in una migrazione.

**Decisione del 2026-08-17: non si fa.** Una colonna `version` che nessun `UPDATE` incrementa e nessun `WHERE` confronta è decorazione: il lock ottimistico è un contratto fra colonna e query, non una colonna. Retrofittarlo davvero significa toccare i path di update di cinque moduli fuori dallo scope di F01. F01 introduce `version` solo dove serve, su `pages`, sulla riga nuova.

**La regola è stata riscritta, non eccettuata.** La prima stesura di questo piano chiedeva due deroghe distinte alla "struttura obbligatoria" di `CLAUDE.md` — una per `page_revisions`, una per le cinque tabelle esistenti. Due eccezioni nello stesso piano sono il sintomo di una regola formulata male, non di due casi speciali. La regola in `CLAUDE.md` § Database ora distingue:

- **entità mutabili** → struttura completa, `version` incluso;
- **tabelle append-only** → solo `id`, `guid`, `createdAt`, `createdBy`.

Con questa formulazione `page_revisions` è conforme per costruzione e `audit_log` — l'altra tabella append-only, che già oggi non ha `isActive`/`updatedAt`/`updatedBy` ([schema.ts:68-94](../../../app/backend/src/db/schema.ts#L68-L94)) — smette di essere una violazione silenziosa. Restano fuori norma le quattro tabelle **mutabili** esistenti (`users`, `app_settings`, `files`, `notifications`), che non hanno `version`: divergenza **dichiarata e non sanata**, il cui allineamento resta un task separato fuori da F01.

### 2. Guard RBAC e ownership per riga

`GuardSuperAdmin`, `GuardAdmin`, `GuardManager` non sono tre classi: sono tre istanze della stessa factory `requireRole(minRole)` ([guard.ts:18-41](../../../app/backend/src/auth/guard.ts#L18-L41)). Il guard legge `req['authInfo']`, confronta `authInfo.role > minRole` e lancia `ForbiddenException`. Non tocca `params`, non usa `Reflector`, non ha accesso al database.

**L'ownership per riga non è aggiungibile ai guard, e non deve esserlo.** Un `CanActivate` gira prima dell'handler: per sapere se la bozza è "propria" servono `createdBy` e `status` della riga, cioè una `SELECT` che il guard dovrebbe fare da solo e che il service rifarebbe subito dopo. Sarebbe una doppia lettura e una seconda fonte di verità.

**Non serve un meccanismo nuovo**: il pattern esiste già in produzione. [`FilesService.softDelete`](../../../app/backend/src/files/files.service.ts#L106-L128) carica la riga e poi applica `authInfo.role > AppUserRoles.Admin && row.createdBy !== authInfo.userId` → `ForbiddenException` (riga 109). F01 replica esattamente questa forma, con la soglia spostata a `Manager`.

Restano due cose da costruire, entrambe piccole:

1. Un helper condiviso (`assertCanEditRow` o equivalente) perché la regola non venga riscritta a mano in ogni service — oggi la logica è inline in un solo posto e non è riusabile.
2. Il **filtro di lista**: `GET /app/pages` per un `User` deve restituire solo le proprie bozze. Nessun guard può farlo — è un predicato nella `WHERE`, non un'autorizzazione booleana. `Utils.applyScopeFilter` ([utils.ts:55-61](../../../app/backend/src/common/utils.ts#L55-L61)) non aiuta: filtra per `scopeId`, non per autore.

### 3. `AuthMiddleware` e `api/v1/public/*`

La lista di esclusione è enumerativa e vive in `AppModule.configure()` ([app.module.ts:117-134](../../../app/backend/src/app.module.ts#L117-L134)): sei path `auth/*` espliciti più `health`, poi `.forRoutes({ path: '*path', method: RequestMethod.ALL })`. `/metrics` è l'eccezione: è escluso **dentro** il middleware ([auth.middleware.ts:43-46](../../../app/backend/src/auth/auth.middleware.ts#L43-L46)) perché essendo montato fuori dal prefisso globale l'`.exclude()` si confronterebbe con `api/v1/metrics`, path mai servito — motivo documentato alle righe 34-42 e 122-126.

**Aggiungere il pubblico è una riga**, non un refactor:

```ts
{ path: 'public/*path', method: RequestMethod.ALL },
```

I path in `.exclude()` sono relativi al prefisso globale (`auth/login` intercetta `api/v1/auth/login`), quindi `public/*path` copre `api/v1/public/*`. La sintassi con wildcard nominato è quella già in uso alla riga 134 (path-to-regexp v8, NestJS 11).

**Due buchi collaterali da non scoprire in F03 all'ultimo momento** (nessuno dei due è F01):

- **Rate limit assente sul pubblico.** `ThrottlerGuard` non è registrato come `APP_GUARD`: è applicato con `@UseGuards` sul solo `AuthController` ([auth.controller.ts:38](../../../app/backend/src/auth/auth.controller.ts#L38)). Una rotta `public/` esclusa dal JWT nascerebbe **senza alcun limite**, mentre le business rules ne pretendono uno proprio. Serve un secondo throttler nominato e un guard esplicito sul controller pubblico.
- **CORS chiuso sul frontend admin.** `app.enableCors({ origin: AppConstants.frontendUrl })` ([main.ts:26-29](../../../app/backend/src/main.ts#L26-L29)): un consumer pubblico su un'altra origine viene bloccato. Da riprendere insieme all'ADR sul consumer HTML.

### 4. Redis e BullMQ

**Cablati e funzionanti, non dichiarati.**

- Redis: client unico `ioredis` in un modulo `@Global` ([redis.module.ts](../../../app/backend/src/redis/redis.module.ts)), usato come unico session store (allowlist `login:*`, `rtk:*`, `mfa_tmp:*`, `session:*`, `user-sessions:*`) e interrogato a ogni richiesta autenticata ([auth.middleware.ts:65](../../../app/backend/src/auth/auth.middleware.ts#L65)).
- BullMQ: `BullModule.forRoot` con connessione condivisa ([app.module.ts:85-87](../../../app/backend/src/app.module.ts#L85-L87)); due code reali — `email-queue` con processor, retry e backoff esponenziale ([email.queue.service.ts:36-42](../../../app/backend/src/queues/email-queue/email.queue.service.ts#L36-L42)) e `files-cleanup-queue` con **repeatable job** idempotente allineato al pattern cron ([files-cleanup.scheduler.ts:27-50](../../../app/backend/src/queues/files-cleanup-queue/files-cleanup.scheduler.ts#L27-L50)); più un health indicator dedicato con test.

Il pattern richiesto dalle business rules per la pubblicazione differita (repeatable job persistente, mai `@Cron`) **esiste già ed è copiabile riga per riga** da `FilesCleanupScheduler`.

**Un pattern di cache riusabile non esiste e va costruito da zero.** `RedisService` espone `set/get/getJson/del/exists/sadd/smembers/srem/expire/ping` ([redis.service.ts:41-99](../../../app/backend/src/redis/redis.service.ts#L41-L99)). Manca tutto ciò che serve all'invalidazione per evento:

- nessun `scan`/`keys` → impossibile invalidare per prefisso;
- nessuna convenzione di namespace delle chiavi;
- nessun `CacheService`, nessun `@nestjs/cache-manager`, nessun interceptor di cache.

La strada meno costosa non è aggiungere `scan` (O(N) sul keyspace) ma un **tag-set per entità** costruito sulle primitive già presenti: `sadd('cache-tags:page:<guid>', key)` in scrittura, `smembers` + `del` in invalidazione. Va deciso nell'ADR di caching (TODO 1.3), **non in F01**: F01 non espone nulla di pubblico, quindi non ha niente da invalidare. Costruire la cache adesso sarebbe over-engineering su un requisito non ancora attivo.

### 5. `FilesModule` — cosa gestisce davvero

Oggi gestisce: riga di metadata (`originalName`, `mimeType`, `sizeBytes`, `storageDriver`, `storageKey`, `checksumSha256`, `entity`/`entityId`, soft delete — [schema.ts:136-173](../../../app/backend/src/db/schema.ts#L136-L173)); astrazione driver a tre metodi `upload/download/delete` con implementazioni local e S3 ([storage-driver.interface.ts:7-14](../../../app/backend/src/files/storage/storage-driver.interface.ts#L7-L14)); limite di dimensione via Multer ([files.controller.ts:41-44](../../../app/backend/src/files/files.controller.ts#L41-L44)); tre endpoint (`POST`, `GET :guid`, `DELETE :guid`); pulizia asincrona dei blob orfani.

Distanza da una media library editoriale — **sei gap, nessuno banale**:

| Requisito (business rules § Media) | Stato reale |
|---|---|
| MIME verificato dal contenuto reale | **Non soddisfatto**: si persiste `file.mimetype`, cioè il valore dichiarato dal client ([files.service.ts:60](../../../app/backend/src/files/files.service.ts#L60)). Nessuna lettura dei magic number, nessuna allowlist, nessun trattamento speciale dell'SVG. Serve una nuova dipendenza → approvazione |
| Alt text, didascalia, crediti | Colonne inesistenti → modifica di schema |
| Varianti dimensionali asincrone | Nessuna pipeline immagini (nessun `sharp` nelle dipendenze), nessuna colonna `width`/`height`, nessuna entità variante. La coda per eseguirle però c'è già |
| Media referenziato non eliminabile | `entity`/`entityId` è una coppia singola non-FK: modella "un file → una entità". Un media usato da N pagine **non è esprimibile**. Serve un modello di riferimenti |
| Selezione da editor | **Nessun endpoint di lista o ricerca**: esistono solo upload, download per guid e delete. Un media picker oggi non è implementabile |
| URL pubblica per un `<img>` in pagina | `GET app/files/:guid` sta dietro il JWT globale e risponde `Content-Disposition: attachment` ([files.controller.ts:71-74](../../../app/backend/src/files/files.controller.ts#L71-L74)). Nessuna rotta pubblica, nessun header di cache |

Il livello di **storage** è riusabile così com'è — è esattamente la promessa di ADR-8, mantenuta. Il livello **editoriale** è interamente da costruire in F09. Nulla di questo tocca F01.

### 6. Sanitizzatore HTML server-side

**Non esiste.** `app/backend/package.json` non contiene `sanitize-html`, `dompurify`, `isomorphic-dompurify`, `xss` né equivalenti. L'unica occorrenza di `sanitize*` nel codice è `sanitizeLogData` ([winston-logger.service.ts:25](../../../app/backend/src/common/logging/winston-logger.service.ts#L25)), che redige password e token nei log: non ha nulla a che vedere con l'HTML.

Va quindi **proposto** (con motivazione e alternative valutate) e installato solo dopo firma: `CLAUDE.md` § Ask first subordina ogni dipendenza npm all'approvazione umana.

**Correzione rispetto alla prima stesura di questo piano.** Avevo concluso che "F01 non ne ha bisogno", perché la spec ferma la validazione alla forma esterna dell'albero e non interpreta le `props`. Il ragionamento è esatto e la conclusione è sbagliata, per un motivo che rende il rinvio inaccettabile:

1. Fermarsi alla forma esterna significa che F01 accetta **qualsiasi** `type` con **qualsiasi** `props`. Un `PATCH` con `props.html = "<script>…</script>"` supera la validazione di F01 e viene persistito.
2. `CLAUDE.md` § Divieti assoluti vieta di persistere HTML non sanitizzato. Non è una raccomandazione condizionata all'esistenza di F02: è la prima feature del CMS che lo violerebbe.
3. Il contenuto malevolo non resterebbe in una bozza correggibile. Alla pubblicazione entra in `page_revisions`, che è **immutabile per contratto**. Quando F02 arriverà, quelle righe non saranno risanabili senza riscrivere righe che per definizione non si riscrivono.

Il punto 3 è quello decisivo: il rinvio non produce un debito, produce un danno permanente.

**Cosa entra davvero in F01** (nuovo T3): la sanitizzazione di **ogni prop di tipo stringa** dell'albero, a qualunque profondità e sotto qualunque `type`, prima della persistenza. Non "il blocco `richText`" — F01 non sa quali blocchi esistono, quindi tratta ogni stringa come potenzialmente ostile e applica una allowlist minima e restrittiva.

**Cosa resta a F02**: l'allowlist **per tipo di blocco**, che è un contratto di dominio e appartiene al registro dei blocchi. F01 non la anticipa e non prova a indovinarla: applica un minimo comune denominatore più stretto di qualunque allowlist futura. Nessuna scrittura anticipata, nessuna decisione rubata a F02.

### 7. Workspaces e un eventuale `app/blocks`

`"workspaces": ["app/*"]` ([package.json:5-7](../../../package.json#L5-L7)): il glob raccoglie automaticamente una terza cartella, quindi `npm ci` e `npm install` funzionano senza modifiche. **Tutto il resto no**, perché Docker e CI enumerano i workspace a mano.

Cosa va toccato, in concreto:

| File | Modifica necessaria |
|---|---|
| `app/backend/Dockerfile` | `COPY app/blocks/package.json` negli stage **`deps` e `prod-deps`** (`npm ci` fallisce se manca un package.json dichiarato dai workspace); `COPY app/blocks` + build nello stage `build` |
| `app/backend/Dockerfile` (runtime) | ⚠️ **Trappola**: lo stage runtime copia `node_modules` da `prod-deps` e solo `app/backend/dist`. Il symlink `node_modules/@cms/blocks → ../app/blocks` resterebbe **pendente** → `MODULE_NOT_FOUND` all'avvio. Serve un `COPY --from=build /app/app/blocks/dist ./app/blocks/dist` più il suo `package.json` |
| `app/frontend/Dockerfile` | Stesse `COPY` nello stage `deps`, più il sorgente e l'ordine di build prima di Vite |
| `.github/workflows/ci.yml` | I job sono per workspace espliciti (`lint:backend`, `test --workspace=app/backend`, …): un terzo workspace **non verrebbe né lintato né testato né buildato** senza un job nuovo. Va anche garantito l'ordine di build nei job backend/frontend |
| `package.json` (root) | Script `clean` (path hardcoded), più eventuali `build:blocks` e l'ordine in `build` |

Verdetto: **compatibile, ma non gratuito** — circa 5 file e un problema di runtime Docker non ovvio. La valutazione se pagarlo è nella Fase B.3.

### 8. Frontend — cosa è riusabile e cosa no

**Riusabile senza modifiche:**

- `usePaginatedList` ([usePaginatedList.ts:80-154](../../../app/frontend/src/hooks/usePaginatedList.ts#L80-L154)): paginazione, ricerca, ordinamento server-side, `notifications.show` sull'errore, `extraParams` tipizzati — copre l'elenco Pagine con filtri `status`/`locale` così com'è.
- `useColumnVisibility`, `ResponsiveTable`, `ListToolbar`, `ConfirmModal`, `FormDrawer`, `PageHeader`, `RowActionIcon`.
- Pattern store Zustand (ADR-17): un file per store in `src/hooks/`, export `use<Dominio>Store`, **selettori mirati obbligatori** — vedi `useAuthStore` ([useAuth.ts:45](../../../app/frontend/src/hooks/useAuth.ts#L45)).
- Istanza Axios con refresh silenzioso deduplicato tramite promise condivisa ([api.ts:37-53](../../../app/frontend/src/services/api.ts#L37-L53)).

**Non riusabile / da costruire:**

- **`ErrorBoundary` non è parametrizzabile**: `Props` contiene solo `children` ([ErrorBoundary.tsx](../../../app/frontend/src/components/ErrorBoundary.tsx)), il fallback è una pagina intera e l'unica azione fa `window.location.href = '/dashboard'`. Un boundary per blocco (requisito F04) richiede props `fallback`/`onReset` o un componente nuovo: così com'è, il crash di un blocco porterebbe via l'intero editor.
- **Nessun ramo `409` nell'interceptor**: la catena gestisce 401/403/404/5xx ([api.ts:93-108](../../../app/frontend/src/services/api.ts#L93-L108)) e lascia cadere il 409 nel `reject` finale, senza estrarre `code`. La distinzione "conflitto di editing ≠ slug duplicato" va costruita nel service di dominio, leggendo `error.response.data.code` — nessun estrattore tipizzato esiste oggi.
- **Nessuno store di documento**: `usePaginatedList` è per liste. L'editor ha bisogno di uno store con albero bozza, stato dirty e `version` corrente, cioè esattamente il caso d'uso previsto dalla regola 1 di ADR-17. ⚠️ **ADR-17 è però in attesa di firma** (TODO 3.2): costruirci sopra l'editor significa appoggiarsi a una decisione non approvata.
- Nessuna libreria drag & drop (la roadmap la vincola a un'ADR), nessun componente blocco in CSS Modules, nessuna rotta/voce di navigazione per le Pagine (rotte enumerate in `App.tsx`, sidebar in [navigation.ts:23-40](../../../app/frontend/src/config/navigation.ts#L23-L40)).

### Divergenze codice ↔ documentazione rilevate (segnalate, non allineate)

| # | Documentazione | Codice reale |
|---|---|---|
| D1 | `CLAUDE.md` § Database: `version int NOT NULL DEFAULT 1` fra le colonne base | Nessuna delle 5 tabelle ha `version` |
| D2 | `CLAUDE.md` § Superfici API: "JWT middleware esclude `auth/*`, `health`, `/metrics`, `public/*`" | Esclusi 6 path `auth/*` puntuali; `/metrics` bypassato nel middleware, non escluso; `public/*` inesistente |
| D3 | `CLAUDE.md` § Database: "FK sempre `{onDelete:'restrict'}`" | `audit_log.userId`/`impersonatedBy` usano `onDelete:'set null'` ([schema.ts:75-82](../../../app/backend/src/db/schema.ts#L75-L82)) |
| D4 | `CLAUDE.md` § Backend: "unicità da constraint DB → 409, mai SELECT preventiva" | `AdminService` usa `SELECT` preventiva + `BadRequestException` per l'email duplicata ([admin.service.ts:187-191](../../../app/backend/src/admin/admin.service.ts#L187-L191)); **nessun `ConflictException` e nessuna gestione del codice PG `23505` esiste nel repository** |
| D5 | ~~`CLAUDE.md` § Documentation Policy impone di aggiornare progress-tracker e roadmap a ogni modifica significativa~~ | ~~`CLAUDE.md` § Divieti assoluti vieta a qualunque ruolo di modificare file in `docs/`~~ → **Risolta il 2026-08-17**: la Documentation Policy ora colloca l'aggiornamento **a fine feature, su richiesta umana esplicita**, che vale come autorizzazione puntuale |
| D6 | SPEC-F01 usa `char('guid').notNull().unique()` inline | La convenzione del repo è `uniqueIndex('<tabella>_guid_idx')` nel terzo argomento di `pgTable` |

**D4 è la divergenza che costa di più a F01**: la spec dà per scontata una mappatura `constraint violation → 409` che nel codice non esiste in nessuna forma. Con `AllExceptionsFilter` così com'è ([all-exceptions.filter.ts:49-59](../../../app/backend/src/common/filters/all-exceptions.filter.ts#L49-L59)), un errore Postgres grezzo diventa **500 `UNKNOWN_ERROR`**, non 409. Va costruita, ed è dentro il perimetro di F01.

---

## FASE B — I tre problemi aperti

### B.1 — Unique index di `pages` con `parentId` nullable

**Il problema è reale.** SPEC-F01 propone `uniqueIndex('pages_slug_locale_parent_uq').on(t.locale, t.parentId, t.slug)` (riga 113) con `parentId` nullable (riga 90). In PostgreSQL, dentro un indice univoco `NULL` non è uguale a `NULL`: due pagine **root** con lo stesso `locale` e lo stesso `slug` inseriscono entrambe senza errore. L'indice protegge solo le pagine figlie — cioè non protegge il caso più frequente, la home e le pagine di primo livello.

C'è un **secondo difetto nella stessa riga**, non segnalato dalla spec: il soft delete è obbligatorio, quindi una pagina eliminata continua a occupare il proprio slug per sempre. Eliminata `/chi-siamo`, non se ne può più creare una con lo stesso percorso.

#### Opzioni

| | Opzione | Copre NULL | Copre soft delete | Requisiti |
|---|---|---|---|---|
| A | `unique(...).nullsNotDistinct()` | ✅ | ❌ (un constraint non può essere parziale) | PostgreSQL ≥ 15 — disponibile in Drizzle 0.45.2 (`unique-constraint.d.ts:10`) e i compose usano `postgres:16` |
| B | **Due indici univoci parziali** | ✅ | ✅ | Nessuno (`.where()` supportato da Drizzle 0.45.2, `indexes.d.ts:67`) |
| C | Sentinella `parentId = 0` / self-reference | ✅ | ❌ | Rompe la FK `restrict` e introduce una riga fantasma. **Scartata** |

#### Opzione scelta: **B — due indici univoci parziali, entrambi filtrati su `is_active`**

```ts
uniqueIndex('pages_slug_locale_root_uq')
  .on(t.locale, t.slug)
  .where(sql`${t.parentId} is null and ${t.isActive}`),
uniqueIndex('pages_slug_locale_child_uq')
  .on(t.locale, t.parentId, t.slug)
  .where(sql`${t.parentId} is not null and ${t.isActive}`),
```

**Perché**: è l'unica opzione che chiude entrambi i difetti con lo stesso strumento e senza vincolare la versione minima di PostgreSQL. L'opzione A è più elegante su una riga sola, ma lascia in piedi il problema degli slug bloccati dalle pagine cancellate e imporrebbe di dichiarare PG ≥ 15 come requisito di prodotto (oggi non scritto da nessuna parte).

**Impatto sulla risoluzione pubblica (F03)**: la risoluzione avviene per `(locale, percorso)` risalendo i segmenti. Senza il fix, `(it-IT, /chi-siamo)` può corrispondere a **due righe**: la query restituisce un vincitore arbitrario, la chiave di cache `public:page:it-IT:/chi-siamo` diventa ambigua e i motori vedono contenuto duplicato. Con il fix, la risoluzione è deterministica per costruzione e la chiave di cache è una funzione totale. Costa niente adesso; dopo che esiste contenuto, costa una migrazione con deduplica manuale.

**Impatto sulla mappatura `409`**: due indici significano **due nomi di constraint** da mappare. È il motivo per cui il mapper degli errori Postgres va scritto leggendo `err.constraint` e non il messaggio:

- `pages_slug_locale_root_uq` / `pages_slug_locale_child_uq` → `409` `code: 'PAGE_SLUG_DUPLICATE'`
- `pages_guid_idx` → `500` (collisione di guid: è un bug interno, non un errore dell'utente)
- `page_revisions_page_number_uq` → `409` `code: 'REVISION_NUMBER_CONFLICT'` (pubblicazione concorrente sulla stessa pagina)

Il frontend distingue il conflitto di editing (`PAGE_VERSION_CONFLICT`, dal lock ottimistico) dallo slug duplicato leggendo `code`, come richiesto dalla spec alla riga 220.

> ✅ **Sotto-decisione confermata dall'umano il 2026-08-17**: `is_active` entra in **entrambi** gli indici parziali, quindi **il soft delete libera lo slug**. Conseguenza accettata: ripristinare una pagina eliminata il cui slug è stato nel frattempo riassegnato fallisce con `409`. È il comportamento voluto — fallire rumorosamente è preferibile a due pagine che rivendicano la stessa URL pubblica. Riportata in SPEC-F01 § Unicità dello slug e coperta da un test di regressione in T6.

### B.2 — Contraddizione sulle Revisioni

#### I fatti, testualmente

- `business-rules.md:173` — "Le Revisioni non si modificano e non si cancellano."
- `business-rules.md:179` — "Il numero di Revisioni conservate per Pagina è configurabile; la potatura delle eccedenti non tocca mai l'ultima Revisione pubblicata."
- `CLAUDE.md` § Divieti assoluti — "`DELETE` fisico (soft-delete obbligatorio)".

Le tre regole insieme non sono soddisfacibili. La regola 5 esiste per **liberare spazio** (è la mitigazione del rischio R2 della spec: snapshot completi che crescono). Un soft delete lascia la riga e il suo `jsonb` esattamente dove sono: la potatura implementata come soft delete **non fa la cosa per cui la regola è stata scritta**. Non è un cavillo formale, è una funzione che non funziona.

#### Il secondo difetto: le colonne di `page_revisions`

Nella proposta di schema (SPEC-F01, righe 119-141) la tabella immutabile porta:

- **`updatedAt` e `updatedBy`** — su una riga che per definizione non viene mai aggiornata sono colonne morte, e peggio: dichiarano l'esistenza di un percorso di modifica. Chi legge lo schema fra sei mesi conclude che aggiornare una revisione è previsto.
- **`isActive`** — è precisamente lo scivolo verso la cancellazione che la regola 2 vieta. Se la colonna esiste, prima o poi qualcuno la userà per "eliminare" una revisione.
- **nessun `version`** — corretto nel merito: non c'è concorrenza su righe che non si aggiornano.

**Aggiornamento del 2026-08-17: non serve più alcuna deroga.** La prima stesura chiedeva di autorizzare queste tre assenze come eccezione alla "struttura obbligatoria". La regola in `CLAUDE.md` § Database è stata invece **riscritta** (vedi Fase A.1): una tabella append-only porta `id`, `guid`, `createdAt`, `createdBy` e nient'altro. `page_revisions` è quindi **conforme per costruzione**, non derogata. Resta all'ADR sulle revisioni il compito di formalizzare S1 (snapshot completo) e di registrare la contraddizione sulla potatura, non quello di autorizzare colonne mancanti.

#### Opzioni di riconciliazione

| | Opzione | Regola 2 | Regola 5 | Divieto DELETE fisico |
|---|---|---|---|---|
| 1 | **Retention job**: nessun percorso applicativo modifica o cancella una revisione; la potatura è un job di manutenzione con `DELETE` fisico, tracciato in audit log, mai sull'ultima pubblicata né sulle ultime N | Rispettata come invariante applicativa | Rispettata **davvero** | Richiede un'eccezione esplicita e circoscritta, in ADR |
| 2 | **Crescita illimitata**: si abbandona la regola 5, si tiene tutto | Rispettata | Abrogata | Rispettato |
| 3 | **Svuotamento del payload**: la riga resta, si azzera `content`/`seo` (o si sposta il blob sullo storage driver) | ⚠️ La riga *viene modificata* | Sostanzialmente rispettata (il peso è nel `jsonb`) | Rispettato |

#### Proposta: **opzione 1**, ma **fuori da F01**

Due mosse distinte, da non confondere:

**Adesso, dentro F01** — la potatura **non si implementa**. Non è nello scope della feature, non è negli acceptance criteria e nessun sito nuovo ha un problema di revisioni eccedenti. Si implementa solo l'immutabilità, e la si implementa sul serio:

- nessun endpoint `PATCH`/`DELETE` su `page_revisions` (già così nella spec);
- nessun metodo di service che aggiorni o cancelli una revisione;
- **`updatedAt`, `updatedBy` e `isActive` rimossi dalla tabella** — una tabella immutabile non dichiara colonne che presuppongono la mutazione. Applicato in SPEC-F01 il 2026-08-17, conforme alla regola append-only di `CLAUDE.md`;
- niente `version`, per lo stesso motivo;
- un test che verifichi l'assenza di qualunque percorso di scrittura.

**Prima di F09/F03** — un'ADR dedicata scioglie la contraddizione, con la mia raccomandazione per l'opzione 1: il divieto di `DELETE` fisico esiste per proteggere i **dati editoriali dell'utente da operazioni applicative irreversibili**, non per vietare a un job di manutenzione di applicare una retention policy dichiarata e configurabile. L'eccezione va scritta stretta: una tabella, un job, una policy, audit log obbligatorio, mai l'ultima revisione pubblicata. L'opzione 3 è il ripiego se l'eccezione non è accettabile — costa una `UPDATE` su una tabella dichiarata immutabile, che è una violazione più insidiosa perché formalmente compatibile con il divieto.

> **Non applico nulla di tutto questo.** `business-rules.md` non si tocca senza la tua firma: le regole 2 e 5 restano come sono finché non decidi. Quanto sopra è una proposta, e la contraddizione va risolta prima che esista una politica di retention, non prima che esista F01.

### B.3 — Collocazione del registro dei blocchi

**Il conflitto è reale.** `roadmap.md:51` descrive il registro come "condiviso backend/frontend". I confini degli agenti sono esclusivi: il backend-developer lavora "Solo `app/backend/`", il frontend-developer "Solo `app/frontend/`". Nessun ruolo definito può scrivere codice condiviso. Non è un cavillo di processo: è un file che nessuno è autorizzato a creare.

#### Opzioni

| | Opzione | Costo infrastrutturale | Proprietario |
|---|---|---|---|
| 1 | Terzo workspace `app/blocks` | 5 file (Fase A.7) + trappola runtime Docker + job CI | Nessuno: richiede un emendamento ai confini degli agenti in `CLAUDE.md` |
| 2 | **Registro nel backend + artefatto generato per il frontend** | Zero: la pipeline esiste già | backend-developer (sorgente), frontend-developer (consumo) |
| 3 | Registro duplicato nelle due app | Zero all'inizio, alto per sempre | Due proprietari, due verità. **Scartata** |

#### Opzione scelta: **2 — il backend è la fonte di verità, il frontend consuma un artefatto generato**

Il registro vive in `app/backend/src/blocks/`. Il contratto (identificativi dei tipi, schemi delle props, regole di annidamento, versione dello schema) viene emesso in `app/frontend/src/types/blocks.types.ts` da uno script gemello di quelli esistenti, sul modello `openapi:export` → `openapi:types`.

**Perché questa e non il workspace:**

1. **La macchina esiste già ed è collaudata.** Il repository ha esattamente questo pattern: `openapi:export` genera `docs/openapi.yaml`, `openapi:types` genera `app/frontend/src/types/api.types.ts`, e un job CI (`openapi-sync`) fallisce se il generato è andato in drift rispetto al codice. Il registro dei blocchi è lo stesso problema — un contratto server-side consumato dal client — e merita la stessa soluzione, non una nuova.
2. **La validazione è server-side e non negoziabile** (business rules, blocchi regola 4: un albero non conforme è respinto integralmente). Il backend è già l'autorità sostanziale: il workspace condiviso renderebbe simmetrica una relazione che simmetrica non è.
3. **I confini degli agenti restano intatti.** Nessun emendamento a `CLAUDE.md`, nessuna zona di proprietà ambigua, nessuna approvazione umana aggiuntiva sul processo.
4. **Costo infrastrutturale zero**, contro i 5 file, il job CI e il symlink pendente nell'immagine Docker di produzione descritti in Fase A.7.

**Il limite, dichiarato**: la pipeline `openapi:export` funziona per gli **schemi**, non per i **componenti React**. Questi ultimi sono codice, non dati, e non sono generabili. Restano quindi in `app/frontend/`, di proprietà del frontend-developer, e **andranno duplicati** il giorno in cui l'ADR sulla superficie HTML pubblica produrrà un secondo consumer. Ciò che è davvero condiviso è solo il **contratto**, che è dato, quindi generabile.

#### Vincolo di isolamento dei componenti dei blocchi (vincolante da F02 in poi)

Poiché quella duplicazione è prevedibile, va resa **economica adesso** invece che dolorosa dopo. I componenti dei blocchi nascono in una cartella dedicata — `app/frontend/src/components/blocks/` — con una regola sola:

> **Nessun file dentro `components/blocks/` importa da `app/frontend/src/**` al di fuori di `components/blocks/` stesso.**

Sono ammessi: import relativi interni alla cartella, `react`, i CSS Modules locali, e il tipo generato del contratto dei blocchi. Sono vietati: hook applicativi, store Zustand, service Axios, `libs/`, `config/`, layout — e Mantine, che è già vietato nei blocchi da `CLAUDE.md`.

**Perché**: con questo vincolo lo spostamento futuro della cartella è un `git mv` più un aggiustamento di path. Senza, è la risalita a mano di un grafo di dipendenze verso l'intera app admin, cioè la ragione per cui in pratica la duplicazione non si fa e il secondo consumer nasce con componenti riscritti da zero.

Il vincolo non costa nulla oggi: **F01 non introduce alcun componente di blocco**. È una regola da rispettare quando F02/F04 li creeranno, e va verificata in review — non serve tooling.

**Quando riaprire la questione del workspace**: quando comparirà un **terzo** consumer. Con tre consumer il workspace inizia a pagarsi; con due, no.

**Proprietà dichiarata, in ogni caso**: se scegliessi comunque l'opzione 1, il proprietario di `app/blocks` deve essere il **backend-developer con estensione esplicita del perimetro scritta in `CLAUDE.md`**, perché la fonte di verità della validazione è server-side. La proprietà condivisa fra due agenti è l'unica configurazione da escludere: produce due autori e nessun responsabile.

---

## FASE C — Piano operativo di F01

### Audit strategico

**Falle logiche e contraddizioni**

| Dove | Problema | Impatto a runtime | Stato |
|---|---|---|---|
| SPEC-F01 § Schema | Unique index inefficace sulle pagine root (`NULL != NULL`) | Slug duplicati fra pagine di primo livello; risoluzione pubblica non deterministica in F03 | ✅ **Corretto** in spec il 2026-08-17 (due indici parziali) |
| SPEC-F01 § Schema + soft delete | Nessun predicato su `is_active` | Una pagina eliminata blocca il proprio slug per sempre | ✅ **Corretto** in spec (`is_active` in entrambi gli indici, firmato) |
| SPEC-F01 § Schema | `isActive`/`updatedAt`/`updatedBy` su tabella immutabile | Lo schema dichiara un percorso di mutazione che le business rules vietano | ✅ **Corretto**: `page_revisions` append-only, regola riscritta in `CLAUDE.md` |
| SPEC-F01 (prima stesura) | Nessuna sanitizzazione: `props.html` con `<script>` persistito e poi congelato in una Revisione immutabile | **XSS stored** non risanabile a posteriori | ✅ **Corretto**: sanitizzazione dentro F01 (T3) |
| `business-rules.md` § Revisioni, 2 vs 5, vs divieto DELETE | Potatura irrealizzabile senza violare una delle tre | La regola 5 non può essere implementata come scritta | ⏳ Aperto — ADR (T1). **Non si implementa la potatura in F01** |
| SPEC-F01 § Logica di servizio vs codice | La mappatura constraint → `409` non esiste nel repository | Slug duplicato risponderebbe **500**, non 409 | ⏳ Dentro F01 (T3) |
| SPEC-F01 § Endpoint | `POST /:guid/status` "Manager (User solo per `review`)" | Un unico guard non esprime "Manager, tranne una transizione consentita anche a User": serve un check nel service, non `@UseGuards` | ⏳ Dentro F01 (T5), regolato da ADR-18 § D3 |
| `roadmap.md`:51 vs confini agenti | Registro blocchi condiviso, nessun agente può scriverlo | F02 non è assegnabile finché non si decide B.3 | ⏳ Aperto — non blocca F01 |

**Rischi architetturali / over-engineering**

- **Cache**: non costruirla in F01. Nessuna superficie pubblica esiste ancora, quindi non c'è nulla da invalidare. Rimandata all'ADR 1.3.
- **Presenza in editor via Socket.io**: la spec la cita come opzionale. `AppGateway` supporta oggi solo room `user:${id}` ([app.gateway.ts:73](../../../app/backend/src/realtime/app.gateway.ts#L73)): servirebbero room per documento. **Fuori da F01.**
- **Job di pubblicazione differita**: lo stato `scheduled` esiste, il job è dichiarato out of scope da F01 e agganciato a F03. Va **segnalato in UI** che la programmazione non è ancora attiva (rischio R4 della spec), non implementato qui.
- **Diff strutturale fra revisioni** (business rules, revisioni regola 4): non è negli outcomes di F01. Non anticiparlo.

### Task operativi

Otto task, ordinati per dipendenze. **T1 è documentale e richiede firma umana: nessun task successivo può iniziare senza di essa.**

Rispetto alla prima stesura: il vecchio T1 (ADR ownership) è stato **prodotto** — `docs/ai/adr/ADR-18-ownership-per-riga.md`, in attesa di firma — e non è più un task; il vecchio T2 (ADR revisioni) diventa T1 e assorbe la proposta della dipendenza di sanitizzazione; il **sanitizzatore** entra come T3, prima di qualunque percorso di persistenza.

#### T1 — Documenti bloccanti: ADR revisioni + proposta della dipendenza di sanitizzazione
- **Agente**: orchestrator (su tua richiesta esplicita — non è auto-avviabile)
- **Output atteso**: `docs/ai/adr/ADR-19-revisioni-immutabili.md` · `docs/ai/rfc/RFC-001-sanitizzazione-html-server-side.md`
- **Dipendenze**: nessuna
- **Criterio di Done**: **(a)** l'ADR-19 formalizza S1 (snapshot completo, TODO 1.2), conferma `page_revisions` come tabella append-only conforme alla regola riscritta di `CLAUDE.md`, e **registra la contraddizione di B.2 rimandando la potatura** a una decisione successiva senza implementarla. **(b)** L'RFC sulla sanitizzazione propone la libreria con **motivazione e almeno due alternative valutate** (peso, manutenzione, superficie di attacco, comportamento su HTML malformato), definisce l'allowlist minima di F01 e dichiara che l'allowlist **per tipo di blocco** resta a F02. **Nessuna dipendenza viene installata da questo task**: `npm install` avviene solo dopo firma, dentro T3. Entrambi i documenti **firmati da un umano**

#### T2 — Schema `pages` + `page_revisions` e migrazione
- **Agente**: backend-developer
- **Output atteso**: `app/backend/src/db/schema.ts` (tabelle + `relations`), `app/backend/src/db/migrations/0004_*.sql`
- **Dipendenze**: T1(a) firmata · **ADR-18 firmata** · **approvazione umana esplicita dello schema** (`CLAUDE.md` → Ask first)
- **Criterio di Done**: `npm run db:generate` produce **una** migrazione; `npm run db:migrate` la applica su database vuoto senza errori; l'SQL contiene i **due indici parziali** di B.1, entrambi con il predicato su `is_active`; la dipendenza circolare `pages.published_revision_id` ↔ `page_revisions.page_id` è generata senza errori con `published_revision_id` nullable (chiude il rischio R3 della spec); `page_revisions` non ha `updatedAt`/`updatedBy`/`isActive`/`version`; `guid` indicizzato con la convenzione `uniqueIndex('<tabella>_guid_idx')` del repository, non con `.unique()` inline; **nessuna colonna di sito** e nessun `scopeId` (A5 mono-sito); indice su `created_by` (predicato di ownership, ADR-18 § D6)

#### T3 — Sanitizzazione dell'albero + mapper degli errori Postgres
- **Agente**: backend-developer
- **Output atteso**: `app/backend/src/common/sanitizer/` (service + allowlist) · `app/backend/src/common/db-error.mapper.ts` · `app/backend/src/common/ownership.ts` (helper di ADR-18 § D5) · aggiornamento di `app/backend/package.json` con la sola dipendenza approvata in T1(b)
- **Dipendenze**: T1(b) firmata (senza approvazione della dipendenza **il task non parte**), T2
- **Criterio di Done**: il sanitizzatore percorre l'albero e tratta **ogni prop di tipo stringa a qualunque profondità**, non solo i blocchi noti; `<script>`, `<iframe>`, handler `on*` e URL `javascript:` non sopravvivono; la **struttura** dell'albero (chiavi, `id`, `type`, `children`) resta invariata; un albero non sanitizzabile è respinto **per intero**, mai persistito a metà; il mapper legge `err.constraint` (mai il testo del messaggio) e copre i nomi di indice della tabella in SPEC-F01 § Logica di servizio, punto 10, con i nomi in una **costante**; `ownership.ts` espone le tre funzioni di ADR-18 senza accessi al database; nessun `any` non commentato; **nessun guard modificato**

#### T4 — Modulo `pages`: CRUD, slug, gerarchia, lock ottimistico, ownership
- **Agente**: backend-developer
- **Output atteso**: `app/backend/src/pages/{pages.module,pages.controller,pages.service}.ts` + `dto/`; registrazione in `app/backend/src/app.module.ts`
- **Dipendenze**: T3
- **Criterio di Done**: endpoint `GET`/`POST`/`GET :guid`/`PATCH :guid`/`DELETE :guid` funzionanti; **ogni percorso di persistenza passa dal sanitizzatore di T3** — nessuna scrittura di `draftContent` lo aggira; `PATCH` con `WHERE version = :version` → **zero righe aggiornate ⇒ `409` `PAGE_VERSION_CONFLICT`**; slug duplicato intercettato dal **constraint** (nessuna `SELECT` preventiva) e mappato a `409` `PAGE_SLUG_DUPLICATE`; slug riservato e ciclo di gerarchia → `400`; ownership per ADR-18: `assertRowOwnership` prima di ogni scrittura, `rowOwnershipFilter` nella `WHERE` **della query dei dati e di quella del conteggio**, `403` su riga altrui e `404` solo su guid inesistente o soft-deleted; `createdBy` assente da ogni DTO di update; nessun `any` non commentato; `npm run openapi:export` + `openapi:types` eseguiti e committati

#### T5 — Macchina a stati, pubblicazione transazionale, revisioni
- **Agente**: backend-developer
- **Output atteso**: `app/backend/src/pages/pages.state-machine.ts`; endpoint `POST :guid/status`, `GET :guid/revisions`, `GET :guid/revisions/:revisionGuid`, `POST :guid/revisions/:revisionGuid/restore`
- **Dipendenze**: T4
- **Criterio di Done**: la mappa delle transizioni è **una costante**, non una catena di `if`; ogni transizione fuori mappa → `400`; la transizione a `review` è consentita a `User` **solo sulla propria riga in `draft`** (ADR-18 § D3), le altre restano `Manager` — check nel service, non `@UseGuards`; la pubblicazione esegue **sanitizzazione dello snapshot** + creazione revisione + aggiornamento `publishedRevisionId`/`publishedAt`/`status` + audit log in **una sola** `db.transaction` (pattern già in uso in [admin.service.ts:90](../../../app/backend/src/admin/admin.service.ts#L90)); modificare una pagina `published` non ne cambia lo stato né la revisione pubblicata; `restore` crea una nuova bozza e non tocca la revisione online; **nessun metodo scrive o cancella su `page_revisions`** dopo l'inserimento; nessuna potatura implementata; azioni `pages.publish|unpublish|archive|restore-revision|delete` in audit log; `openapi:export` + `types` rieseguiti

#### T6 — Copertura di test F01
- **Agente**: test-engineer
- **Output atteso**: `app/backend/test/unit/pages/pages.service.spec.ts`, `app/backend/test/e2e/pages.e2e-spec.ts`, `bruno/pages/*.yml`
- **Dipendenze**: T5 (la parte CRUD può partire da T4)
- **Criterio di Done**: unit su macchina a stati (ammesse **e** vietate), normalizzazione slug, rilevamento cicli, incremento `version`, sanitizzazione; integration su tutti gli acceptance criteria della feature più i **cinque casi di regressione** della tabella in SPEC-F01 § Test richiesti — in particolare: due pagine root con stesso `locale`+`slug` → `409`; slug riutilizzabile dopo soft delete; payload XSS **neutralizzato a database** (assert sulla riga, non sulla risposta); totale della paginazione filtrato per ownership con almeno una pagina altrui presente; `User` su propria pagina in `review` → `403`. Più: `409` da salvataggio concorrente senza perdita dati; `403` per `User` che pubblica; `404` su pagina soft-deleted; immutabilità revisioni; un `.yml` Bruno per ciascuno dei 9 endpoint con `Authorization: Bearer {{token}}`; suite verde in CI. **Nessuna correzione di logica applicativa**: i bug trovati si segnalano

#### T7 — Frontend: service, tipi, elenco Pagine
- **Agente**: frontend-developer
- **Output atteso**: `app/frontend/src/services/pages.service.ts`, `src/types/pages.types.ts`, `src/pages/pages/PagePages.tsx`, rotta in `src/App.tsx`, voce in `src/config/navigation.ts`
- **Dipendenze**: T4 (per i tipi generati)
- **Criterio di Done**: elenco su `usePaginatedList` + `useColumnVisibility` con filtri `status`/`locale`; ogni chiamata in `try/catch` con `notifications.show`; il service espone un estrattore tipizzato di `code` dalla risposta d'errore (oggi assente, vedi Fase A.8); solo Mantine v7 nel chrome; **nessun componente di blocco introdotto** (F01 non ne ha) — quando arriveranno, vale il vincolo di isolamento di B.3; `npm run lint:frontend` e `npm run test --workspace=app/frontend` verdi

#### T8 — Frontend: dettaglio Pagina, stati, cronologia revisioni, conflitti
- **Agente**: frontend-developer
- **Output atteso**: `app/frontend/src/pages/pages/PagePageDetail.tsx` (+ eventuali componenti in `src/components/`)
- **Dipendenze**: T5, T7
- **Criterio di Done**: `version` inviata in ogni `PATCH` e riallineata dopo il salvataggio; il `409` `PAGE_VERSION_CONFLICT` mostra "La pagina è stata modificata da un altro utente", **messaggio distinto** dal `409` `PAGE_SLUG_DUPLICATE`; **nessuna sovrascrittura silenziosa in nessun percorso**; archiviazione e soft delete dietro `Modal` di conferma (mai `window.confirm`); cronologia revisioni con ripristino; lo stato `scheduled` è mostrato con l'avviso che la pubblicazione differita non è ancora attiva (rischio R4); build e lint verdi

**Uscita dal piano** (non è un task): `docs/openapi.yaml` e `app/frontend/src/types/api.types.ts` committati e allineati (il job CI `openapi-sync` lo verifica), stato di SPEC-F01 aggiornato, `docs/ai/progress-tracker.md` e `docs/roadmap.md` aggiornati. La divergenza **D5** è risolta: `CLAUDE.md` § Documentation Policy ora stabilisce che questi aggiornamenti avvengono **a fine feature, su tua richiesta esplicita**, che vale come autorizzazione puntuale a scriverli.

### Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| A5 (mono/multi-sito) ribaltata dopo T2 | **Bassa** (confermata il 2026-08-17) | **Alto** | Non più bloccante. Se venisse ribaltata dopo T2, costa una migrazione su dati reali e la riscrittura di ogni query. L'unico punto di innesto dichiarato è `applyScopeFilter` |
| ~~Contenuto HTML non sanitizzato persistito fino a F02~~ | ~~Alta~~ | ~~Alto~~ | **Rischio chiuso**: la sanitizzazione entra in F01 (T3). Era la mitigazione sbagliata — "F01 non espone superficie pubblica" ignorava che le Revisioni sono immutabili e quindi non risanabili a posteriori |
| La dipendenza di sanitizzazione non viene approvata | Bassa | **Alto** | T3 non parte e con esso T4/T5: F01 non può persistere contenuto. Se la libreria proposta non convince, serve un'alternativa approvata — non un rinvio |
| Sanitizzatore troppo aggressivo: contenuto legittimo mutilato | Media | Basso | L'allowlist di F01 è dichiaratamente minima e sarà **allargata** da F02 per tipo di blocco. Restringere e poi allargare è reversibile; il contrario no |
| Mappatura constraint → `409` fragile (nomi indice come stringhe) | Media | Medio | Nomi centralizzati in una costante del mapper, coperti dal test di regressione di T6: se qualcuno rinomina un indice, il test rompe |
| ADR-17 non firmata, ma è la base dello store dell'editor | Alta | Medio | F01 non introduce store nuovi (solo `usePaginatedList` e stato locale). Il problema diventa reale in F04: firmare ADR-17 prima |
| Revisioni: crescita illimitata in assenza di potatura | Bassa a breve | Medio | Accettata per F01 (sito nuovo, poche revisioni). Riaprire con l'ADR di B.2 prima che esista contenuto in volume |
| ADR-18 firmata con P1/P2/P3 diversi dalla proposta | Media | Basso | I tre punti aperti sono isolati in una sezione dedicata dell'ADR e toccano un predicato di query e un DTO, non lo schema: correggerli dopo la firma costa poco, purché avvenga **prima** di T4 |

### Definition of Done — checklist globale

**Implementazione**
- [ ] T1–T8 completati, ognuno con il proprio criterio soddisfatto
- [ ] Nessun `any` senza commento, nessun `console.log`, nessun `process.env` diretto
- [ ] JSDoc su ogni funzione pubblica
- [ ] Nessun `DELETE` fisico introdotto, nessuna email fuori coda, nessun HTML renderizzato dall'API

**Test**
- [ ] Unit e integration verdi; Bruno per tutti e 9 gli endpoint
- [ ] Test di regressione B.1 (due root con stesso slug → `409`) presente e verde
- [ ] Immutabilità delle revisioni verificata da test, non solo dall'assenza di endpoint
- [ ] Nessun test placeholder

**Build e qualità**
- [ ] `npm run build` (backend + frontend) e `npm run lint` verdi
- [ ] Job CI `backend-e2e` verde

**Contratti e documentazione**
- [ ] `openapi:export` + `openapi:types` eseguiti; job `openapi-sync` senza drift
- [ ] Deviazioni emerse in implementazione riportate nella spec (con firma umana)

**Commit**
- [ ] Un commit atomico per task, Conventional Commits
- [ ] Branch `feature/F01-gestione-pagine`

---

## Blocchi — cosa non può partire, e perché

### Sbloccato il 2026-08-17 — assunzioni confermate

| Decisione | Esito | Effetto su F01 |
|---|---|---|
| **A5 — mono-sito vs multi-sito** | ✅ **Mono-sito, più lingue** | Nessuna colonna di sito su `pages`/`page_revisions`, nessun `applyScopeFilter` nelle query di dominio, nessuno scaffolding "in previsione". Unico punto di innesto futuro dichiarato: `Utils.applyScopeFilter(authInfo)` |
| **A3 — traduzioni come righe autonome** | ✅ **Confermata**, legame via `translationGroupId` (colonna opaca `char(16)`, scelta S4) | `locale` e `translationGroupId` restano sulla riga `pages`; nessuna tabella `translation_groups` |
| **A4 — riuso delle 4 soglie di ruolo** | ✅ **Confermata con correzione**: nessun ruolo nuovo, ma serve ownership per riga | Matrice ruolo↔endpoint invariata; l'ownership è regolata da **ADR-18** (prodotta, in attesa di firma) |
| **A2 — albero di blocchi JSON** | ✅ **Confermata** — allinea lo status all'obbligo già costituzionale | Nessun cambiamento di schema: era già l'architettura. La divergenza documentale segnalata nella prima stesura (assunzione aperta vs. regola vincolante) è sanata |
| **A6 — chatbot** | ⏳ Resta aperta | Non tocca F01 in nessun punto; F11 è l'ultima della fila |

### Bloccante prima di T2 (schema)

| Decisione | Stato |
|---|---|
| **Firma di ADR-18** (ownership per riga) | ⏳ ADR prodotta il 2026-08-17, in attesa. Blocca T2 (indice su `created_by`) e soprattutto T4 |
| **Firma di ADR-19** (revisioni immutabili, T1a) | ⏳ Da produrre |
| **Approvazione esplicita dello schema DB** | ⏳ `CLAUDE.md` → Ask first |

### Bloccante prima di T3 (persistenza)

| Decisione | Stato |
|---|---|
| **Approvazione della dipendenza di sanitizzazione** (T1b) | ⏳ Da proporre con alternative. Senza, nessun contenuto può essere persistito: T3, T4 e T5 restano fermi |

### Non bloccante per F01, bloccante per il resto

| Voce | Cosa blocca | Nota |
|---|---|---|
| **Superficie HTML pubblica** (SSR/SSG/prerender) | F03, F07, F08 | F01 non renderizza nulla e non espone `public/*`: procede senza. ⚠️ Vincolo da rispettare durante T3–T5: **non aggiungere colonne `html`/`rendered` "in previsione"**. Il fix del middleware (una riga, Fase A.3) resta fuori da F01 |
| **ADR di caching e invalidazione** (TODO 1.3) | F03 | Nessuna cache in F01. Il `RedisService` andrà esteso: oggi non ha né `scan` né tagging |
| **ADR formato/versionamento schema blocchi** (TODO 1.1) | F02, F04 | F01 valida solo la **forma esterna** dell'albero: resta scoperta la validazione semantica per `type`, **non** la sicurezza — quella è coperta da T3 |
| **Collocazione del registro blocchi** (B.3) | F02 | Nessun agente può scrivere codice condiviso finché non decidi. Raccomandazione: opzione 2 (backend-first), con il vincolo di isolamento dei componenti |
| **ADR drag & drop** | F04 | Vincolo "Mantine v7 esclusivo" da conciliare con una libreria DnD |
| **ADR-17 non firmata** | F04 | Lo store dell'editor si appoggerebbe a una decisione non approvata |

### Ownership per riga

`CLAUDE.md` la dichiara **bloccante per F01** e prescrive che sia fissata in ADR **prima** dell'implementazione. L'ADR è stata prodotta il 2026-08-17: `docs/ai/adr/ADR-18-ownership-per-riga.md`. Nel merito il lavoro è piccolo — il pattern esiste già in `FilesService.softDelete` e i guard non vanno toccati.

Stato dei quattro punti che la prima stesura di questo piano dichiarava da decidere:

| # | Punto | Esito |
|---|---|---|
| 1 | Bozza altrui per guid da un `User`: `403` o `404`? | ✅ **`403`**, deciso dall'umano il 2026-08-17. Il `404` resta la regola della sola superficie pubblica anonima; `notifications` mantiene il proprio `404` per un motivo diverso, dichiarato in ADR-18 § D7 |
| 2 | `User` può scrivere sulla **propria** pagina non più in `draft`? | 🔸 **Proposta**: no — visibilità sì, scrittura no (ADR-18 § D4 e P1). Deriva letteralmente da "Modificare una Pagina propria **(bozza)**". Da firmare |
| 3 | `createdBy` è la sola nozione di proprietà? | 🔸 **Proposta**: sì, ed è immutabile; nessun trasferimento di proprietà in F01 (ADR-18 § D2 e P2). Da firmare |
| 4 | `Manager` può eliminare? | ✅ **No, `DELETE` = Admin+.** Nessuna divergenza: SPEC-F01 e la matrice delle business rules dicono già la stessa cosa. Verificato, non deciso |

Finché ADR-18 non è firmata, **T4 non parte**. I punti 2 e 3 sono isolati nella sezione "Punti che richiedono la firma umana" dell'ADR: correggerli in fase di firma tocca un predicato di query e un DTO, non lo schema.

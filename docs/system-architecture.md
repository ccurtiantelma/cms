# System Architecture — Starter Kit

---

## Struttura monorepo

```
starter-kit/
├── app/
│   ├── backend/    ← NestJS 11, porta 3000
│   └── frontend/   ← React 19 + Vite, porta 5173
├── bruno/          ← Collezioni API testing
└── docs/
```

Package manager: **npm workspaces** (`["app/*"]`) — tutti i comandi si lanciano dalla root.

---

## Comunicazione Frontend ↔ Backend

- Protocollo: **REST over HTTP**
- Base URL dev: `http://localhost:3000/api/v1`
- Base URL prod: da variabile d'ambiente `VITE_API_BASE_URL`
- Tutti gli endpoint applicativi hanno prefisso `api/v1/app/<modulo>`
- Gli endpoint di autenticazione hanno prefisso `api/v1/auth/`
- Swagger UI (solo fuori produzione): `api/v1/docs`

---

## Autenticazione

- **Access token**: JWT firmato via `jsonwebtoken` (`jwt.sign`/`jwt.verify` diretti — non
  `@nestjs/jwt`/Passport, pattern volutamente leggero), durata default 15 minuti
  (`JWT_EXPIRATION`), inviato nell'header `Authorization: Bearer <token>`.
  Payload: `{ id, name, email, role, scopeId, jti, impersonatedBy? }`, `jti` generato con
  `Utils.randomString(16)`.
- **Refresh token (`rtk`)**: token **opaco** (non JWT), durata default 7 giorni
  (`RTK_EXPIRATION` in secondi), salvato in **cookie httpOnly signed** (`rtk`, path `/`),
  con **rotation** ad ogni utilizzo (la vecchia chiave `rtk:` e la vecchia `login:` associata
  vengono cancellate da Redis).
  Il cookie imposta esplicitamente `secure` (solo in produzione, via
  `AppConstants.isProduction`) e `sameSite: 'lax'` — nessun token CSRF dedicato,
  ritenuto ridondante data la combinazione con CORS a origine singola ed endpoint
  sensibili solo `POST` (vedi `docs/ai/adr/ADR-14-cookie-samesite-csrf.md`).
- **Allowlist di sessione**: ogni access token valido ha una chiave Redis
  `login:${accessToken}` con TTL derivato da `JWT_EXPIRATION` (utility
  `parseDurationToSeconds`). `AuthMiddleware` la richiede sempre, oltre alla verifica
  della firma JWT: un token con firma valida ma assente dall'allowlist (es. dopo logout)
  viene rifiutato.
- **Frontend**: l'access token è salvato in `localStorage` con chiave `access_token`
  (utente decodificato in cache: `auth_user`; preferenza tema: `color_scheme`).
- **Flusso refresh**: Axios interceptor intercetta il 401, chiama `POST auth/refresh` con
  il cookie `rtk`, aggiorna access token (+ nuovo cookie `rtk`) e ritenta la richiesta
  originale; se il refresh fallisce, redirect a `/login`.
- **AuthMiddleware**: globale su tutte le rotte eccetto `api/v1/auth/*` pubblici (vedi
  tabella endpoint in `docs/openapi.yaml`).
- **MFA**: sfida post-login con chiave Redis `mfa_tmp:${tmpToken}` → `{ userId }`, TTL 300s.
- **Sessioni/dispositivi (`GET/DELETE auth/sessions`)**: oltre alle chiavi effimere
  `login:`/`rtk:` (che ruotano ad ogni refresh, ~15min di vita ciascuna), ogni login
  genera un `sessionId` opaco stabile (`Utils.randomString(16)`) che identifica il
  "dispositivo" per tutta la durata del refresh token (fino a 7gg): chiave Redis
  `session:${sessionId}` → `{ userId, ip, userAgent, createdAt, lastUsedAt,
  refreshToken, accessToken }`, TTL allineato a `RTK_EXPIRATION` e rinnovato ad ogni
  refresh (che aggiorna anche `lastUsedAt`/ip/user-agent, preservando `createdAt`).
  Indice per utente: set Redis `user-sessions:${userId}`. Revocare una sessione
  cancella sia `rtk:${refreshToken}` sia `login:${accessToken}` correnti: il
  dispositivo perde immediatamente l'accesso e non può rinnovare il token. Il
  `logout` esegue la stessa pulizia per la sessione corrente (altrimenti il refresh
  token resterebbe valido — e la sessione visibile in lista — fino alla scadenza
  naturale). Non tracciato durante l'impersonificazione (nessun refresh token
  generato in quel flusso, vedi sezione "Impersonificazione" in
  `docs/business-rules.md`). Vedi `docs/ai/adr/ADR-13-gestione-sessioni-dispositivi.md`
  (bozza, in attesa di approvazione).

---

## Realtime — Socket.io

> Il modulo `src/realtime/` (`AppGateway`) è montato in `app.module.ts` dalla
> ADR-12 (prima presente ma non importato di default): serve il push realtime
> della campanella notifiche, vedi sezione "Notifiche — NotificationsModule".

- Server: NestJS Gateway sullo stesso processo HTTP (porta 3000), namespace `/realtime`
- Client: `socket.io-client` nel frontend, dietro `VITE_SOCKET_URL` — se assente
  la UI resta funzionante ma senza push istantaneo (nessun polling di fallback
  nello starter-kit)
- Autenticazione socket: token JWT nell'handshake + verifica allowlist di
  sessione Redis (stessa allowlist di `AuthMiddleware`); il client si unisce
  alla room `user:${userId}` per ricevere solo gli eventi a lui destinati
  (`AppGateway.emitToUser`)

---

## Database

- **DBMS**: PostgreSQL (dev: `app_db` / utente `app` / password `app`, via `docker-compose.yml` in root)
- **ORM**: Drizzle ORM — schema centralizzato in `app/backend/src/db/schema.ts`
- **Migrazioni**: generate con `drizzle-kit generate`, applicate con `drizzle-kit migrate`
- **Mai** eseguire `drizzle-kit push` in produzione

Ogni tabella include obbligatoriamente:
```
id          serial PRIMARY KEY
guid        char(16) — usato nelle URL pubbliche, mai l'id numerico
isActive    boolean DEFAULT true — soft delete
createdAt   timestamp
updatedAt   timestamp
createdBy   integer FK → users.id
updatedBy   integer FK → users.id
```

Entità di dominio incluse nello starter-kit: `users`, `audit_log`, `app_settings`,
`files` (metadata storage documenti, vedi `docs/ai/adr/ADR-8-storage-abstraction-files.md`
e sezione "Storage documenti" sotto) e `notifications` (campanella/badge, vedi
`docs/ai/adr/ADR-12-notifiche-persistenti-realtime.md` e sezione "Notifiche"
sotto) — vedi `docs/business-rules.md` per i campi completi delle entità di
dominio. Lo starter-kit non usa una tabella `logins`: Redis è l'unica session store.

---

## Cache e sessioni — Redis

- Client: **ioredis**
- Usato per: allowlist di sessione (`login:${accessToken}`), refresh token opachi
  (`rtk:${refreshToken}`), sfida MFA (`mfa_tmp:${tmpToken}`), code BullMQ
- URL: variabile d'ambiente `REDIS_URL`

---

## Job asincroni — BullMQ

- Basato su Redis
- Usato per: invio email (obbligatorio, mai invio diretto da un service)
- Moduli **separati** (pattern ereditato da `openbridge-backend`):
  - `src/mailer/` — costruzione/rendering email, wrapping Nodemailer
  - `src/queues/email-queue/` — coda BullMQ dedicata, processor che chiama il mailer
- Il progetto verticale aggiunge nuove code sotto `src/queues/<nome-coda>/` seguendo lo
  stesso pattern se servono altri job asincroni

---

## Job schedulati — cron dichiarativo e repeatable job (ADR-11)

Due meccanismi distinti, scelti in base a se il job può essere eseguito più
volte in parallelo su repliche diverse dell'app (containerizzazione, ADR-6):

- **`@nestjs/schedule`** (`src/scheduler/`) — cron dichiarativo (`@Cron`),
  in-process, **nessuna deduplica tra repliche**: adatto solo a job
  idempotenti/senza side-effect distruttivi (es. `queue-health.task.ts`, logga
  i contatori delle code BullMQ ogni ora). Non sopravvive a un restart come
  schedulazione persistita (riparte da zero al prossimo avvio, semplicemente
  perché è codice in-process).
- **BullMQ repeatable job** — ricorrenza persistita su Redis: un solo worker
  esegue ogni occorrenza anche con più repliche attive, e la schedulazione
  sopravvive a restart/redeploy. Usato per `src/queues/files-cleanup-queue/`,
  che rimuove fisicamente il blob dei file soft-deleted (`FilesModule`, ADR-8)
  oltre il periodo di grazia (`FILES_CLEANUP_GRACE_DAYS`) — **disabilitato di
  default** (`FILES_CLEANUP_ENABLED=false`, opt-in esplicito: azione
  distruttiva e irreversibile sul blob fisico, la riga DB resta sempre come
  traccia storica).
- Il progetto verticale segue lo stesso schema per i propri job notturni
  (pulizia dati, report, promemoria): `@Cron` se safe-per-replica, repeatable
  job BullMQ se il job ha side-effect che non devono duplicarsi o deve
  sopravvivere a restart.

---

## Email — Nodemailer

- SMTP configurato tramite variabili d'ambiente (`SMTP_HOST/PORT/USER/PASS/FROM`)
- Mai inviare email direttamente da un service — sempre tramite `src/queues/email-queue/`
- Mock obbligatorio nei test (nessun invio spurio)
- In sviluppo: Mailhog (`docker-compose.yml`, UI su `http://localhost:8025`)

---

## Variabili d'ambiente

> Fonte di verità: `.env.example` in root (non reinventare nomi qui).

### Backend
```
DATABASE_URL
REDIS_URL
POSTGRES_DB          (solo docker-compose.prod.yml: bootstrap container + ricalcolo DATABASE_URL)
POSTGRES_USER        (solo docker-compose.prod.yml)
POSTGRES_PASSWORD    (solo docker-compose.prod.yml)
SECURITY_KEY
COOKIE_SECRET
COOKIE_DOMAIN
JWT_EXPIRATION       (default 15m — stesso default in AppConstants e nello schema Joi di validazione)
RTK_EXPIRATION       (default 604800 secondi)
PORT                 (default 3000)
NODE_ENV
FRONTEND_URL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
SUPERADMIN_EMAIL
SUPERADMIN_PASSWORD
LOG_LEVEL
LOG_DIR
LOG_MAX_PER_SEC
STORAGE_DRIVER           (default 'local' — 'local' | 's3', vedi ADR-8)
STORAGE_LOCAL_PATH       (default 'storage', solo se STORAGE_DRIVER=local)
STORAGE_S3_ENDPOINT      (vuoto = AWS S3 reale, valorizzato = MinIO/altro provider S3-compatibile)
STORAGE_S3_REGION        (default 'us-east-1')
STORAGE_S3_BUCKET
STORAGE_S3_ACCESS_KEY_ID
STORAGE_S3_SECRET_ACCESS_KEY
STORAGE_MAX_FILE_SIZE_MB (default 20)
```

### Frontend
```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL      (base Socket.io per il push realtime della campanella — ADR-12;
                      se commentata la campanella resta funzionante via REST)
```

Tutte le variabili backend sono accessibili **solo** tramite `AppConstants` — mai
`process.env` diretto nel codice applicativo.

---

## Moduli backend (struttura cartelle)

```
app/backend/src/
├── auth/
├── admin/
├── common/
│   ├── export/      ← ExportService (ADR-10) — vedi sezione "Export liste/report"
│   └── observability/ ← Sentry opzionale (ADR-15) — vedi sezione "Osservabilità"
├── health/          ← GET /api/v1/health (Terminus) — vedi sezione "Health check"
│   └── indicators/
├── files/           ← storage documenti (ADR-8) — vedi sezione "Storage documenti"
│   ├── storage/     ← StorageDriver interface + LocalDiskDriver + S3CompatibleDriver
│   └── dto/
├── notifications/   ← campanella/badge (ADR-12) — vedi sezione "Notifiche"
│   └── dto/
├── metrics/         ← GET /metrics opzionale (ADR-15) — vedi sezione "Osservabilità"
├── mailer/
├── queues/
│   └── email-queue/
├── redis/
├── db/
├── realtime/        ← AppGateway (Socket.io), montato in app.module.ts dalla ADR-12
├── app.module.ts
└── main.ts
```

---

## Health check applicativo

- `GET /api/v1/health` (pubblico, escluso da `AuthMiddleware`) — modulo
  `app/backend/src/health/`, basato su **`@nestjs/terminus`**
  (`HealthCheckService` + `HealthIndicatorService`, API non deprecata — vedi
  `docs/ai/adr/ADR-7-health-check-terminus.md`)
- Tre check in parallelo, ognuno con timeout di 3000ms (`health-check.util.ts`,
  `withTimeout`) per non restare appeso a tempo indeterminato se una dipendenza è
  down (Redis/BullMQ usano `maxRetriesPerRequest: null`, corretto per l'uso
  applicativo normale ma pericoloso per un health check senza timeout esplicito):
  - `database` — `select 1` via Drizzle ORM (`DbService`)
  - `redis` — `PING` via `RedisService.ping()`
  - `bullmq` — stato connessione della coda `email-queue` (`queue.client.status === 'ready'`)
- Risposta **`200`** se tutti i check sono `up`, **`503`** se almeno uno è `down`
  (comportamento standard Terminus/`ServiceUnavailableException`, adatto a readiness
  probe k8s/Docker Swarm — vedi anche "Deploy — Docker" sotto) — a differenza di
  un endpoint "a mano" che risponde sempre `200`, l'orchestratore/monitoring esterno
  legge lo stato dallo status HTTP, non deve parsare il body
- Collezione Bruno: `bruno/health/Health Check.yml`

---

## Storage documenti — FilesModule

- Modulo `app/backend/src/files/` (`app/files`), decisione e alternative
  valutate in `docs/ai/adr/ADR-8-storage-abstraction-files.md`
- Astrazione `StorageDriver` (`upload`/`download`/`delete`): `FilesService` non
  conosce mai il driver concreto attivo, scelto in `files.module.ts` da
  `AppConstants.storageDriver`:
  - `local` (default sviluppo) — `LocalDiskDriver`, filesystem sotto
    `STORAGE_LOCAL_PATH`, zero dipendenze esterne
  - `s3` (produzione) — `S3CompatibleDriver` (`@aws-sdk/client-s3`), stesso
    client per AWS S3 reale e per un MinIO self-hosted/altro provider
    S3-compatibile (`STORAGE_S3_ENDPOINT` vuoto = AWS reale)
- Tabella `files`: metadata del blob (nome originale, mime type, dimensione,
  checksum SHA-256, driver e chiave di storage) — il blob vero e proprio vive
  solo nel driver, mai nel DB. `entity`/`entityId` (nullable) associano il file
  a un'entità di dominio del progetto verticale, riusando lo stesso pattern
  non-FK già adottato da `audit_log`
- Endpoint (`@Controller('app/files')`):
  - `POST /api/v1/app/files` — upload multipart (campo `file`), limite
    dimensione `STORAGE_MAX_FILE_SIZE_MB` (default 20MB)
  - `GET /api/v1/app/files/:guid` — download in streaming
  - `DELETE /api/v1/app/files/:guid` — soft-delete (`isActive=false`);
    consentito solo all'autore del file o a un ruolo Admin/superiore. Il blob
    fisico **non** viene rimosso subito (pulizia rimandata a un job futuro,
    per non rendere irreversibile un'operazione pensata come reversibile)
- Autorizzazione fine (chi può vedere/associare quale documento) resta compito
  del progetto verticale: lo starter-kit espone solo il building block generico
- Collezioni Bruno: `bruno/files/Upload File.yml`, `Download File.yml`, `Delete File.yml`

---

## Notifiche — NotificationsModule

- Modulo `app/backend/src/notifications/` (`app/notifications`), decisione e
  alternative valutate in `docs/ai/adr/ADR-12-notifiche-persistenti-realtime.md`
- Tabella `notifications`: mailbox persistente per-utente (`userId`, `type`,
  `title`, `message`, `link?`, `isRead`/`readAt`). Nessun `Utils.applyScopeFilter`:
  la visibilità è per singolo utente, non multi-tenant/multi-sede
- `NotificationsService.notify(targetUserId, input, authorUserId?)` è il
  building block esportato per i moduli di dominio del progetto verticale:
  scrive la riga e pusha `notification.new` via `AppGateway.emitToUser` se un
  client dell'utente è connesso. Lo starter-kit non contiene trigger propri
  (nessun endpoint pubblico per inviare notifiche arbitrarie)
- Endpoint self-service (`@Controller('app/notifications')`, nessun guard di
  ruolo — la barriera è l'appartenenza `userId`):
  - `GET /api/v1/app/notifications` (`?p&i&unreadOnly`) — lista paginata del chiamante
  - `GET /api/v1/app/notifications/unread-count` — per il badge
  - `PATCH /api/v1/app/notifications/:guid/read` — segna letta (guid di un
    altro utente → 404, mai 403: non conferma l'esistenza della riga)
  - `PATCH /api/v1/app/notifications/read-all` — segna tutte lette
- Frontend: hook `useNotifications` (`NotificationsProvider`, stesso pattern
  di `useAuth`) + componente `NotificationBell` (badge + dropdown), montati
  in `LayoutProtected` (sezione utente della sidebar, il layout non ha
  header). Il toast `notifications.show` resta per il feedback immediato,
  in aggiunta alla riga persistita, non al suo posto
- Collezioni Bruno: `bruno/notifications/List Notifications.yml`,
  `Unread Count.yml`, `Mark Read.yml`, `Mark All Read.yml`

---

## Export liste/report

- Modulo core `app/backend/src/common/export/` (`ExportService`), decisione
  e alternative valutate in `docs/ai/adr/ADR-10-export-liste-report.md`.
  Registrato come provider in `common.module.ts` (già `@Global()`, stesso
  pattern di `AuditLogService`): disponibile ovunque senza import espliciti,
  **nessun modulo/controller proprio**.
- `ExportService` non conosce alcuna entità di dominio, non esegue query
  proprie e non espone un endpoint proprio: è una libreria di serializzazione
  richiamata dal controller del modulo di dominio verticale che possiede già
  l'endpoint lista. Il modulo verticale continua a eseguire la stessa query
  filtrata con `Utils.applyScopeFilter(authInfo)` già usata per la risposta
  JSON paginata (`Pagination<T>`); quando la request chiede un formato
  diverso da `json` (convenzione: query param `?format=json|xlsx|pdf`), passa
  le righe già filtrate + una definizione colonne (`ExportColumn<T>[]:
  { header, key, width? }`) a `ExportService` invece di incapsularle in
  `Pagination<T>`. L'export non può quindi mai bypassare `applyScopeFilter`:
  non esiste una query parallela dedicata, solo un serializzatore diverso
  applicato alle stesse righe.
- **Excel** — `ExportService.toExcelBuffer(rows, columns, sheetName?)`:
  libreria `exceljs`, workbook in memoria (intestazione in grassetto +
  righe), restituisce un `Buffer` xlsx pronto per
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- **PDF** — `ExportService.toPdfBuffer(rows, columns, title?)`: libreria
  `pdfkit`, report tabellare semplice in formato A4 landscape con
  interruzione di pagina automatica — **nessun rendering HTML/CSS e nessun
  browser headless** (scelta deliberata rispetto a Puppeteer, vedi ADR-10:
  bundlare Chromium romperebbe l'immagine Docker Alpine minimale di ADR-6).
  Restituisce un `Buffer` pronto per `Content-Type: application/pdf`.
- Nessuna nuova tabella DB, nessuna nuova variabile d'ambiente: modulo
  stateless, genera un buffer per risposta HTTP, non persiste nulla.
- Nota sicurezza dipendenze: `exceljs@4.4.0` (ultima versione disponibile)
  dichiara una versione di `uuid` con una vulnerabilità nota moderata
  (transitiva, nessuna versione più recente di `exceljs` la risolve ad oggi
  — dettagli in ADR-10); da monitorare, non blocca l'uso del modulo.
- Test: `app/backend/test/unit/common/export/export.service.spec.ts` (6
  test contro le librerie reali, nessun mock).
- Nessuna collezione Bruno propria (il modulo non ha un endpoint): va
  aggiunta dal primo modulo di dominio verticale che adotta
  `?format=xlsx|pdf` sul proprio endpoint lista esistente.

---

## Osservabilità — Sentry (opzionale) + Prometheus `/metrics` (opzionale)

Prima di questa decisione l'unica osservabilità dello starter-kit era **Winston su file locale**
(rotazione giornaliera, redazione dati sensibili — vedi sezione "Logging" in
`docs/non-functional-requirements.md` e ADR-2). Questo non basta a chi ha
bisogno di alerting sugli errori di produzione o di un endpoint metriche per
uno stack di monitoring già esistente — da qui le due integrazioni seguenti,
entrambe **opt-in** (disattivate di default, zero impatto sui progetti che
non le abilitano):

- **Sentry (error tracking)** — `@sentry/node` (backend) + `@sentry/react`
  (frontend), attivabili rispettivamente con `AppConstants.sentryEnabled` e
  `VITE_SENTRY_ENABLED`. Si aggancia ai punti che già centralizzano gli
  errori, senza introdurre un meccanismo parallelo:
  - Backend: `AllExceptionsFilter` invia a Sentry solo le eccezioni 5xx
    (mai i 4xx), con `beforeSend` che riusa la stessa redazione dati
    sensibili già applicata da Winston.
  - Frontend: `ErrorBoundary` (crash di rendering) e l'interceptor Axios
    (ramo `status >= 500`) inviano a Sentry in aggiunta al comportamento
    già presente (`console.error`/`notifications.show`), mai in sostituzione.
  - Protocollo-compatibile con **GlitchTip** (alternativa self-hosted):
    cambiare provider è solo un cambio di DSN.
- **Prometheus `GET /metrics`** — modulo `app/backend/src/metrics/`
  (`prom-client`), attivabile con `AppConstants.metricsEnabled`. Path fuori
  dal prefisso `api/v1` (convenzione Prometheus) ed escluso da
  `AuthMiddleware` (uno scraper non ha un JWT applicativo): **non
  autenticato per compatibilità con lo scraping standard**, quindi va
  esposto solo su rete interna/allowlist IP a livello di reverse proxy se il
  progetto verticale lo abilita in un ambiente non fidato — stessa logica
  già applicata all'endpoint MinIO/S3 in ADR-8.

Variabili d'ambiente (`.env.example`):
```
SENTRY_ENABLED               default false
SENTRY_DSN                   default vuoto
SENTRY_ENVIRONMENT           default = NODE_ENV
SENTRY_TRACES_SAMPLE_RATE    default 0
METRICS_ENABLED              default false
VITE_SENTRY_ENABLED          default assente/false
VITE_SENTRY_DSN              default assente
```

Decisione e alternative valutate: `docs/ai/adr/ADR-15-observability-sentry-prometheus.md`.

---

## Porte di sviluppo

| Servizio | Porta |
|----------|-------|
| NestJS backend | 3000 |
| Vite frontend | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Mailhog UI | 8025 |

---

## CI/CD

- GitHub Actions, `.github/workflows/ci.yml` — trigger su `pull_request` verso
  `main`/`develop` + `workflow_dispatch` manuale; `concurrency` con
  `cancel-in-progress` per non accumulare run ridondanti sullo stesso branch
- `permissions: contents: read` a livello workflow (nessun job scrive su
  repo/PR): `GITHUB_TOKEN` limitato al minimo indispensabile (ADR-9)
- Job `backend` e `frontend` (**bloccanti**, in parallelo, nessuna dipendenza tra
  loro): `npm ci` → lint (`lint:backend`/`lint:frontend`) → test unitari
  (`--workspace=app/<stack>`, solo `test/unit/**`, nessun DB/Redis richiesto) →
  build (`build:backend`/`build:frontend`). Node 20 LTS.
- Job `backend-e2e` (**bloccante**, in parallelo agli altri): servizi Postgres
  (`app_db_test`) + Redis effimeri, poi `npm run test:e2e --workspace=app/backend`
  (migration applicate dalla suite stessa, `beforeAll` idempotente)
- Job `openapi-sync` (**opzionale**, `continue-on-error: true`, non blocca il
  merge): avvia servizi Postgres+Redis effimeri (stessa configurazione di
  `docker-compose.yml`), applica le migration, rigenera `docs/openapi.yaml` e
  `app/frontend/src/types/api.types.ts`, poi `git diff --exit-code` per segnalare
  drift rispetto al committato — richiede l'intera `AppModule` avviata, quindi è
  volutamente non bloccante (più fragile dei job lint/test/build)
- Decisione e alternative valutate: `docs/ai/adr/ADR-5-ci-cd-pipeline.md`

---

## Deploy — Docker

> `docker-compose.yml` (dev, invariato) copre solo i servizi di supporto (Postgres,
> Redis, Mailhog) — backend/frontend girano nativamente via `npm run dev`.
> `docker-compose.prod.yml` è un file **separato**, per l'ambiente di produzione.

- **`app/backend/Dockerfile`** — multi-stage (`deps` → `build` → `prod-deps` →
  `runtime`), immagine finale `node:20-alpine`, solo `dist/` + dipendenze di
  produzione, utente non-root `node`, `HEALTHCHECK` su `GET /api/v1/health`
  (`fetch` nativo Node 20, nessuna dipendenza aggiuntiva nell'immagine)
- **`app/frontend/Dockerfile`** — multi-stage (`deps` → `build` → `runtime`),
  build Vite → `nginx:1.27-alpine` (config in `app/frontend/nginx.conf`, fallback
  SPA `try_files ... /index.html`). `VITE_API_BASE_URL` è un **build-arg**: Vite la
  "bake-izza" nel bundle statico a build-time (comportamento standard
  `import.meta.env`), non è configurabile a runtime — cambiarla richiede di
  ricostruire l'immagine
- Contesto di build di entrambi i Dockerfile: la **root del monorepo** (non
  `app/backend/`/`app/frontend/`), perché `npm ci` con npm workspaces richiede i
  `package.json` di tutti i workspace
- **`docker-compose.prod.yml`**: `postgres` + `redis` (porte non pubblicate
  sull'host, solo rete Docker interna) + `backend` + `frontend` — **niente
  mailhog**, in produzione l'invio email usa SMTP reale (`SMTP_HOST/PORT/USER/
  PASS/FROM`). `DATABASE_URL`/`REDIS_URL` sono **ricalcolate dal compose**
  (non lette da `.env`) a partire da `POSTGRES_USER`/`POSTGRES_PASSWORD`/
  `POSTGRES_DB`, per evitare drift tra le due configurazioni. `depends_on:
  condition: service_healthy` per backend (attende postgres/redis `healthy`)
- Setup: `cp .env.example .env` (root, accanto a `docker-compose.prod.yml`),
  compilare i valori reali, poi `docker compose -f docker-compose.prod.yml up -d
  --build`
- TLS, dominio pubblico e reverse proxy sono **intenzionalmente fuori scope**:
  vanno aggiunti dall'ambiente di hosting (Traefik/nginx/load balancer del
  provider) davanti a `frontend`/`backend`
- Decisione e alternative valutate: `docs/ai/adr/ADR-6-containerizzazione-produzione.md`

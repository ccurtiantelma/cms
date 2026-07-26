# ADR-15 — Osservabilità opzionale: Sentry (error tracking) + endpoint Prometheus `/metrics`

## Status
[x] Approvato

## Data approvazione
2026-07-23 — approvato da: ccurti (via chat, richiesta esplicita di completare
il punto 9 di un'analisi precedente sul gap "solo Winston su file locale
oggi", con indicazione esplicita dell'approccio — Sentry opzionale
backend+frontend dietro `AppConstants`, e/o endpoint Prometheus `/metrics`,
entrambi opt-in per non appesantire i progetti piccoli — e richiesta esplicita
di aggiornare la documentazione a completamento; stesso filone di
ADR-8/9/10/11/12/13). **Approvazione npm ottenuta in un secondo momento**,
stesso giorno, via chat ("Implementa tutto ora"): installazione di
`@sentry/node`, `@sentry/react`, `prom-client` e implementazione completa
del codice applicativo — vedi Conformità per l'elenco file e l'esito di
test/lint/build.

## RFC di riferimento
Nessuna RFC dedicata. Punto 9 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso filone di ADR-6 = punto 2, ADR-7 = punto 3, ADR-8 = punto 4,
ADR-10 = punto 5, ADR-11 = punto 6, ADR-12 = punto 7, ADR-13 = punto 8).

## Contesto

Lo stato attuale dell'osservabilità dello starter-kit (`docs/non-functional-requirements.md`
→ Logging, `constitution.md` → Logging sicurezza) è: **solo Winston con
rotazione giornaliera su file locale** (`winston-daily-rotate-file`,
`WinstonLoggerService`), log strutturato JSON in produzione, redazione
automatica dati sensibili (`sanitizeLogData`). Nessun errore o eccezione viene
mai inviato fuori dal processo/container che lo genera.

Questo è sufficiente per un boilerplate generico in fase di bootstrap, ma
espone due gap concreti non coperti da nessuna decisione precedente:

1. **Nessuna aggregazione/alerting sugli errori di produzione.** Con la
   containerizzazione multi-replica introdotta da ADR-6, i log vivono nel
   filesystem del singolo container: senza un log shipper esterno (fuori
   scope dello starter-kit), un'eccezione 5xx catturata da
   `AllExceptionsFilter` finisce in un file che nessuno guarda finché
   qualcuno non va a cercarlo a mano nella replica giusta. Non c'è modo di
   sapere "è appena esploso qualcosa in produzione" senza accesso diretto al
   container.
2. **Nessun endpoint di metriche per chi ha già uno stack di monitoring.**
   Molte aziende che erediteranno questo starter-kit hanno già
   Prometheus/Grafana (o compatibili) in produzione per altri servizi: oggi
   non c'è alcun modo standard di esporre latenza/throughput/error-rate
   dell'app senza scriverlo da zero per ogni progetto verticale.

Il rischio di **non** agire su questi due punti è che ogni progetto verticale
reinventi la propria soluzione (integrazioni divergenti, DSN Sentry
hardcoded, endpoint metriche senza convenzioni). Il rischio di agire in modo
sbagliato è l'opposto: appesantire un boilerplate pensato per partire in
minuti con dipendenze e servizi esterni che un progetto piccolo non userà
mai. L'indicazione esplicita dell'umano ("da tenere opt-in per non
appesantire progetti piccoli") risolve il trade-off: entrambe le
integrazioni esistono nel codice ma sono **disattivate di default** e non
attive finché il progetto verticale non le abilita esplicitamente via env var.

## Decisione

Due moduli/integrazioni indipendenti, entrambi **opt-in, disattivati di
default**, nessun impatto sui progetti che non li abilitano:

### 1. Sentry (error tracking) — backend + frontend

- **Backend**: `@sentry/node` (non `@sentry/nestjs`: quest'ultimo abilita
  auto-instrumentation estesa di ogni richiesta/query, più difficile da
  controllare/auditare; per un boilerplate generico si preferisce
  l'inizializzazione minima e l'aggancio esplicito al punto che già
  centralizza ogni errore non gestito). Inizializzato in `main.ts` **solo
  se** `AppConstants.sentryEnabled`, prima di `bootstrap()`. Aggancio unico:
  `AllExceptionsFilter` (`app/backend/src/common/filters/all-exceptions.filter.ts`)
  chiama `Sentry.captureException(exception)` nel ramo `status >=
  INTERNAL_SERVER_ERROR` (mai per i 4xx — stesso confine già usato per
  distinguere `error`/`warn` nel logging Winston esistente, evita di
  affogare Sentry in rumore da validazione/auth). Configurazione `beforeSend`
  che riusa la stessa funzione di redazione (`sanitizeLogData`, già usata da
  Winston — vedi ADR-2) prima di inoltrare qualunque payload al SaaS esterno.
- **Frontend**: `@sentry/react`, inizializzato in `main.tsx`/entrypoint
  **solo se** `import.meta.env.VITE_SENTRY_ENABLED === 'true'` (stesso
  pattern già usato per `VITE_SOCKET_URL`: variabile assente/false = nessuna
  integrazione, zero richieste di rete verso Sentry). Due punti di aggancio,
  entrambi già esistenti, nessuna nuova superficie:
  - `ErrorBoundary` (`app/frontend/src/components/ErrorBoundary.tsx`,
    `componentDidCatch`) → `Sentry.captureException(error, { extra: errorInfo })`
    in aggiunta al `console.error` già presente, mai in sostituzione.
  - Interceptor Axios (`app/frontend/src/services/api.ts`, ramo `status >=
    500`) → `Sentry.captureException(error)` accanto al `notifications.show`
    già presente.
- Sentry è protocollo-compatibile con **GlitchTip** (alternativa self-hosted
  open-source): un progetto verticale che non vuole/può usare il SaaS Sentry
  può puntare lo stesso SDK a un'istanza GlitchTip propria cambiando solo il
  DSN — nessun lock-in al vendor.

### 2. Endpoint Prometheus `GET /metrics` — opzionale

- Nuovo modulo `app/backend/src/metrics/` (`MetricsModule`,
  `MetricsController`, `MetricsService`), libreria **`prom-client`** diretta
  (non `@willsoto/nestjs-prometheus`: wrapper aggiuntivo non necessario per
  un solo endpoint, stesso principio di minimalismo già seguito in ADR-10
  per l'export scartando Puppeteer).
- `MetricsService` registra `collectDefaultMetrics()` (CPU, memoria, event
  loop lag — metriche di processo standard) + un istogramma
  `http_request_duration_seconds` popolato da un interceptor NestJS globale
  leggero (solo se il modulo è attivo).
- `GET /metrics` **fuori** dal prefisso globale `api/v1` (convenzione
  Prometheus: il path standard è `/metrics`, non annidato sotto un prefisso
  applicativo) e **escluso da `AuthMiddleware`** (uno scraper Prometheus non
  ha un JWT applicativo) — registrato **solo se**
  `AppConstants.metricsEnabled`; se disattivato il modulo non viene neanche
  importato in `app.module.ts` e la rotta non esiste (404, non un 403 che
  confermerebbe l'esistenza della feature).
- **Nota di sicurezza esplicita** (da riportare anche in
  `system-architecture.md`): l'endpoint non è protetto da autenticazione
  applicativa per compatibilità con lo scraping standard Prometheus. Un
  progetto verticale che lo abilita in un ambiente esposto a rete non
  fidata **deve** restringerne l'accesso a livello di reverse
  proxy/network (allowlist IP dello scraper, o rete Docker interna non
  pubblicata) — stessa logica già applicata all'endpoint MinIO/S3 in ADR-8:
  lo starter-kit documenta il rischio, la mitigazione di rete è
  responsabilità del deployment verticale.

### AppConstants

```
sentryEnabled            bool,   default false
sentryDsn                string, default ''
sentryEnvironment        string, default = AppConstants.nodeEnv
sentryTracesSampleRate   number, default 0        (costo/rumore: parte da 0, opt-in esplicito per il tracing)
metricsEnabled           bool,   default false
```

Frontend (Vite, stesso pattern di `VITE_SOCKET_URL`):
```
VITE_SENTRY_ENABLED   default assente/false
VITE_SENTRY_DSN       default assente
```

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Sentry + Prometheus, entrambi opt-in dietro `AppConstants`** (scelta) | Percorso production-ready disponibile per chi ne ha bisogno, zero costo/footprint per chi non lo abilita; si aggancia ai seam già esistenti (`AllExceptionsFilter`, `ErrorBoundary`, interceptor Axios) invece di introdurre nuovi meccanismi paralleli | Due nuove famiglie di dipendenze npm da approvare separatamente | — |
| `@sentry/nestjs` (SDK con auto-instrumentation NestJS) invece di `@sentry/node` puro | Meno codice di wiring manuale, tracing automatico di ogni request/handler | Instrumenta di default molta più superficie (ogni query, ogni handler) di quanta ne serva per il solo error-tracking richiesto; più difficile da auditare cosa viene effettivamente inviato al SaaS esterno | Scartato: per un boilerplate generico il controllo esplicito su cosa viene inviato pesa più della comodità di auto-instrumentation |
| `@willsoto/nestjs-prometheus` invece di `prom-client` diretto | Provider NestJS pronti, meno boilerplate DI | Dipendenza aggiuntiva sopra `prom-client` per un solo endpoint e un solo istogramma; stesso principio "una libreria in meno se non serve" già seguito in ADR-10 | Scartato: overhead di astrazione non giustificato per l'uso minimo richiesto |
| Abilitare Sentry/Prometheus **di default** (sempre attivi) | Zero configurazione per chi li vuole | Ogni progetto piccolo si ritroverebbe dipendenze, DSN da configurare e un endpoint pubblico anche se non li usa mai — esplicitamente in contraddizione con l'indicazione dell'umano ("da tenere opt-in per non appesantire progetti piccoli") | Scartato per indicazione esplicita |
| Solo un log shipper esterno (es. Filebeat/Vector che legge i file Winston) senza Sentry | Nessun codice applicativo da mantenere, il progetto verticale resta libero di scegliere lo stack | Non risolve il gap "endpoint metriche standard" e richiede comunque una configurazione infrastrutturale (agente sidecar) che lo starter-kit non può includere; l'error-tracking via log parsing è più fragile e più lento (serve un giro aggregatore → alert) di una `captureException` diretta | Scartato: non copre entrambi i gap del punto 9, e non è "batteries included" quanto l'opzione scelta |
| Nessuna azione (restare solo su Winston file locale) | Zero lavoro, zero rischio di introdurre bug | Gap esplicitamente segnalato dall'umano al punto 9 dell'audit: nessuna via di alerting su errori di produzione multi-replica, nessun endpoint standard per chi ha già Prometheus/Grafana | Scartato: è esattamente il gap che questo ADR deve chiudere |

## Conseguenze

- **Positive**: percorso di osservabilità production-ready disponibile
  on-demand per i progetti verticali che ne hanno bisogno, senza costo per
  quelli che non lo abilitano; entrambe le integrazioni si agganciano a
  punti di errore/logging già esistenti e centralizzati
  (`AllExceptionsFilter`, `ErrorBoundary`, interceptor Axios), coerente con
  la Error Handling Policy della constitution invece di introdurre un
  meccanismo parallelo; Sentry resta protocollo-compatibile con
  alternative self-hosted (GlitchTip), nessun lock-in.
- **Negative / attenzione**:
  - `GET /metrics` è per convenzione **non autenticato**: un progetto
    verticale che lo abilita in un ambiente di rete non fidata deve
    restringerne l'accesso a livello di infrastruttura (reverse proxy/rete
    Docker interna) — lo starter-kit non aggiunge un guard applicativo
    sopra, altrimenti romperebbe la compatibilità con uno scraper
    Prometheus standard.
  - `beforeSend`/scrubbing lato Sentry deve riusare `sanitizeLogData` per
    non inviare dati sensibili (password/token/email/telefono) a un SaaS di
    terze parti: nuova responsabilità di codice da testare esplicitamente
    (non basta "non lo mando", va verificato con un test dedicato).
  - `sentryTracesSampleRate` parte da 0 (nessun tracing di performance, solo
    error capture) per evitare sorprese di costo quando un progetto
    verticale abilita Sentry: alzarlo resta una scelta esplicita del
    progetto verticale, non un default dello starter-kit.
  - Aggiunge due famiglie di variabili d'ambiente da mantenere allineate tra
    `.env.example`, `AppConstants` e validazione Joi in `app.module.ts`.
- **Documentazione**: aggiornati `docs/system-architecture.md` (sezione
  "Osservabilità", implementazione avvenuta), `docs/ai/progress-tracker.md`
  (riga passata a ✅ Done), `.env.example` (`SENTRY_ENABLED`, `SENTRY_DSN`,
  `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `METRICS_ENABLED`,
  `VITE_SENTRY_ENABLED`, `VITE_SENTRY_DSN`), collezione Bruno
  `bruno/metrics/Get Metrics.yml` + nuova variabile `serverUrl` in
  `bruno/environments/local.yml`.
  **Nota**: l'aggiornamento della sezione "Logging" di
  `docs/non-functional-requirements.md` per riflettere questa decisione
  **non può essere fatto da un'AI** (`docs/instructions.md` → tabella
  "Policy docs — chi scrive dove": questo file è bloccato per l'AI "❌ mai,
  nemmeno su richiesta") — resta un'attività che l'umano deve fare
  direttamente, se lo ritiene necessario.

## Conformità

- Backend: `app/backend/src/common/app-constants.ts` (nuove costanti
  `sentry*`/`metricsEnabled`), `app/backend/src/app.module.ts` (validazione
  Joi delle nuove env var, `MetricsModule` importato solo se
  `metricsEnabled`, `metrics` escluso da `AuthMiddleware`),
  `app/backend/src/main.ts` (`initSentry()` a inizio bootstrap, `metrics`
  escluso dal prefisso globale `api/v1`), `app/backend/src/common/observability/sentry.util.ts`
  (nuovo: `initSentry`/`captureException`/scrubbing `beforeSend`),
  `app/backend/src/common/filters/all-exceptions.filter.ts` (chiamata
  `captureException` sui soli 5xx), `app/backend/src/metrics/` (nuovo
  modulo: `metrics.module.ts`, `metrics.controller.ts` — `GET /metrics`,
  escluso da Swagger —, `metrics.service.ts` — registro `prom-client`
  dedicato + istogramma `http_request_duration_seconds` —,
  `metrics.interceptor.ts` — `APP_INTERCEPTOR` che popola l'istogramma,
  attivo solo se il modulo è importato).
- Frontend: `app/frontend/src/libs/sentry.ts` (nuovo: `initSentry`/
  `captureException`, gate su `VITE_SENTRY_ENABLED`), `app/frontend/src/vite-env.d.ts`
  (tipi `VITE_SENTRY_ENABLED`/`VITE_SENTRY_DSN`), `app/frontend/src/main.tsx`
  (chiamata `initSentry()` prima del render), `app/frontend/src/components/ErrorBoundary.tsx`
  (chiamata `captureException` in `componentDidCatch`, in aggiunta al
  `console.error` esistente), `app/frontend/src/services/api.ts` (chiamata
  `captureException` nel ramo `status >= 500` dell'interceptor).
- Test: `app/backend/test/unit/common/observability/sentry.util.spec.ts` (6
  test: no-op se disattivato/DSN vuoto, `Sentry.init` chiamato con i
  parametri attesi se abilitato, `captureException` gated dallo stesso
  flag, `beforeSend` rimuove header/cookie e redige `extra`/`user` senza
  toccare lo stacktrace), `app/backend/test/unit/common/filters/all-exceptions.filter.spec.ts`
  (2 test: `captureException` chiamato sui 5xx, mai sui 4xx),
  `app/backend/test/unit/metrics/metrics.service.spec.ts` (3 test, `prom-client`
  reale nessun mock: content-type, metriche di default, istogramma con le
  label attese), `metrics.controller.spec.ts` (1 test) e
  `metrics.interceptor.spec.ts` (2 test: registra la richiesta HTTP, ignora
  i contesti non-HTTP) — 14/14 verdi. Frontend:
  `app/frontend/src/libs/sentry.test.ts` (4 test equivalenti lato
  `@sentry/react`) — 4/4 verdi.
- Bruno: `bruno/metrics/Get Metrics.yml` (nuova variabile `serverUrl` in
  `bruno/environments/local.yml`, fuori dal prefisso `api/v1`).
- Come riverificare: `npm run build:backend && npm run lint:backend && npx
  jest test/unit/metrics test/unit/common/observability test/unit/common/filters
  --workspace=app/backend` (14/14 verdi) e `npm run build:frontend && npm run
  lint:frontend && npx vitest run src/libs/sentry.test.ts --workspace=app/frontend`
  (4/4 verdi). Suite complete: `npm run build && npm test` dalla root — 88
  test backend + 48 test frontend verdi, lint pulito su tutti i file
  toccati da questo ADR (restano solo warning/errori preesistenti non
  toccati da questo intervento, fuori scope). Verifica manuale end-to-end
  (avvio reale con `SENTRY_ENABLED=true`/`METRICS_ENABLED=true` contro un
  ambiente Postgres/Redis avviato) non eseguita in questa sessione — da
  fare al primo avvio reale del progetto verticale che abilita
  l'osservabilità.

# ADR-7 — Health check applicativo con @nestjs/terminus (DB + Redis + BullMQ)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-26 — approvato da: ccurti (via chat, approvazione retroattiva nell'ambito
della chiusura della gap analysis del 2026-07-23/26: l'health check Terminus era
già implementato e testato, ma l'ADR era rimasta in bozza)

## RFC di riferimento
Nessuna RFC dedicata. Punto 3 di un'analisi/audit richiesta esplicitamente dall'umano.

## Contesto

`GET /api/v1/health` esisteva già come controller di servizio con verifica manuale di
DB (`select 1` via Drizzle) e Redis (`SET` di una chiave), ma senza un framework
dedicato: nessuna distinzione tra check "bloccanti" e non, risposta sempre `200` anche
con dipendenze down (stato solo nel body, `status: 'degraded'`), nessun controllo sulla
coda BullMQ. Per un readiness probe di un orchestratore (k8s/Docker Swarm — vedi
ADR-6) o per uptime monitoring esterno, lo status HTTP conta più del body: un probe
che riceve sempre `200` non sa distinguere "tutto ok" da "degradato" senza parsare la
risposta.

`@nestjs/terminus` è la libreria ufficiale NestJS per gli health check: orchestratore
(`HealthCheckService`) che aggrega indicatori, restituisce `503` automaticamente se
anche un solo check è `down`.

## Decisione

Nuovo modulo `app/backend/src/health/` (sostituisce `app.controller.ts`, che conteneva
solo l'endpoint health — nessun'altra funzionalità persa):

```
src/health/
├── health.module.ts
├── health.controller.ts        (GET /health, @HealthCheck())
├── health-check.util.ts        (withTimeout — vedi sotto)
└── indicators/
    ├── drizzle.health-indicator.ts   (select 1 via Drizzle)
    ├── redis.health-indicator.ts     (PING via RedisService, nuovo metodo `ping()`)
    └── bullmq.health-indicator.ts    (stato connessione coda `email-queue`)
```

Indicatori custom scritti con `HealthIndicatorService` (`healthIndicatorService.check(key).up()/.down()`),
**non** con la classe `HealthIndicator`/`HealthCheckError` mostrata in molti esempi
online: quel pattern risulta `@deprecated` nella versione installata
(`@nestjs/terminus@11.1.1`, "sarà rimosso nella prossima major") — scelta la API non
deprecata per un boilerplate pensato per essere riusato per anni (constitution,
"Long Term Maintainability").

**Bug scoperto e corretto durante l'implementazione (non ipotetico — riprodotto con
Redis fermato via `docker stop`)**: `RedisService`/la connessione BullMQ usano
`maxRetriesPerRequest: null` (corretto per il loro uso normale come session
store/coda — retry indefinito invece di fallire una richiesta applicativa). Applicato
tal quale a un health check, questo significa che con Redis down la richiesta HTTP
resta **appesa a tempo indeterminato** invece di fallire — inaccettabile per una
readiness probe. Corretto avvolgendo ogni check con `withTimeout` (`health-check.util.ts`,
3000ms hardcoded, non configurabile via env: valore interno di sicurezza, non un
parametro di prodotto — evita di aggiungere superficie di configurazione non
richiesta).

`GET /health` resta pubblico (escluso da `AuthMiddleware`, invariato in
`app.module.ts`).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **`@nestjs/terminus` + `HealthIndicatorService`** (scelta) | Standard NestJS, `503` automatico su check down, estensibile (nuovi indicatori futuri) | Nuova dipendenza npm (richiede approvazione — ottenuta) | — |
| Tenere l'implementazione manuale esistente, solo aggiungere il check BullMQ | Zero nuove dipendenze | Nessuna standardizzazione, `200` anche se down (comportamento sbagliato per un readiness probe), va scritta a mano la logica di aggregazione che Terminus offre già | Scartato: il problema principale (status HTTP sempre 200) non si risolve senza toccare comunque tutta la logica |
| `@nestjs/terminus` con la classe classica `HealthIndicator`/`HealthCheckError` | Pattern più diffuso negli esempi/tutorial online | Deprecato in v11.1.1, rimozione annunciata nella prossima major | Scartato per manutenibilità a lungo termine (vedi Contesto) |
| Nessun timeout sui check (fidarsi del comportamento di default di ioredis/BullMQ) | Meno codice | Riprodotto concretamente: richiesta appesa a tempo indeterminato con Redis down, readiness probe inutilizzabile | Scartato dopo verifica pratica, non solo teorica |

## Conseguenze

- **Positive**: `GET /api/v1/health` ora risponde `503` (non più sempre `200`) quando
  almeno una dipendenza è down, con dettaglio per-check nel body; nuovo check sulla
  coda BullMQ (`email-queue`) assente prima; tempo di risposta limitato a ~3s anche
  con dipendenze irraggiungibili (verificato: DB down → fail-fast via `ECONNREFUSED`,
  Redis/BullMQ down → timeout a 3000ms).
- **Negative / attenzione**: consumer esistenti dell'endpoint (se presenti) che si
  aspettassero sempre `200` con `status: 'degraded'` nel body vanno aggiornati — nessun
  consumer noto al momento (nessuna chiamata a `/health` trovata fuori da Bruno/test).
  Il timeout di 3000ms è hardcoded: se in futuro serve renderlo configurabile per
  ambiente, richiede una nuova variabile in `AppConstants`/`.env.example` (non fatto
  ora, valutato over-engineering per l'esigenza attuale).
- **Documentazione**: aggiornati su richiesta esplicita: `docs/system-architecture.md`
  (sezione health check), `docs/ai/progress-tracker.md`. Nuova collezione Bruno
  `bruno/health/Health Check.yml` (endpoint modificato, regola CLAUDE.md).

## Conformità

- File: `app/backend/src/health/**`, `app/backend/src/redis/redis.service.ts` (aggiunto
  `ping()`), `app/backend/src/app.module.ts` (rimosso `AppController`, aggiunto
  `HealthModule`), rimosso `app/backend/src/app.controller.ts`.
- Test: `app/backend/test/unit/health/*.spec.ts` (4 file — util timeout + 3
  indicatori, 11 test, mock diretti senza `TestingModule` per coerenza con lo stile
  esistente in `test/unit/auth/auth.service.spec.ts`).
- Verifica manuale eseguita (Postgres/Redis temporanei isolati, rimossi al termine):
  `GET /health` con tutte le dipendenze up → `200`, `status: "ok"`; Redis fermato →
  `503` in ~3s con `redis`/`bullmq` a `down`; Postgres fermato → `503` quasi immediato
  (`ECONNREFUSED`, nessun timeout necessario). `npm run build:backend`, `npm run
  lint:backend` e l'intera suite `test/unit` (32/32) verdi dopo le modifiche.
- Come riverificare: `npm run build:backend && npm run lint:backend && npx jest
  test/unit/health --workspace=app/backend` (o dalla root con `--prefix app/backend`).

### Addendum 2026-07-26 — test di integrazione

Aggiunto `app/backend/test/e2e/health.e2e-spec.ts` (2 test, `AppModule` reale
contro Postgres/Redis di test, nessun mock sugli indicatori): happy path
(`200`, tutti gli indicatori `up`) e verifica di regressione mirata che
l'endpoint resti raggiungibile senza JWT (non `401`) — mancava una copertura
automatica di questo secondo aspetto, a differenza della verifica manuale
già fatta in precedenza.

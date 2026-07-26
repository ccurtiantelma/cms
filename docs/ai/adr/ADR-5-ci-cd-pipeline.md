# ADR-5 — Pipeline CI/CD (GitHub Actions): lint+test+build+e2e su PR, gate opzionale su sync OpenAPI

## Status
[x] In discussione · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
N/D — in attesa di approvazione umana (bozza generata da AI, vedi `docs/instructions.md` →
"Policy docs — chi scrive dove": gli ADR sono generati su richiesta e attendono
approvazione, mai auto-approvati)

## RFC di riferimento
Nessuna RFC dedicata. Segue direttamente da ADR-3, che aveva scartato "Docker Compose
effimero per E2E" motivando: *"Richiede pipeline CI/CD non ancora definita; fuori
scope. Rimandato a follow-up"* — questo ADR è quel follow-up.

## Contesto

Il repository non aveva alcuna pipeline CI/CD (`.github/workflows/` assente): lint,
test e build venivano eseguiti solo localmente, senza alcun controllo automatico prima
del merge di una PR. Rischi concreti osservati:
- Una PR può introdurre errori di lint, test falliti o build rotta senza che nessuno
  se ne accorga fino al deploy.
- `docs/openapi.yaml` e `app/frontend/src/types/api.types.ts` sono generati
  (`npm run openapi:export` / `openapi:types`) ma **committati a mano** — possono
  driftare rispetto al codice reale (nuovo endpoint/DTO) senza alcun avviso
  automatico, violando "Documentation Policy" della constitution ("ogni modifica
  significativa deve aggiornare i contratti API").

Durante l'implementazione è emerso anche un secondo problema, indipendente dalla CI in
sé: `app/frontend/src/types/api.types.ts` (generato da `openapi-typescript`, quoting a
doppi apici) veniva lintato dalla regola `prettier/prettier` (quoting a apice singolo
del progetto), causando ~137 errori fissi su un file che nessuno modifica a mano — la
CI non sarebbe mai passata a prescindere dal codice applicativo. Risolto escludendo il
file generato dal linting in `app/frontend/eslint.config.js` (stesso principio già
applicato a `docs/openapi.yaml`/`api.types.ts` nel `.gitignore`: "generato, non
modificare a mano" → di conseguenza anche "non lintare a mano").

## Decisione

Pipeline GitHub Actions minima in `.github/workflows/ci.yml`, quattro job:

1. **`backend`** — su push del trigger (PR verso `main`/`develop`): `npm ci` → lint
   (`lint:backend`) → test unitari (`npm run test --workspace=app/backend`, solo
   `test/unit/**`, nessun DB/Redis richiesto) → build (`build:backend`). Node 20 LTS
   (stack immutabile, constitution).
2. **`frontend`** — stessa sequenza su `app/frontend` (Vitest), in parallelo al job
   `backend` (nessuna dipendenza tra i due).
3. **`backend-e2e`** — **bloccante**, in parallelo agli altri job: servizi Postgres
   (`app_db_test`) + Redis effimeri (stessa configurazione attesa da
   `test/e2e/setup/env.setup.ts` e dalle guardie `assertTestDatabase`/
   `assertTestRedisDb` in ADR-3), poi `npm run test:e2e --workspace=app/backend`. Le
   migration vengono applicate dalla suite stessa (`runMigrations()` in
   `beforeAll`, idempotente) — nessuno step di migrate separato necessario.
   Verificato manualmente prima di aggiungerlo alla pipeline (34/34 test passati con
   container Postgres/Redis puliti, isolati da qualunque dato di sviluppo).
4. **`openapi-sync`** — gate **opzionale** (`continue-on-error: true`, non blocca il
   merge): avvia servizi Postgres+Redis effimeri (stessa configurazione di
   `docker-compose.yml`), applica le migration, rigenera `docs/openapi.yaml` e
   `api.types.ts`, poi `git diff --exit-code` per segnalare drift rispetto al
   committato. Informativo, non bloccante, perché richiede di avviare l'intera
   `AppModule` (Postgres/Redis reali) — più fragile dei job lint/test/build e non deve
   poter bloccare una PR per un problema infrastrutturale della CI stessa.

`backend-e2e` è invece **bloccante** (a differenza di `openapi-sync`): a differenza del
controllo di drift OpenAPI, valida comportamento applicativo reale (auth JWT,
isolamento DB/Redis) — la Testing Policy della constitution lo elenca tra i test
obbligatori, quindi un fallimento qui deve impedire il merge.

Trigger: `pull_request` verso `main`/`develop` + `workflow_dispatch` manuale.
`concurrency` con `cancel-in-progress` per non accumulare run ridondanti sullo stesso
branch.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **4 job come sopra** (scelta) | Feedback rapido e parallelo per stack; e2e bloccante dove serve davvero (comportamento reale), gate OpenAPI informativo dove la fragilità infra non deve bloccare | I job `backend-e2e`/`openapi-sync` richiedono servizi Postgres/Redis in CI (più lento, ~30-60s in più a job) | Compromesso accettabile e verificato: e2e testato manualmente (34/34 verdi) prima di renderlo bloccante |
| Job unico sequenziale (lint+test+build di entrambi gli stack in un job) | Config più semplice | Feedback più lento (no parallelismo), un fallimento frontend blocca il segnale sul backend | Contrasta con richiesta esplicita "in parallelo backend/frontend" |
| Gate OpenAPI bloccante (non `continue-on-error`) | Garanzia forte di sync | Richiede Postgres/Redis sempre disponibili in CI; un flake infrastrutturale blocca PR legittime | Troppo fragile per un gate ancora "opzionale" da richiesta esplicita |
| Lasciare i test E2E (`test:e2e`) fuori dalla CI (scelta iniziale di questo ADR) | Pipeline più snella | Copertura d'integrazione reale (auth JWT, isolamento DB/Redis) assente dal gate automatico | Superata su richiesta esplicita: aggiunto come job `backend-e2e` bloccante dopo verifica manuale |

## Conseguenze

- **Positive**: ogni PR ha un segnale automatico su lint/test/build per entrambi gli
  stack, in parallelo, più un vero test di integrazione (`backend-e2e`, bloccante:
  auth JWT, isolamento DB/Redis, guardie anti-truncate su dati di sviluppo); drift
  silenzioso tra codice e `docs/openapi.yaml`/tipi frontend ora viene segnalato (anche
  se non bloccato); bug preesistente di lint sul file generato risolto stabilmente
  (non si ripresenterà a ogni rigenerazione).
- **Negative / attenzione**: il job `openapi-sync` resta non bloccante — un drift
  reale può comunque essere mergiato se nessuno guarda l'esito del job opzionale; da
  rivalutare (renderlo bloccante) quando la pipeline sarà rodata. `backend-e2e`
  aggiunge ~30-60s a ogni run di CI e richiede servizi Postgres/Redis disponibili nel
  runner — un flake infrastrutturale qui blocca la PR (accettato perché è comportamento
  applicativo reale, non solo freshness di un file generato).
- **Documentazione**: nessun impatto su `business-rules.md` (nessuna regola di dominio
  toccata). Aggiornati su richiesta esplicita dell'umano (vedi
  `docs/instructions.md` → "Policy docs — chi scrive dove", livello "su richiesta
  esplicita"): `docs/system-architecture.md` (sezione "CI/CD"), `docs/RUNBOOK.md`
  (sezione + checklist CI), `docs/GUIDA_UTILIZZO.md` (sezione "CI" in Sviluppo
  quotidiano), `docs/ai/progress-tracker.md` (riga pipeline CI/CD).
- **CLAUDE.md**: la regola "Never do → Scrivere codice fuori da `app/` o `bruno/`" è
  stata chiarita (non modificata nella sostanza) per escludere esplicitamente i file
  di tooling/config di root (`package.json`, `docker-compose.yml`,
  `.github/workflows/`, ecc.), che non hanno mai potuto vivere altrove.

## Conformità

- Pipeline: `.github/workflows/ci.yml` (job `backend`, `frontend`, `backend-e2e`,
  `openapi-sync`).
- Fix lint file generato: `app/frontend/eslint.config.js` (`ignores:
  ['src/types/api.types.ts']`).
- Verifica e2e: eseguita manualmente prima del merge con Postgres/Redis effimeri
  isolati (porte non standard, nessuna interferenza con ambienti di sviluppo) —
  34/34 test passati (`settings`, `auth`, `sanity-isolation`).
- Verifica pipeline: aprire una PR di test verso `main`/`develop` e controllare i 4
  check nella tab "Checks" di GitHub (`backend`/`frontend`/`backend-e2e` bloccanti,
  `openapi-sync` informativo).

# ADR-9 — Remediation vulnerabilità dipendenze (drizzle-orm, nodemailer, vite/vitest, overrides)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-23 — approvato da: ccurti ("procedi con tutto" sul report iniziale;
successive correzioni di rotta su vite/vitest e overrides richieste
esplicitamente dallo stesso, vedi Contesto/Decisione).

## RFC di riferimento
Nessuna RFC dedicata. Nato da una verifica generale richiesta esplicitamente
dall'umano dopo l'implementazione di ADR-8 ("fai una verifica ora... se il
codice è corretto, ci sono errori, test che non vanno, permessi mancanti").

## Contesto

La verifica ha rilevato `npm audit`: 13 vulnerabilità (7 moderate, 5 high, 1
**critical**). La critical (`vitest`/`@vitest/mocker`/`vite-node`: lettura ed
esecuzione arbitraria di file quando il server UI di Vitest è in ascolto) e la
maggior parte delle high (`drizzle-orm` SQL injection su identificatori mal
escaped, `nodemailer` SMTP command injection/SSRF/CRLF injection multiple,
`undici` request smuggling) richiedevano upgrade major, quindi bloccate
dall'AI Governance ("aggiornare dipendenze npm senza autorizzazione") finché
non esplicitamente autorizzate.

La verifica ha inoltre trovato, come effetti collaterali indipendenti dalle
vulnerabilità ma scoperti nello stesso passaggio:
- `.github/workflows/ci.yml` senza blocco `permissions:` (nessun job scrive su
  repo/PR, quindi `GITHUB_TOKEN` girava con permessi di default invece del
  minimo indispensabile)
- `docs/openapi.yaml`/`app/frontend/src/types/api.types.ts` non rigenerati
  dopo l'introduzione di `FilesModule` (ADR-8) — passaggio "obbligatorio dopo
  ogni feature con endpoint nuovi" (CLAUDE.md) saltato per errore

**Prima iterazione (superata)**: il primo tentativo di remediation ha
applicato `npm audit fix --force` portando `vite` a 8.1.5 e `vitest` a 4.1.10
(major Rolldown-based, salto di più major in un colpo solo). L'umano ha
richiesto correttamente di fare marcia indietro: quel salto era eccessivo per
un boilerplate che deve restare su stack di build maturi, e aveva già
richiesto un workaround (`manualChunks` a funzione invece che oggetto) —
segnale che si stava uscendo dal percorso "stabile". Contestualmente, `npm
audit fix --force` aveva anche **contaminato** `package.json` di root e del
backend, aggiungendo `drizzle-orm`/`drizzle-kit`/`nodemailer` (pacchetti
solo-backend) come dipendenze dirette del root e `vite`/`vitest` (pacchetti
solo-frontend) come dipendenze dirette del backend — bug di risoluzione npm
in un monorepo a workspace con `audit fix --force`, non un problema dei
pacchetti in sé. Corretto rimuovendo le righe estranee da ciascun
`package.json` prima di procedere.

## Decisione

**Upgrade applicati e verificati** (uno alla volta, rebuild/retest dopo
ciascuno):
- `drizzle-orm` 0.36.0 → 0.45.2, `drizzle-kit` 0.27.0 → 0.31.10 (bump
  automatico per compatibilità peer) — nessuna modifica di codice richiesta
- `nodemailer` 6.9.10 → 9.0.3 — API `createTransport`/`Transporter`/
  `SendMailOptions` invariata, nessuna modifica di codice richiesta
- `openapi-typescript` 6.7.4 → 7.13.0 (root) — nessuna modifica di codice
  richiesta, solo rigenerazione di `api.types.ts` (formato di output più
  verboso ma stesso contenuto)
- **`vite` 5.4.0 → 6.4.3, `vitest` 2.1.9 → 3.2.7** (frontend, versione
  definitiva dopo la correzione di rotta): scelta deliberatamente **non**
  la 5.4.x richiesta alla lettera, ma la patch più recente della 6.x — l'ultima
  linea a usare ancora Rollup nativo (Rolldown diventa default solo da Vite 7),
  quindi **nessun workaround su `manualChunks`** (tornato alla forma oggetto
  originale). `vite <=6.4.2` e `vitest <=3.2.5` risultano entrambi nel range
  vulnerabile della critical/high: 6.4.3/3.2.7 sono le prime patch **fuori**
  da quel range, quindi restano "mature" (niente Rolldown) mentre chiudono
  comunque la vulnerabilità — miglior compromesso tra le due richieste
  (stabilità e remediation) rispetto a un rollback letterale a 5.4.x/2.x, che
  avrebbe lasciato la critical aperta.
- **`overrides` in root `package.json`** (npm, non "resolutions" che è
  sintassi Yarn) per `esbuild` e `js-yaml`, senza toccare le versioni dirette
  di `drizzle-kit`/`openapi-typescript` che li richiedono come transitivi:
  - `esbuild`: prima tentativo con l'ultima versione assoluta (`^0.28.1`) →
    **build frontend rotta** (`Transform failed: Transforming destructuring
    to the configured target environment ... is not supported yet`), perché
    Vite 6.4.3 dichiara esplicitamente `esbuild: ^0.25.0` come dipendenza
    testata. Corretto forzando `^0.25.12` (ultima patch della linea che Vite
    stesso dichiara compatibile) — build tornata verde.
  - `js-yaml`: forzato a `^4.3.0` (prima patch dopo il range vulnerabile
    `4.0.0 - 4.2.0`), usato sia dal backend (dipendenza diretta, `js-yaml`
    per l'export di `docs/openapi.yaml`) sia transitivamente da
    `@redocly/openapi-core` (usato da `openapi-typescript`).
  - **Risultato**: `npm audit` → **0 vulnerabilità** (era 13).

**Correzioni collaterali** (dalla verifica iniziale, invariate):
- Aggiunto `permissions: contents: read` a livello workflow in
  `.github/workflows/ci.yml`
- Rigenerati `docs/openapi.yaml` (`npm run openapi:export`) e
  `app/frontend/src/types/api.types.ts` (`npm run openapi:types`), ora
  allineati a `FilesModule`

**Verifica end-to-end contro DB reale** (richiesta esplicitamente
dall'umano per confermare `drizzle-orm` 0.45.2 in condizioni reali, non solo
unit test con mock):
- Ambiente Docker temporaneo creato ad-hoc (porte alternative, **senza
  toccare** `docker-compose.yml` committato): container Postgres dedicato
  `starter-kit-e2e-postgres` su porta `5433` (`app_db_test`); Redis riusato dal
  container già attivo di un altro progetto su questa macchina
  (`redis://localhost:6379/1`, stesso pattern già documentato in
  [[project_dev_environment_ports]])
- Suite e2e esistente (`test/e2e/*.e2e-spec.ts`, migrazioni applicate dalla
  suite stessa): **34/34 test verdi** contro Postgres reale — auth, settings,
  isolamento
- Verifica mirata aggiuntiva sulla tabella `files` (non coperta da nessuna
  suite e2e esistente, introdotta solo in ADR-8): script temporaneo
  (creato ed eliminato subito dopo l'uso, mai committato) che ha eseguito
  contro `app_db_test` reale: insert, lettura via relational query API
  (`db.query.fileEntity.findFirst`), lettura con `with: { createdByUser }`
  (join sulla relation), update (soft-delete), delete — **tutti riusciti**
  senza errori con `drizzle-orm` 0.45.2
- Container temporaneo fermato e rimosso a fine verifica (nessuno stato
  residuo lasciato sull'ambiente Docker della macchina)

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **vite 6.4.3 / vitest 3.2.7 + overrides mirati** (scelta finale) | Chiude tutte le vulnerabilità (0 residue), resta su Rollup nativo (nessun workaround), aggiornamento incrementale di una sola major invece di due | Richiede comunque un salto di major (5→6, 2→3), non un rollback puro | — |
| Rollback letterale a vite 5.4.21 / vitest 2.1.9 (richiesta iniziale letterale) | Zero salti di major dalla baseline pre-audit | Verificato: **non chiude la critical** (`vitest <=3.2.5` e `vite <=6.4.2` restano nel range vulnerabile qualunque patch 5.x/2.x si scelga) | Scartato: contraddirebbe l'altra richiesta esplicita di non lasciare vulnerabilità irrisolte |
| `esbuild` override all'ultima versione assoluta (0.28.1) | Massima "freschezza" della patch | Build frontend rotta (esbuild 0.28.x rompe la transpilazione destructuring per i target browser configurati da Vite 6) | Scartato dopo verifica concreta (non ipotetica): sostituito con `^0.25.12`, la linea che Vite 6.4.3 dichiara di supportare |
| Lasciare `esbuild`/`js-yaml` irrisolti (come nella prima iterazione) | Nessun rischio di rompere `drizzle-kit`/`openapi-typescript` | L'umano ha esplicitamente chiesto di non lasciarle irrisolte | Scartato su richiesta esplicita — risolto con `overrides` mirati invece che upgrade dei pacchetti che li richiedono |

## Conseguenze

- **Positive**: **0 vulnerabilità** (`npm audit`, era 13: 7 moderate, 5 high, 1
  critical). Stack di build frontend rimasto su Rollup nativo (nessun
  workaround strutturale). CI ora rispetta il principio del privilegio minimo
  sul `GITHUB_TOKEN`. `docs/openapi.yaml`/`api.types.ts` riallineati al codice
  reale. `drizzle-orm` 0.45.2 verificato concretamente contro Postgres reale
  (34 e2e esistenti + verifica mirata sulla tabella `files`), non solo con
  mock nei unit test.
- **Negative / attenzione**: gli `overrides` (`esbuild` ^0.25.12, `js-yaml`
  ^4.3.0) vanno **rivisti alla prossima major bump** di `drizzle-kit` o
  `openapi-typescript`: se in futuro quei tool si aggiornano e dichiarano una
  versione di `esbuild`/`js-yaml` diversa, l'override potrebbe forzare una
  combinazione mai testata a monte. Nessun impatto negativo trovato in questa
  sessione, ma è debito tecnico da tracciare (rivedere gli `overrides` ad ogni
  futuro upgrade di quei due tool). Il container Postgres di verifica e2e era
  temporaneo e non persiste: chi vorrà rieseguire l'e2e in locale dovrà
  ricrearlo (comando in Conformità).
- **Documentazione**: questo ADR (riscritto per riflettere l'esito finale);
  `docs/ai/progress-tracker.md`.

## Conformità

- File: `package.json` (root — solo `overrides` + `devDependencies` originali,
  ripulito dalla contaminazione di `audit fix --force`), `package-lock.json`,
  `app/backend/package.json` (drizzle-orm, drizzle-kit, nodemailer — ripulito
  da `vite`/`vitest` iniettati per errore), `app/frontend/package.json`
  (vite 6.4.3, vitest 3.2.7 — ripulito da drizzle-orm/drizzle-kit/nodemailer
  iniettati per errore), `app/frontend/vite.config.ts` (`manualChunks`
  tornato a oggetto), `.github/workflows/ci.yml` (blocco `permissions`),
  `docs/openapi.yaml`, `app/frontend/src/types/api.types.ts` (rigenerati).
- Verifica eseguita: `npm run build` (backend+frontend) ✓, `npm run lint`
  (backend+frontend) ✓ (solo warning pre-esistenti), `npm run test`
  (backend+frontend) — 88/88 test verdi (44 backend + 44 frontend), `npx
  drizzle-kit generate` — nessuna migrazione spuria (schema invariato),
  `npm run openapi:types` ✓. `npm audit` → **0 vulnerabilità**.
  E2E reale: 34/34 test verdi (`test/e2e/*.e2e-spec.ts`) contro Postgres
  temporaneo + verifica mirata sulla tabella `files` (insert/query
  relazionale/relations/soft-delete/delete, tutti riusciti).
- Come riverificare (rebuild completo + e2e reale):
  ```
  npm audit
  npm run build && npm run lint
  npm run test --workspace=app/backend && npm run test --workspace=app/frontend
  docker run -d --name starter-kit-e2e-postgres -e POSTGRES_DB=app_db_test \
    -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -p 5433:5432 postgres:16
  cd app/backend && DATABASE_URL="postgresql://app:app@localhost:5433/app_db_test" \
    REDIS_URL="redis://localhost:6379/1" NODE_ENV=test \
    npx jest --config ./test/e2e/jest-e2e.json --runInBand --forceExit
  docker stop starter-kit-e2e-postgres && docker rm starter-kit-e2e-postgres
  ```

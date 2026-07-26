# ADR-3 — Standard test E2E isolati e Lint/Format asimmetrico nel monorepo

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-17 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
Nessuna RFC dedicata nello starter-kit — decisione ereditata da
`docs/ai/rfc/RFC-2-standard-e2e-lint-format.md` di `cima-infortunistica` (non portata
come file separato in questo repo) e adattata al monorepo generico.

## Contesto

Il monorepo starter-kit necessita, fin dalla sua base, di una convenzione per test E2E
isolati dal DB/Redis di sviluppo e di uno standard di lint/format condiviso tra backend
e frontend — per evitare che ogni progetto verticale reinventi questa infrastruttura.

## Decisione

### Isolamento suite E2E — estensione `.e2e-spec.ts`
Tutti i test end-to-end del backend vivono in `app/backend/test/e2e/`, con naming
`*.e2e-spec.ts`, config Jest dedicata (`app/backend/test/e2e/jest-e2e.json`,
`testRegex` mirato alla sola estensione) ed eseguiti tramite `npm run test:e2e`
(`--runInBand --forceExit`), separati dalla suite unitaria (`*.spec.ts`, mockata,
invariata).

### Database di test dedicato e Redis DB logico separato, con guardie di sicurezza
- `DATABASE_URL` di test deve puntare esplicitamente a un database dedicato
  (es. `app_db_test`, mai `app_db` di sviluppo); `REDIS_URL` di test al DB logico
  Redis **#1** (mai il DB **#0** di sviluppo).
- `assertTestDatabase` (`db-test.helper.ts`) e `assertTestRedisDb`
  (`redis-test.helper.ts`) verificano rispettivamente nome DB e indice Redis
  effettivi **prima** di ogni `TRUNCATE`/`FLUSHDB`, lanciando un'`Error` bloccante
  in caso di mismatch — nessun'operazione distruttiva è possibile contro il DB/Redis
  di sviluppo.
- `test/e2e/setup/env.setup.ts` valorizza `process.env` in `setupFiles` (non
  `setupFilesAfterEnv`), prima di qualunque import di `AppConstants`/`AppModule`,
  per garantire che i valori di test abbiano sempre priorità sul `.env` di sviluppo.

### Network mock per Nodemailer
`test/e2e/setup/network-mocks.setup.ts` (in `setupFilesAfterEnv`) sostituisce
globalmente `nodemailer.createTransport` con un transporter stub deterministico
(nessuna connessione SMTP reale, coerente con `constitution.md` → "Mock obbligatori
per servizi esterni"). Spy (`networkMocks`) esposti per assertion nei test;
`resetNetworkMocks()` richiamato in `afterEach` per evitare leak di stato tra test.
Il progetto verticale estende questo file se introduce altri servizi esterni
(es. generazione PDF, storage esterno) da mockare nello stesso modo.

### ESLint asimmetrico
- **Backend** (`app/backend/eslint.config.mjs`): **ESLint v10** +
  `eslint-plugin-jsdoc` con `jsdoc/require-jsdoc` (`publicOnly: true`) —
  enforcement automatico della direttiva CLAUDE.md "Ogni funzione pubblica con
  commento JSDoc".
- **Frontend** (`app/frontend/eslint.config.js`): **ESLint v9** (non v10, per
  compatibilità con l'ecosistema plugin React 19 — in particolare
  `eslint-plugin-react-hooks` — al momento dell'implementazione) +
  `eslint-plugin-react`, `-react-hooks`, `-react-refresh`.
- `.prettierrc` dedicato per stack; script npm uniformi a livello di root: `lint`,
  `lint:backend`, `lint:frontend`, `format`, `format:backend`, `format:frontend`.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Guardie applicative + estensione dedicata** (scelta) | Nessuna nuova infrastruttura; blocco immediato a runtime; riusabile nel boilerplate | Non protegge chi bypassa gli helper con client raw | — |
| DB/Redis condivisi dev+test, reset manuale | Zero setup aggiuntivo | Rischio concreto di `TRUNCATE`/`FLUSHDB` su dati di sviluppo; non riproducibile in CI | Troppo rischioso |
| Docker Compose effimero per E2E | Isolamento totale, riproducibile | Richiede pipeline CI/CD non ancora definita; fuori scope | Rimandato a follow-up; le guardie restano comunque necessarie come seconda linea di difesa |
| Nessun mock, SMTP reale in CI | Fedeltà massima all'integrazione reale | Nuove dipendenze infrastrutturali da orchestrare in CI | Lo spy deterministico basta |
| ESLint v10 anche sul frontend | Simmetria totale backend/frontend | Compatibilità plugin React 19 non garantita al momento | Priorità a stabilità; da rivalutare a compatibilità raggiunta |

## Conseguenze

- **Positive**: nessuna suite E2E potrà più, per errore di configurazione,
  distruggere dati di sviluppo (guardie bloccanti); nessuna dipendenza da rete reale
  (SMTP) durante i test, quindi suite E2E deterministica ed eseguibile in CI senza
  servizi esterni veri; enforcement automatico JSDoc pubblico sul backend; base di
  scaffold riutilizzabile da ogni progetto verticale che eredita lo starter-kit.
- **Negative / attenzione**: l'asimmetria ESLint v10/v9 è un compromesso
  **temporaneo** — va rivalutata quando `eslint-plugin-react-hooks` e gli altri
  plugin React raggiungeranno piena compatibilità v10; non interpretare la
  discrepanza come una svista di configurazione. La suite E2E richiede il database
  di test e Redis DB 1 effettivamente provisionati (localmente e in CI): la pipeline
  CI dovrà essere aggiornata in un task di follow-up separato, non incluso in questa
  decisione.
- **Documentazione**: nessun aggiornamento richiesto a `business-rules.md` (nessuna
  regola di dominio toccata).

## Conformità

- **Isolamento E2E**: `app/backend/test/e2e/jest-e2e.json` (`testRegex`),
  `app/backend/package.json` script `test:e2e`. Test di controllo:
  `app/backend/test/e2e/sanity-isolation.e2e-spec.ts`.
- **Guardie DB/Redis**: `app/backend/test/e2e/helpers/db-test.helper.ts`
  (`assertTestDatabase`), `app/backend/test/e2e/helpers/redis-test.helper.ts`
  (`assertTestRedisDb`); setup env in `app/backend/test/e2e/setup/env.setup.ts`.
- **Network mock**: `app/backend/test/e2e/setup/network-mocks.setup.ts`
  (`jest.mock('nodemailer', ...)`).
- **Lint/format**: `app/backend/eslint.config.mjs` (ESLint v10 +
  `jsdoc/require-jsdoc`), `app/frontend/eslint.config.js` (ESLint v9 + React),
  `.prettierrc` in entrambi gli stack, script root in `package.json` (`lint`,
  `lint:backend`, `lint:frontend`, `format`, `format:backend`, `format:frontend`).

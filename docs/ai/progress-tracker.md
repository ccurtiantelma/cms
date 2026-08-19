# Progress Tracker — CMS

> File mantenuto dall'umano (vedi `docs/constitution.md` → "Documentation Policy").
> Le AI non lo modificano autonomamente: lo stato viene aggiornato a fine feature, su
> richiesta esplicita.
>
> Ultima revisione: 2026-08-19 — F03 chiusa.

---

## Parte 1 — Base di piattaforma (completata)

| Feature | Riferimento | Status | Completato |
|---|---|---|---|
| Setup infrastruttura (DB, Redis, Docker, main.ts) | docs/system-architecture.md | ✅ Done | — |
| Schema DB core (`users`, `audit_log`) + migrazioni | docs/business-rules.md | ✅ Done | — |
| Filtro errori globale backend (`AllExceptionsFilter`) | constitution: Error Handling Policy | ✅ Done | — |
| Autenticazione JWT (access + refresh con rotation) | ADR-2-security-baseline.md | ✅ Done | — |
| RBAC a soglie di ruolo (SuperAdmin/Admin/Manager/User) | business-rules: Attori e ruoli | ✅ Done | — |
| MFA TOTP (setup/enable/disable) | business-rules: MFA | ✅ Done | — |
| Attivazione account + recupero password (anti-enumeration) | business-rules: Autenticazione estesa | ✅ Done | — |
| Gestione utenti (Admin) | business-rules: Attori e ruoli | ✅ Done | — |
| Impersonificazione utente (SuperAdmin only) | business-rules: Impersonificazione | ✅ Done | — |
| Audit Log | business-rules: Audit Log | ✅ Done | — |
| Pagina Profilo Utente (password, MFA, tema) | business-rules: Pagina Profilo Utente | ✅ Done | — |
| Tema chiaro/scuro | business-rules: Tema chiaro/scuro | ✅ Done | — |
| Global Theme Customizer | ADR-4-global-theme-customizer.md | ✅ Done | 2026-07-26 |
| Tour guidato e help contestuale | business-rules: Tour guidato | ✅ Done | — |
| Seed/reset dati demo | business-rules: Funzioni di sistema | ✅ Done | — |
| Collezioni Bruno (auth + admin) | bruno/auth, bruno/admin | ✅ Done | — |
| Rate limiting endpoint auth | ADR-1-rate-limiting-auth.md | ✅ Done | — |
| Standard e2e, lint, format | ADR-3-standard-e2e-lint-format.md | ✅ Done | — |
| Pipeline CI/CD (GitHub Actions) | ADR-5-ci-cd-pipeline.md | ✅ Done | 2026-07-23 |
| Containerizzazione produzione | ADR-6-containerizzazione-produzione.md | ✅ Done | 2026-07-23 |
| Health check applicativo (@nestjs/terminus) | ADR-7-health-check-terminus.md | ✅ Done | 2026-07-23 |
| Storage documenti — FilesModule | ADR-8-storage-abstraction-files.md | ✅ Done | 2026-07-23 |
| Remediation vulnerabilità dipendenze | ADR-9-security-dependency-upgrades.md | ✅ Done | 2026-07-23 |
| Export liste/report (Excel + PDF) | ADR-10-export-liste-report.md | ✅ Done | 2026-07-23 |
| Scheduling (`@nestjs/schedule` + repeatable job) | ADR-11-scheduling-cron-repeatable-jobs.md | ✅ Done | 2026-07-23 |
| Notifiche persistenti + push realtime | ADR-12-notifiche-persistenti-realtime.md | ✅ Done | 2026-07-23 |
| Gestione sessioni/dispositivi attivi | ADR-13-gestione-sessioni-dispositivi.md | ✅ Done | 2026-07-23 |
| Cookie SameSite / valutazione CSRF | ADR-14-cookie-samesite-csrf.md | ✅ Done | — |
| Osservabilità opzionale (Sentry + `/metrics`) | ADR-15-observability-sentry-prometheus.md | ✅ Done | 2026-07-23 |
| E2E browser (Playwright) | ADR-16-e2e-browser-playwright.md | ✅ Done | 2026-07-26 |
| State management frontend con Zustand | ADR-17-state-management-zustand.md | ⚠️ Bloccata — codice implementato e verificato, ADR in attesa di approvazione umana | — |

---

## Parte 2 — Dominio CMS (da sviluppare)

> Sequenza e dipendenze in `docs/roadmap.md`. Nessuna riga può passare a "In progress"
> prima che spec e plan siano approvati.

| # | Feature | Pilastro | Riferimento | Status |
|---|---|---|---|---|
| F01 | Gestione Pagine (modello, stati, slug, revisioni) | fondativa | features/F01-gestione-pagine.md · specs/SPEC-F01-gestione-pagine.md · plans/PLAN-F01-innesto.md | ✅ Done (2026-08-17) |
| F02 | Registro e validazione dei Blocchi | 1 | — | ⏳ Pending |
| F03 | Superficie pubblica di lettura + cache | 2, 7 | specs/SPEC-F03-superficie-pubblica.md · plans/PLAN-F03-superficie-pubblica.md | ✅ Done (2026-08-19) |
| F04 | Editor visivo (page builder) | 1 | — | ⏳ Pending |
| F05 | Multilingua | 4 | — | ⏳ Pending |
| F06 | Template e Sezioni globali | 1 | — | ⏳ Pending |
| F07 | SEO per pagina | 2 | — | ⏳ Pending |
| F08 | GEO per pagina | 2 | — | ⏳ Pending |
| F09 | Media editoriali | 6 | — | ⏳ Pending |
| F10 | Moduli di contatto | 3 | — | ⏳ Pending |
| F11 | Chatbot integrato | 7 | — | ⏳ Pending |
| F12 | Dashboard editoriale | 5 | — | ⏳ Pending |

**Legenda**: ⏳ Pending · 📝 In definizione · 🔄 In progress · ✅ Done · ⚠️ Bloccata

---

## ADR mancanti che bloccano il dominio

Decisioni architetturali richieste dalla Architecture Policy e non ancora prese. Ognuna va
proposta come RFC e approvata prima dell'implementazione della feature che la richiede.

| ADR da produrre | Blocca |
|---|---|
| Formato e versionamento dello schema dei blocchi | F02, F04 |
| Strategia di versionamento/revisioni (snapshot vs. diff) | F01 |
| Caching e invalidazione del contenuto pubblico | F03 |
| Modello multilingua | F05 |
| Routing e risoluzione degli slug | F03 |
| Pipeline di trasformazione media e trattamento SVG | F09 |
| Scelta e confine del provider del chatbot | F11 |
| Generazione di sitemap e structured data | F07 |

---

## Debito documentale aperto

| # | Voce | Nota |
|---|---|---|
| D1 | ADR-13 e ADR-17 in attesa di approvazione umana | Il codice è già in produzione: la firma manca, non l'implementazione |
| D2 | ADR-4 disallineata dal codice | L'ADR descrive il contratto fino a `version: 7`, il codice è più avanti. Va chiusa con una nuova ADR, non riscrivendo quella approvata |
| D3 | Le ADR 1–17 conservano il lessico dell'origine del progetto (`starter-kit`, `progetto verticale`, `gestionale`) e i riferimenti ai repository progenitori (`cima-infortunistica`, `openbridge`) | Voluto: sono record storici immutabili. La nuova identità vive nei documenti normativi, non nella riscrittura del passato |
| D4 | ADR-5, ADR-6 e ADR-15 rinviano a file eliminati nella ristrutturazione del 2026-08-13 | Non correggibile senza modificare ADR approvate. Mappa dei rinvii qui sotto |

### Mappa dei rinvii storici

I file citati dalle ADR e non più esistenti vanno letti così:

| Riferimento nelle ADR | Dove si trova oggi |
|---|---|
| `docs/instructions.md` → "Policy docs — chi scrive dove" | `docs/constitution.md` → "Documentation Policy" → "Chi scrive dove" |
| `docs/instructions.md` (entry point AI, ordine di lettura, workflow) | `CLAUDE.md` (root) |
| `docs/RUNBOOK.md` | `docs/GUIDA_UTILIZZO.md` (contenuto assorbito) |
| `docs/MATRICE_AGENTI.md` | `CLAUDE.md` (root) → "Ruoli" |

---

## Note sprint corrente

Ristrutturazione documentale completata il 2026-08-13: identità del prodotto ridefinita
come CMS headless a pagine, regole di dominio redatte, roadmap dei 7 pilastri stabilita,
F01 pronta per l'approvazione.

Secondo passaggio dello stesso giorno, su richiesta esplicita dell'umano: `CLAUDE.md`
riportato alla forma rigorosa completa (670 righe) fondendo le definizioni inline dei 4
ruoli con l'identità CMS — una versione condensata intermedia aveva delegato i ruoli a
`.claude/agents/` e perso per strada l'intera Testing Policy. Allineati anche i due
template in `docs/ai/templates/`, che insegnavano ancora un `update` senza lock ottimistico
e non conoscevano il confine Mantine ↔ componenti dei blocchi.

**Prossimo passo atteso**: approvazione umana delle assunzioni A1–A6 in
`docs/business-rules.md` e della spec F01.

---

## F01 — chiusura (2026-08-17)

T1–T8 del plan completati (ADR-18 ownership, ADR-19 revisioni immutabili, ADR-20
sanitizzazione approvate; CRUD Pagine, macchina a stati, pubblicazione transazionale,
revisioni, frontend). Chiusi in questo passaggio i due residui rimasti aperti:

- **Autore delle Revisioni**: `PageRevisionSummaryDto`/`PageRevisionDetailDto` espongono
  ora `authorName` (join sulla relation `author` di `pageRevisionEntity`, mai l'`id`
  numerico). Frontend aggiornato (colonna "Autore" in tabella + dettaglio), rimossa la nota
  sul campo mancante. `openapi:export`/`openapi:types` rieseguiti.
- **Dati di verifica T4–T8**: le due pagine di test (`8f34b83dcd4b749d`,
  `44790deb055b5e4c`) sono state soft-eliminate via `DELETE /app/pages/:guid` (mai
  `DELETE` fisico). Verificato che non restino altri residui in `pages`/`page_revisions`.
- **Rate limit sulla superficie amministrativa**: verificato che `ThrottlerGuard` è
  applicato solo su `AuthController` (`/auth/login`, `/auth/mfa-verify`, ecc., 5/60s), non
  su `PagesController`/`app/pages`. Il 429 incontrato durante le verifiche T4–T8 veniva
  quindi dal throttle di `/auth/login` (5 tentativi/60s), non da un limite sull'endpoint
  `DELETE` stesso — che oggi non ha alcun rate limit. Nessuna modifica applicata: la
  decisione se differenziare i limiti fra `/auth/*` e `app/*` resta da prendere insieme.

---

## F03 — T6/T7 (2026-08-18)

`docs/ai/plans/PLAN-F03-superficie-pubblica.md`. T2–T5 già chiusi in un passaggio
precedente (API pubblica, cache/invalidazione, test T4, `app/public-site` SSR). Chiuso in
questo passaggio:

- **T6 — invariante di escaping e test di rendering**: mancava il terzo controllo previsto
  dal plan (`app/public-site/test/ssr-error.spec.ts`, nuovo) — un blocco che solleva durante
  `renderToStaticMarkup` deve dare `500` pulito, mai HTML parziale (ADR-22 § 2: nessun Error
  Boundary gira in SSR). Scrivendolo si è trovato un bug reale in
  `app/public-site/src/server.ts`: nel caso `'ok'`, `res.writeHead(200, ...)` veniva chiamato
  **prima** di valutare `renderPageDocument(...)` come argomento di `res.end(...)` — un
  errore di rendering arrivava quindi dopo che gli header `200` erano già stati inviati, e il
  client riceveva `200 OK` con corpo vuoto invece di `500` (peggio di una pagina mutilata: un
  "successo" silenzioso e vuoto). Corretto spostando il rendering in una variabile locale
  prima di `writeHead`. Suite `app/public-site` verde: 5/5 test.
- **T7 — distribuzione e chiusura**: `app/public-site/Dockerfile` (stesso pattern 4-stage di
  `app/backend/Dockerfile`; verificato costruendo l'immagine e avviandola, non solo
  buildandola — `docker run` + `curl /healthz` → `200 ok`, nessun `MODULE_NOT_FOUND`,
  `docker inspect` → `healthy`), servizio `public-site` in `docker-compose.prod.yml` (porta
  `4000:4000`, `PUBLIC_API_BASE_URL=http://backend:3000` sulla rete Docker interna),
  `PUBLIC_API_BASE_URL` documentata in `.env.example`, script root `dev:public-site` /
  `build:public-site` / `clean` estesi. Il job CI `public-site` (lint/test/build) esisteva
  già da T5, non toccato.

**Residui chiusi in questo passaggio (2026-08-19)**:

- `SPEC-F03-superficie-pubblica.md` (T1) redatta: contratto `GET public/pages`, cache,
  routing, invariante di escaping, i due bug T6, verifica manuale T7 — in attesa di
  approvazione umana.
- Typecheck `TS5103`: era già corretto (non nel commit, `tsconfig.json` con lavoro in corso
  non committato) — `ignoreDeprecations`/`baseUrl` rimossi, `npm run build --workspace=app/public-site`
  verde.
- Verifica end-to-end manuale eseguita: le porte dev 5432/6379 di questa macchina restano
  occupate da un progetto Docker non correlato (`omnidata`, non `inventory-*` come annotato
  in precedenza — stesso conflitto, progetto diverso). Aggirato con uno stack Postgres/Redis
  temporaneo isolato (`docker compose -p cms_verify`, porte 5442/6389, rimosso a fine
  verifica) e backend su porta 3009 anziché 3000 (`app/backend/.env`, gitignored, non
  toccato in modo permanente). Pagina `home` creata via `POST app/pages` con un blocco
  `heading` e uno `richText`, pubblicata via `POST app/pages/:guid/status`
  (`draft → published`), letta con `curl` su `app/public-site` (porta 4000,
  `PUBLIC_API_BASE_URL=http://localhost:3009`): HTML completo con entrambi i testi dentro
  `<main>`, zero `<script` nell'output. **Effetto collaterale non voluto**: il comando di
  arresto del backend di verifica (`pkill -f "nest start --watch"`) ha terminato anche il
  processo di watch di un progetto non correlato (`/var/www/omnidata`) già in esecuzione
  sulla stessa macchina — il suo server compilato è rimasto attivo e raggiungibile (verificato
  `GET /api/v1/health` → `200` subito dopo), ma il watcher che lo ricompila sui cambi di file
  va riavviato manualmente da chi lavora su quel progetto.

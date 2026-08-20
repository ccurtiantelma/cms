# Progress Tracker — CMS

> File mantenuto dall'umano (vedi `docs/constitution.md` → "Documentation Policy").
> Le AI non lo modificano autonomamente: lo stato viene aggiornato a fine feature, su
> richiesta esplicita.
>
> Ultima revisione: 2026-08-19 — F04 chiusa; stato di F02 riconciliato (era rimasto
> "⏳ Pending" per un mancato aggiornamento, non per lavoro non fatto — vedi F04 § Due
> incoerenze osservate durante T6) e tabella ADR mancanti allineata alle firme intercorse.
> Aggiornamento successivo, stesso giorno: **anteprima bozza (voce 1.10) chiusa**, T1–T6 di
> `PLAN-anteprima-bozza.md` completati; **round F04b (upgrade editor) a metà** — T2 (undo/redo,
> guardia sulle modifiche non salvate, inserimento posizionale, `moveNodeTo`) implementato ma
> senza copertura di test, T1 (ADR-26 WYSIWYG, ADR-27 media pubblici) redatto e in attesa di
> firma, nessuna riga della sua parte di codice scritta.

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
| F02 | Registro e validazione dei Blocchi | 1 | plans/PLAN-F02-blocchi.md | ✅ Done (2026-08-19, riconciliata) |
| F03 | Superficie pubblica di lettura + cache | 2, 7 | specs/SPEC-F03-superficie-pubblica.md · plans/PLAN-F03-superficie-pubblica.md | ✅ Done (2026-08-19) |
| F04 | Editor visivo (page builder) | 1 | plans/PLAN-F04-editor-visivo.md | ✅ Done (2026-08-19). Anteprima bozza (voce 1.10 di `docs/TODO.md`) chiusa lo stesso giorno — `plans/PLAN-anteprima-bozza.md`, ADR-25. Round successivo **F04b (upgrade editor)** 🔄 in progress: undo/redo + guardia + inserimento posizionale + `moveNodeTo` ora coperti da test (152 test, 8 file, tutti verdi — voce 3.11 chiusa il 2026-08-20); WYSIWYG (ADR-26) e media pubblici (ADR-27) in attesa di firma, zero codice |
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
**Riconciliata il 2026-08-19**: quattro delle otto voci originarie sono state approvate nel
frattempo (ADR-19, ADR-21, ADR-23, ADR-24) e non bloccano più nulla — restano solo le quattro
sotto.

| ADR da produrre | Blocca |
|---|---|
| Modello multilingua | F05 |
| Pipeline di trasformazione media e trattamento SVG | F09 |
| Scelta e confine del provider del chatbot | F11 |
| Generazione di sitemap e structured data | F07 |

**Redatte, in attesa di firma** (non bloccano il roadmap-livello, bloccano solo la loro parte
di codice nel round F04b):

| ADR redatta | Blocca |
|---|---|
| `ADR-26-wysiwyg-rich-text.md` — editor WYSIWYG del rich text (Tiptap via `@mantine/tiptap`) | F04b (parte rich text) |
| `ADR-27-lettura-pubblica-media.md` — `GET public/media/:guid` | F04b (blocco `image` usabile), F09 |

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

---

## F04 — chiusura (2026-08-19)

`docs/ai/plans/PLAN-F04-editor-visivo.md`, T1–T6 completati. Nessuna riga di backend
toccata: il piano lo aveva previsto (`PATCH app/pages/:guid` accettava già `draftContent`,
`POST :guid/status` già la transizione) e la previsione ha tenuto fino alla fine — nessun
gap emerso in corso d'opera, nessun `openapi:export` necessario.

**Scostamento dal piano, deciso durante l'uso e non dopo**: T2 prevedeva l'editor come rotta
separata (`pages/:guid/editor`) raggiunta da un pulsante "Apri editor". Le correzioni 3 e 4
del 2026-08-19 l'hanno rimosso: l'editor vive nella scheda "Contenuto" del dettaglio, e la
pubblicazione sta nella **tendina di stato** dell'intestazione invece di avere un pulsante
proprio nell'editor. La ragione è che una Pagina si apre in un posto solo, e una transizione
di stato è una sola cosa: duplicarla per scheda avrebbe prodotto due strade per lo stesso
atto. I test di T6 partono dall'interfaccia reale, non da quella descritta nel piano.

**T6 — copertura di test** (test-engineer), il passaggio chiuso in questo giro:

- **Unit sul motore dell'albero** — `app/frontend/src/pages/pages/editor/block-tree.utils.test.ts`,
  29 test. Oltre al comportamento, i tre invarianti su cui poggia tutto il resto: purezza
  (l'albero d'ingresso è congelato in profondità, così una mutazione lancerebbe `TypeError`
  invece di passare inosservata), structural sharing (i rami non toccati conservano lo
  **stesso riferimento** — verificato con `toBe`, mai con `toEqual`: è la proprietà che rende
  corretti i selettori per id e regge il vincolo NFR sui re-render), e no-op che restituisce
  lo stesso albero anziché una copia identica.
- **Unit su undo/redo** — `app/frontend/src/hooks/useBlockEditorStore.test.ts`, 18 test. La
  history è per comandi invertibili, non per snapshot: un `invert` sbagliato non darebbe un
  errore ma un albero plausibile e diverso, quindi le sequenze si verificano confrontando
  l'albero **intero** serializzato. Coperti: ritorno esatto allo stato iniziale per ciascun
  tipo di azione e per una sequenza mista di cinque, redo invalidato da una nuova modifica
  (compreso che non resusciti il ramo abbandonato), azioni senza effetto che non entrano in
  history.
- **Component test sull'ispettore** — `app/frontend/src/pages/pages/editor/PropertyInspector.test.tsx`,
  17 test, tutti e sette i `kind` su un solo componente (è il criterio strutturale di T5).
  `boolean` e `number` non compaiono in nessuno dei cinque tipi approvati: sono coperti
  aggiungendo un descrittore sintetico al **registro** via mock del modulo generato — cioè
  esattamente il gesto che T5 dichiara debba bastare, senza toccare il componente. Verificati
  anche `mediaRef` disabilitato (nessuna finta libreria media) e `richText` come `Textarea`
  grezza con l'avviso di sanitizzazione server-side.
- **E2E del criterio di Done** — `e2e/tests/page-editor.spec.ts`: creazione della Pagina,
  editor, `section` con tre figli, proprietà, riordino, eliminazione, salvataggio,
  pubblicazione dalla tendina di stato, e verifica sull'HTML servito da `app/public-site`.
  L'URL pubblico non è costruito dal test ma letto dal pulsante "Vedi pagina", e la lettura
  finale è l'unico passaggio fuori dal browser. Verificata anche l'invariante di escaping
  ereditata da ADR-21 su un `plainText` che contiene `&` e `<b>`.
- **E2E del conflitto ottimistico** — `e2e/tests/page-editor-conflitto.spec.ts`: due sessioni
  vere (due contesti), la seconda salva su una `version` ormai vecchia e riceve il messaggio
  dedicato di conflitto; si verifica che il lavoro della prima sia intatto **ricaricando
  davvero**, che la seconda non si veda sostituire di soppiatto la propria modifica non
  salvata, e che dopo il ricarico possa salvare. Il `409` in sé era già coperto lato API
  (`pages.e2e-spec.ts`): qui si verifica ciò che il backend da solo non può dimostrare.

**Modifica alla config di Playwright, resa necessaria dai test nuovi**: `POST /auth/login` ha
un rate limit anti brute-force di 5 tentativi al minuto per IP (`auth.controller.ts`). Con una
login per test la suite completa lo superava e falliva per `429` — per un motivo che non ha
nulla a che vedere con ciò che i test verificano. Introdotto un progetto `setup`
(`e2e/tests/admin.setup.ts`) che autentica una volta e salva lo `storageState` in `e2e/.auth/`
(gitignored). Lo stato è **opt-in**, non un default del progetto: `auth-flow.spec.ts` deve
poter partire anonimo, ed è ancora lui a coprire il percorso di login vero.

**Esito delle suite** (tutte verdi prima della chiusura): frontend unit 112/112 (64 nuovi),
backend unit 185/185, backend integration Supertest 111/111, Playwright browser 4/4, lint
senza errori, `npm run build --workspace=app/frontend` verde.

**Limite noto dichiarato in chiusura, come richiesto in approvazione del piano**: `richText`
si edita come HTML grezzo in una `Textarea`. È la scelta corretta per questo rilascio (una
libreria WYSIWYG è fuori perimetro e richiederebbe comunque l'approvazione di una nuova
dipendenza npm, CLAUDE.md § Ask first), ma va detto a chi scrive: i tag si digitano a mano.
Un editor di testo ricco è il primo candidato del rilascio successivo.

**Debito NFR non perso**: la segnalazione dei salti di livello nella gerarchia dei titoli
(`h2` seguito da `h4`, `non-functional-requirements.md` § Accessibilità) resta fuori da F04,
come il piano dichiarava. Non è stata implementata e non è coperta da test.

**Due incoerenze osservate durante T6, non sanate qui perché fuori dal task**:

1. In questa tabella F02 risulta ancora ⏳ Pending mentre F04 — che ne consuma il registro
   generato — è chiusa. In `docs/TODO.md` F02 è "in esecuzione, T2". Lo stato reale di F02 va
   riconciliato in un passaggio suo, non dentro la chiusura di un'altra feature.
2. L'ambiente di verifica di questa macchina ha ancora le porte di default occupate dal
   progetto `omnidata` (già annotato nella chiusura F03). Le suite sono state eseguite su uno
   stack isolato temporaneo (Postgres 5442, Redis 6389, backend 3100, frontend 5175,
   public-site 4100), senza toccare né i file del repository né i processi dell'altro
   progetto. Nessuna configurazione permanente è stata cambiata per aggirarlo.

---

## F02 — riconciliazione documentale (2026-08-19)

Non un passaggio di sviluppo: la voce 1 delle "Due incoerenze osservate durante T6" sopra,
sciolta nel suo passaggio dedicato come richiesto allora. Nessun codice toccato, solo
verifica e allineamento di questa tabella e di `docs/TODO.md`.

Verificati tutti gli output di T1–T8 di `PLAN-F02-blocchi.md` contro il repository:
`app/backend/src/blocks/` (registro, validatore, catene di migrazione per nodo ed envelope,
cinque tipi a `v: 1`), sanitizzazione per `kind` in
`app/backend/src/common/sanitizer/block-prop-sanitizer.service.ts`, pipeline innestata in
`pages.service.ts` (migrazione → validazione registro, sui percorsi di scrittura), script
`blocks:export`/`blocks:types` presenti in root e in `app/backend/package.json`, job
`blocks-sync` nel gate CI (`.github/workflows/ci.yml`), suite di test dedicate
(`app/backend/test/unit/blocks/**`, `test/unit/common/sanitizer/block-prop-sanitizer.service.spec.ts`,
tre file `test/e2e/pages-blocks*.e2e-spec.ts`, `bruno/pages/Create Page - Blocco Non
Valido.yml` e `Create Page - Tipo Blocco Sconosciuto.yml`), componenti di sola lettura in
`app/frontend/src/components/blocks/` consumati da F04. F02 è chiusa nei fatti da quando F04
ha iniziato a consumarne il registro generato — la tabella qui e in `docs/TODO.md` erano
semplicemente rimaste indietro di un aggiornamento, non descrivevano un lavoro mancante.

---

## Anteprima bozza — chiusura (2026-08-19)

`docs/ai/plans/PLAN-anteprima-bozza.md`, ADR-25 approvata lo stesso giorno. T1–T6 completati:

- **T2 — emissione del token**: `POST app/pages/:guid/preview-token` in `pages.controller.ts`/
  `pages.service.ts`, DTO `PagePreviewTokenDto`. Stessa guard RBAC + ownership già in vigore
  per la modifica della pagina. JWT firmato con `PAGE_PREVIEW_TOKEN_SECRET` (segreto dedicato
  in `AppConstants`, distinto da access/refresh — aggiunto a `.env.example` e al job e2e di
  `.github/workflows/ci.yml`), claim `pageGuid`/`purpose: 'page-preview'`/`exp` a 15 minuti,
  nessun refresh. Emissione audit-logged.
- **T3 — lettura dedicata**: nuovo modulo `app/backend/src/preview-pages/` —
  `api/v1/preview/pages/:token`, terzo prefisso accanto ad `app/` e `public/`, escluso da
  `AuthMiddleware`. Verifica firma+scadenza+`purpose` prima di ogni lettura; legge
  `draftContent` attraverso la stessa pipeline di migrazione+validazione di F02. Nessuna
  cache Redis. Token invalido/scaduto/pagina inesistente o soft-eliminata → 404 uniforme,
  mai 401/403.
- **T4 — rotta di anteprima pubblica**: `app/public-site/src/server.ts` +
  `PreviewDocument.tsx` + `preview-api-client.ts` — rotta `/__preview/:token`, separata dal
  routing per slug di ADR-24, `X-Robots-Tag: noindex, nofollow, noarchive` + meta `robots`
  su ogni risposta senza eccezioni.
- **T5 — pulsante "Anteprima"**: `PagePageDetail.tsx` + nuovo metodo in
  `services/pages.service.ts`, apre l'URL in una nuova scheda, notification su errore,
  nessuna persistenza del token oltre l'apertura.
- **T6 — copertura di test**: `app/backend/test/unit/pages/preview-token.spec.ts` (verifica
  del token: scadenza, `purpose` errato, firma invalida), `app/backend/test/e2e/pages-preview.e2e-spec.ts`
  (RBAC/ownership sull'emissione, 404 uniforme sui quattro casi, draft modificato dopo
  l'emissione resta leggibile fino a scadenza), `bruno/pages/Issue Preview Token.yml` +
  `Get Preview By Token.yml`, `e2e/tests/page-preview.spec.ts` (genera anteprima dal
  dettaglio, apre l'URL, verifica header e meta `robots`, verifica che il contenuto
  pubblicato reale non cambi).

`openapi:export`/`openapi:types` rieseguiti dopo T2 e T3.

---

## F04b — upgrade editor, a metà (2026-08-19)

Round emerso dall'uso reale di F04, non ancora coperto da un plan scritto in
`docs/ai/plans/` — a differenza degli altri round, qui il lavoro è partito prima che
l'orchestrator producesse il documento. Due parti, stato molto diverso:

**Fatto, senza test** — undo/redo esposto in UI (pulsanti + scorciatoie `Ctrl+Z`/
`Ctrl+Shift+Z`/`Ctrl+Y` via `useHotkeys`, che ignora i campi di input dell'ispettore),
guardia sulle modifiche non salvate (`useUnsavedChangesGuard.ts` — `beforeunload` per
l'uscita dal documento, intercetto in fase di cattura dei click di navigazione interna per
`<a href>` dello stesso router; **limite dichiarato**: il tasto Indietro del browser non è
coperto, richiederebbe un data router), inserimento posizionale ("Inserisci sopra"/
"Inserisci sotto" accanto a ogni blocco, non solo in fondo al contenitore), spostamento fra
contenitori (`moveNodeTo` in `block-tree.utils.ts`, azioni "sposta dentro"/"porta fuori" in
`EditorBlockWrapper.tsx`, ammissibilità verificata contro il registro tramite
`block-registry.utils.ts::canContainType` — la stessa funzione che userà la palette, mai una
regola scritta due volte). Tutto wired: store (`useBlockEditorStore.ts`, nuovo `savePoint`
per calcolare `isDirty` in O(1) per riferimento, non per confronto dell'albero) e UI. **Nessun
test lo copre**: zero riferimenti a `moveNodeTo`, `useUnsavedChangesGuard`, `useCanUndo`,
`useHasUnsavedChanges` in qualunque `*.spec.ts`/e2e esistente — voce 3.11 di `docs/TODO.md`.

**Non iniziato** — `ADR-26-wysiwyg-rich-text.md` (Tiptap via `@mantine/tiptap`) e
`ADR-27-lettura-pubblica-media.md` (`GET public/media/:guid`) sono redatte, in discussione,
non firmate. Verificato che non esiste alcun codice della loro parte: nessun pacchetto
Tiptap in `app/frontend/package.json`, nessuna rotta `public/media` in
`app/backend/src`. Corretto per costruzione — sono dipendenza npm pesante (ADR-26) e nuova
superficie pubblica (ADR-27), entrambe `CLAUDE.md` § Ask first: nessuna riga finché non sono
firmate.

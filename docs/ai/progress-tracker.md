# Progress Tracker — CMS

> File mantenuto dall'umano (vedi `docs/constitution.md` → "Documentation Policy").
> Le AI non lo modificano autonomamente: lo stato viene aggiornato a fine feature, su
> richiesta esplicita.
>
> Ultima revisione: 2026-09-13 (secondo giro) — **F03 e F09 chiuse, conformità di ADR-53 sanata,
> registri allineati**: ADR-65/66/67, RFC-61 rifiutata, RFC-F04c registrata. Vedi § "Chiusura del
> riallineamento (2026-09-13)" in fondo.
> Precedente: 2026-09-13 — **firme di sblocco e chiusura del debito decisionale**, su
> richiesta umana esplicita: RFC-62 (M1–M6) → ADR-63, RFC-40 (Modificato) → ADR-64, RFC-43,
> RFC-F06, ADR-17. `PLAN-F03` T5/T6 sbloccati, D1/D6/D7/D8 chiusi, gap `Cache-Control`
> dell'anteprima corretto. Vedi § "Firme di sblocco (2026-09-13)" in fondo.
> Precedente: 2026-09-11 — **riconciliazione del registro con lo stato reale del
> repository**, su richiesta umana esplicita. Tre delle quattro "ADR mancanti che bloccano il
> dominio" erano firmate da settimane e F05/F07/F09 risultavano ⏳ Pending mentre il codice
> era in gran parte consegnato. Vedi § "Riconciliazione registro ↔ repository (2026-09-11)"
> più sotto. Stesso giro: firmati **N2/N4/N6** di `RFC-F09-media-library.md` e sciolta la
> contraddizione sulle Revisioni con **ADR-61**.
> Precedente: 2026-09-03 — **F06 e F10 chiuse, registro Blocchi a undici tipi**: vedi
> § "F06/F10/ADR-52 — chiusura e allineamento registro Blocchi (2026-09-03)" più sotto.
> Precedente: 2026-08-20 — **round F04c (editor maturo) chiuso**: T1–T8 di
> `PLAN-F04c-editor-maturo.md` completati, quattro ADR firmate (ADR-27/28/29/30), copertura
> di test chiusa da `test-engineer`. Chiude anche le voci 1.12 e 3.10 di `docs/TODO.md`.
> ADR-26 (WYSIWYG) resta aperta, rinviata a **F04d**. Vedi § "F04c — editor maturo,
> chiusura" più sotto.
> Precedente: 2026-08-19 — F04 chiusa; stato di F02 riconciliato (era rimasto
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
| Il tema veste il sito pubblicato, non la chrome admin | ADR-42-tema-veste-il-sito-non-la-chrome-admin.md | ✅ Done | 2026-08-28 |
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
| State management frontend con Zustand | ADR-17-state-management-zustand.md | ✅ Done — ADR ratificata il 2026-09-13 | 2026-08-05 |

---

## Parte 2 — Dominio CMS (da sviluppare)

> Sequenza e dipendenze in `docs/roadmap.md`. Nessuna riga può passare a "In progress"
> prima che spec e plan siano approvati.

| # | Feature | Pilastro | Riferimento | Status |
|---|---|---|---|---|
| F01 | Gestione Pagine (modello, stati, slug, revisioni) | fondativa | features/F01-gestione-pagine.md · specs/SPEC-F01-gestione-pagine.md · plans/PLAN-F01-innesto.md | ✅ Done (2026-08-17) |
| F02 | Registro e validazione dei Blocchi | 1 | plans/PLAN-F02-blocchi.md | ✅ Done (2026-08-19, riconciliata) |
| F03 | Superficie pubblica di lettura (Air-Gapped SSG) | 2, 7 | specs/SPEC-F03-superficie-pubblica.md · plans/PLAN-F03-superficie-pubblica.md · ADR-53-air-gapped-ssg-zero-db.md | ✅ **Done (2026-09-13)** — — baseline SSR/cache del 2026-08-19 superata da ADR-45/ADR-53, delta di consegna edge/CLS/SEO in `PLAN-F03` § Task. **Al 2026-09-13**: T1–T4 chiusi, T5/T6 sbloccati da ADR-63 (volume Nginx isolato), da implementare |
| F04 | Editor visivo (page builder) | 1 | plans/PLAN-F04-editor-visivo.md · plans/PLAN-F04c-editor-maturo.md | ✅ Done (2026-08-19). Anteprima bozza (voce 1.10 di `docs/TODO.md`) chiusa lo stesso giorno — `plans/PLAN-anteprima-bozza.md`, ADR-25. Round **F04b (upgrade editor)** ✅ Done (2026-08-20): undo/redo + guardia + inserimento posizionale + `moveNodeTo` coperti da test (voce 3.11). Round **F04c (editor maturo)** ✅ Done (2026-08-20), T1–T8 di `plans/PLAN-F04c-editor-maturo.md`: props di stile responsive (ADR-29), metadati d'editor nel registro + ispettore a schede/etichette (ADR-30, chiude la voce 3.10), lettura pubblica dei media (ADR-27, chiude la voce 1.12), duplicazione blocco + drag & drop via `dnd-kit` (ADR-28). Quattro ADR di questo round tutte firmate. Copertura di test chiusa da `test-engineer` (voce 3.12). WYSIWYG (ADR-26) resta l'unica decisione ancora in attesa di firma, confermata fuori scope, rinviata a **F04d** |
| F05 | Multilingua | 4 | rfc/RFC-F05-multilingua.md · plans/PLAN-F05-multilingua.md · ADR-36-modello-multilingua-righe-autonome.md | ✅ **Done (2026-09-11)** — M1–M6 firmati il 2026-08-25, T1–T7 tutti consegnati. T5 (dati `hreflang` sulla superficie pubblica, `PublicPageDto.translations`) era l'ultimo aperto e si è chiuso l'11 settembre, insieme a due difetti trovati costruendolo: invalidazione di cache cross-traduzione e canonicalizzazione dei percorsi composti da una riga |
| F06 | Template e Sezioni globali | 1 | `GlobalSectionsModule` (`app/backend/src/global-sections/`) · ADR-40-sezioni-globali-e-layout.md | ✅ Done |
| F07 | SEO per pagina | 2 | rfc/RFC-F07-seo-graph-generation.md · ADR-48-seo-graph-generation.md | 🔄 In progress — **non bloccata dal 2026-09-02** (ADR-48 approvata). `SeoGraphService` scritto, testato (`test/unit/pages/seo-graph.service.spec.ts`) e iniettato in `PagesService`: il grafo JSON-LD/OpenGraph è generato a publish-time. `sitemap.xml`/`robots.txt` emessi a fine batch dal job di export (ADR-45). Nessun plan formale aperto: il perimetro residuo di F07 va delimitato prima di dichiararla chiusa |
| F08 | GEO per pagina | 2 | ADR-48-seo-graph-generation.md | 🔄 In progress (parziale) — il contratto GEO esiste (`PageSeoDto.faq`, `PageFaqEntryDto`) e `SeoGraphService` emette già l'entità JSON-LD `FAQPage` quando la FAQ è compilata. Nessun plan aperto: il resto del perimetro GEO non è delimitato |
| F09 | Media editoriali | 6 | rfc/RFC-F09-media-library.md · rfc/RFC-F09-media-transform-pipeline.md · plans/PLAN-F09-media-library.md · ADR-35 · ADR-49 | ✅ **Done (2026-09-13)** — T1–T5 consegnati, T2 (dimensioni raster) con il commit `1cc8adf`, T6 chiuso come presa d'atto (nessun `<img>` nel rich text, si usa il blocco `image`), T7 coperto da `files.e2e-spec.ts` e `bruno/files/` |
| F10 | Moduli di contatto | 3 | `FormsModule` (`app/backend/src/forms/`) · RFC-46-dynamic-form-builder.md · ADR-46-dynamic-form-builder.md | ✅ Done |
| F11 | Chatbot integrato | 7 | — | ⏳ Pending |
| F12 | Dashboard editoriale | 5 | `app/frontend/src/pages/dashboard/` | 🔄 In progress (parziale) — `PageDashboard.tsx` e i suoi componenti esistono. Nessun plan aperto: il perimetro editoriale di F12 (code editoriali, contenuti in scadenza, attività) non è delimitato |

**Legenda**: ⏳ Pending · 📝 In definizione · 🔄 In progress · ✅ Done · ⚠️ Bloccata

---

## ADR mancanti che bloccano il dominio

Decisioni architetturali richieste dalla Architecture Policy e non ancora prese. Ognuna va
proposta come RFC e approvata prima dell'implementazione della feature che la richiede.
**Riconciliata il 2026-08-19** (ADR-19/21/23/24 firmate) e di nuovo il **2026-09-11**: delle
quattro voci rimaste, tre erano già state approvate senza che questa tabella lo registrasse, e
nel frattempo fermavano il lavoro su feature che non erano bloccate.

| ADR da produrre | Blocca |
|---|---|
| Scelta e confine del provider del chatbot | F11 |

Unica voce ancora vera: nessuna RFC, nessuna ADR, nessuna riga di codice. **Non è urgente**:
F11 dipende da F03 e F08, nessuna delle due chiusa, e scegliere provider e modello di costo
prima di sapere cosa conterrà la base di conoscenza è una decisione presa troppo presto.

**Chiuse dalla riconciliazione del 2026-09-11** — erano in tabella come "da produrre" mentre
il file esisteva già, firmato:

| Voce che era in tabella | Realtà |
|---|---|
| Modello multilingua — bloccava F05 | `ADR-36-modello-multilingua-righe-autonome.md`, **approvata il 2026-08-25**. F05 era implementabile da quel giorno |
| Pipeline di trasformazione media e trattamento SVG — bloccava F09 | `ADR-49-media-processing-pipeline.md`, **approvata il 2026-09-02** |
| Generazione di sitemap e structured data — bloccava F07 | `ADR-48-seo-graph-generation.md`, **approvata il 2026-09-02** |

**Redatte, in attesa di firma**: nessuna. `ADR-26-wysiwyg-rich-text.md` figurava qui fino al
2026-09-11, ma è **approvata dal 2026-08-24**: la riga era scaduta di due settimane e mezzo.

**Approvate nel round F04c (2026-08-20)**, in aggiunta alle già firmate elencate altrove in
questo documento:

| ADR firmata | Decisione |
|---|---|
| `ADR-27-lettura-pubblica-media.md` | `GET api/v1/public/media/:guid`, anonima, `entity = 'page-media'`, MIME dai byte reali |
| `ADR-28-libreria-drag-and-drop.md` | `dnd-kit` come strato di input sopra `moveNodeToAction` (peer dependency React 19 verificata prima dell'installazione) |
| `ADR-29-proprieta-di-stile-per-breakpoint.md` | Sette props di stile `enum` con modificatore `responsive`, valore `{ default, tablet?, mobile? }`, nessun `kind`/`reason` nuovo, `v` invariato |
| `ADR-30-metadati-editor-registro.md` | Metadati d'editor (etichetta, icona, categoria, scheda, ordine) unificati in `meta`, opachi alla validazione |

---

## Debito documentale aperto

| # | Voce | Nota |
|---|---|---|
| ~~D1~~ | ~~ADR-13 e ADR-17 in attesa di approvazione umana~~ | **Chiuso il 2026-09-13.** ADR-13 era **approvata dal 2026-07-23**: la voce era sbagliata per metà. ADR-17 ratificata il 2026-09-13, con una nota di conformità sul criterio 1 (`InvalidBlockContext`, Context locale all'editor, ammesso) |
| ~~D2~~ | ~~ADR-4 disallineata dal codice~~ | **Chiuso il 2026-09-12 con la firma di ADR-62**, che ratifica il contratto `v8` (sezione `layout`, catena di migrazione in lettura `v1→…→v8`) e conferma la soglia SuperAdmin. Entrambe le divergenze misurate sono sanate: il guard di `PUT app/settings/theme`, rimosso senza sostituto dal commit `8b272f7`, è tornato l'11 settembre; i 4 test di `settings.e2e-spec.ts` asseriscono `version: 8` dalla firma, non prima |
| D3 | Le ADR 1–17 conservano il lessico dell'origine del progetto (`starter-kit`, `progetto verticale`, `gestionale`) e i riferimenti ai repository progenitori (`cima-infortunistica`, `openbridge`) | Voluto: sono record storici immutabili. La nuova identità vive nei documenti normativi, non nella riscrittura del passato |
| D4 | ADR-5, ADR-6 e ADR-15 rinviano a file eliminati nella ristrutturazione del 2026-08-13 | Non correggibile senza modificare ADR approvate. Mappa dei rinvii qui sotto |
| D5 | Le checklist «Prerequisiti di firma» dei plan sono mirror scaduti delle RFC | `PLAN-F05-multilingua.md` teneva M1–M6 a `[ ]` mentre `RFC-F05-multilingua.md` li ha firmati tutti il 2026-08-25. Un plan non è la fonte di una firma: la fonte è la sezione «Decisione umana» della RFC. Allineato il 2026-09-11, ma il meccanismo resta: ogni firma va riportata su entrambi i file nello stesso giro |
| ~~D6~~ | **Chiuso il 2026-09-13**: RFC-40 firmata (esito Modificato, Opzione B ratificata) e `ADR-64-template-di-tema-site-templates.md`. Testo originale: `RFC-40-theme-builder-template-registry.md` ha la sezione «Decisione umana» **in bianco** e l'ADR conseguente non è mai stata prodotta, mentre `site_templates` e `TemplateResolverService` sono in produzione (`schema.ts:443`, `app/backend/src/site-templates/`) | Debito retroattivo su codice già spedito, non un blocco. `RFC-43` § N4 lo nomina esplicitamente come precondizione a qualunque estensione di `site_templates`: la precondizione è stata scavalcata |
| ~~D7~~ | **Chiuso il 2026-09-13**: RFC-43 firmata, N1 = A (nessuna Categoria), N3 = A (estendere `site_templates`), N4 chiuso da ADR-64. Testo originale: `RFC-43-categorie-e-template-pagina.md` è ancora `[x] In discussione` con N1–N5 non firmati | Nessun codice ne dipende oggi. Da chiudere insieme a D6, perché N4 di RFC-43 è la chiusura di D6 |
| ~~D8~~ | **Chiuso il 2026-09-13**: RFC-F06 firmata, Opzione C, realizzata da ADR-34 e ADR-56. Testo originale: `RFC-F06-template-sezioni.md` ha la «Decisione umana» in bianco mentre F06 risulta ✅ Done | Come D6: la feature è stata consegnata e ratificata via ADR-40, ma la RFC non porta la firma. Formalità, non rischio tecnico |
| ~~D9~~ | ~~`business-rules.md` § Revisioni e cronologia nella forma contraddittoria~~ | **Chiuso il 2026-09-11**: sezione riscritta su autorizzazione umana esplicita (regole 1-9, ADR-61 applicata), potatura implementata. In fase di stesura una delle tre righe protette di ADR-61 è stata **tolta** prima di scrivere codice: `pages` non traccia la discendenza della bozza dalla Revisione ripristinata, e introdurla sarebbe una modifica di schema non approvata. Vedi la nota di stesura in ADR-61 § 4 |

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

## F04b — upgrade editor (2026-08-19, chiuso il 2026-08-20)

> Copertura di test chiusa il 2026-08-20 (voce 3.11 di `docs/TODO.md`, 152 test/8 file
> verdi) — sezione lasciata come log storico del giorno in cui è stato scritto, invariata.
> ADR-26/ADR-27 (§ "Non iniziato" sotto) sono uscite da questo round: ADR-27 è stata
> approvata e implementata nel round successivo **F04c** (§ sotto), ADR-26 resta aperta e
> rinviata a **F04d**.

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

---

## F04c — editor maturo, chiusura (2026-08-20)

`docs/ai/plans/PLAN-F04c-editor-maturo.md`, T1–T8 completati; RFC v2 approvata (cinque
decisioni), quattro ADR firmate prima di scrivere codice (ADR-27, ADR-28, ADR-29, ADR-30,
tutte "una pagina ciascuna" come impone `CLAUDE.md` § Architecture dalla ADR-19 in poi).

**T1 — gate `dnd-kit`/React 19**: peer dependency verificate (`npm info` sulle tre librerie),
installazione senza `--legacy-peer-deps` né `--force`, nessuna voce aggiunta a `overrides` di
root, `app/public-site/package.json` non toccato. Esito positivo: la Parte 2 di T7 (drag &
drop) e la sua copertura in T8 procedono.

**T3 — registro**: modificatore `responsive` su `EnumPropSpec`, elenco chiuso dei tre
breakpoint (`default` obbligatorio, `tablet`/`mobile` opzionali) dichiarato una volta nel
backend, sette props di stile a token chiusi compilate sui cinque tipi. `meta.props` con
etichetta/scheda/ordine per **ogni** prop di **ogni** tipo (invariante testato: una prop
senza voce fa fallire il test del registro). Nessun `v` incrementato, nessun `kind`/`reason`
nuovo, token del registro invariato — verificato dal Done di T3.

**T4 — ADR-27**: `GET api/v1/public/media/:guid`, anonima, `entity = 'page-media'` come
unico filtro di visibilità, `Content-Type` da una tabella chiusa di firme raster scritta in
casa (nessuna dipendenza nuova), SVG sempre rifiutato, 404 uniforme (mai 403), nessuna
lettura/scrittura Redis. `PUBLIC_MEDIA_BASE_URL`/`VITE_PUBLIC_MEDIA_BASE_URL` in
`.env.example`/`docker-compose.yml`, lette solo via `AppConstants`.

**T5/T6 — frontend**: strato di token CSS responsive con le tre soglie di breakpoint (prima
volta che esistono nel progetto), classi emesse per **ogni** breakpoint presente nel valore
salvato (mai solo `default`), composizione dell'URL media in un solo modulo condiviso fra i
due workspace. Ispettore a schede Contenuto/Stile costruite da `meta.props[nome].tab`/
`order`, etichette da `meta.props[nome].label` (chiude la voce 3.10), controllo desktop delle
props responsive che scrive `{ ...valore, default: nuovo }` (mai lo scalare nudo).

**T7 — duplica blocco + drag & drop**: `duplicateSubtree` rigenera l'id di **ogni** nodo del
sottoalbero (non solo la radice), `duplicateNodeAction` come comando invertibile sulle
primitive esistenti, avviso (non `400` a salvataggio) oltre `MAX_NODES`. Drag & drop con
`DndContext`/`DragOverlay` di `dnd-kit`, maniglia dedicata nella toolbar, tre segni di
rilascio distinti, `canDropInto` come predicato puro unico (compone `isDescendantOf` e
`canContainType` già esistenti — mai una regola scritta due volte), stato del trascinamento
mai nello store Zustand (verificato con un `grep`), sensore da tastiera attivo.

**T8 — copertura di test** (`test-engineer`): round-trip responsive su tutti e tre i
breakpoint (backend e2e nuovo, non eseguito in questo sandbox per assenza di
un'istanza Postgres/Redis del progetto raggiungibile — verificato a `tsc`/revisione),
unicità degli id dopo duplicazione in profondità, `canDropInto` come funzione pura, rotta
media (integration test eseguiti, 7/7 verdi — nessun test esisteva prima per questa rotta) +
`bruno/media/*.yml`, E2E drag & drop da tastiera + duplicazione (nuovi, non eseguiti in
questo sandbox — richiedono backend/frontend avviati). Correzione dell'helper e2e
`page-editor.ts` (cercava le prop per nome tecnico, invalidato da T6: ora risolve
l'etichetta leggibile dal registro generato). Segnalato, non corretto: nessun `data-testid`
sui campi dell'ispettore — task minimo consigliato per un round successivo.

**Fuori scope, dichiarato**: colonne, annidamento di `section`, navigator, schermo intero,
WYSIWYG (ADR-26) — tutti rinviati a **F04d**. Anteprima responsive assente (nessuno vede i
breakpoint `tablet`/`mobile` salvati senza un controllo UI dedicato, che questo round non
costruisce) — primo candidato del giro successivo.

---

## F04d — colonne, fullscreen, styling, preset statici (2026-08-25)

Consolidamento di ADR-31, ADR-32, ADR-33, ADR-34 (tutte approvate, una pagina ciascuna). Suite
completa verde: backend 27/27 suite (231 test), frontend 11/11 suite (191 test).

**ADR-31 — layout a colonne su `section`**: `columns`/`gap`/`alignItems`, `kind: 'enum'`,
forma per breakpoint `{ default, tablet?, mobile? }` come ADR-29 § 2; l'editor di questo round
scrive solo il controllo `default`.

**ADR-32 — schermo intero, Navigator, sidebar widget**: `FullScreenEditorLayout` sostituisce
la chrome solo sulla scheda Contenuto (nessuna rotta nuova), viewport switcher come stato di
sola chrome (non tocca i breakpoint effettivi del rendering pubblico), `EditorStructureNavigator`
legge lo store senza stato duplicato, `WidgetPalette` passa dalla `addBlockAction` già
esistente — nessuna azione nuova nello store.

**ADR-33 — `section`: contentWidth/maxWidth/colore/spaziatura per lato, `columnRatio`**:
`maxWidth` a token CSS (mai un numero nel contenuto, coerente con ADR-29 § 1), `columnRatio`
come prop separata da `columns` — non ridefinisce l'insieme chiuso di ADR-31.

**ADR-34 — Subtree Insertion Engine + preset statici**: registro JSON bundlato nel frontend
(`static-section-presets.json`), nessuna chiamata di rete, nessuna tabella nuova; ogni preset
composto solo da tipi/prop già nel registro (ADR-21) — zero nuovi tipi di blocco, zero nuovi
`kind`.

---

## Tema di installazione → sito pubblicato (2026-08-28)

**ADR-42 — il tema veste il sito, non il pannello di gestione.** Prima di questo round il
`ThemeConfig` alimentava soltanto il `MantineProvider` della chrome amministrativa: l'admin
cambiava un colore e cambiava l'aspetto del *programma*, mai quello del sito servito su
`app/public-site`. L'endpoint pubblico `GET public/settings/theme` e la prop `themeConfig`
di `App.tsx` esistevano già, ma nessuno passava l'uno all'altra: il cablaggio era a metà.

- `utils/theme-css.utils.ts` compila il `ThemeConfig` in variabili CSS (`--theme-*`), riemette
  il vocabolario dei blocchi (`--cms-*`) coi valori del tema — il ponte senza il quale una
  modifica resterebbe invisibile sul contenuto salvato — e dichiara i default `h1`–`h6` dentro
  `:where()`, a specificità zero, così una scelta esplicita sul blocco vince sempre.
- `ThemeStyleTag.tsx` inietta quel blocco in Pagina, anteprima di bozza e pagine di errore,
  **dopo** il `<link>` del foglio dei blocchi (è l'ordine che gli fa vincere la cascata).
- La chrome admin passa ai default di fabbrica; l'anteprima dal vivo dell'Editor tema è ora
  un `MantineProvider` annidato scopato alla sola colonna delle demo.
- Il Canvas dell'editor dipinge col medesimo compilatore: mostra ciò che il visitatore vedrà.
- I Global Design Tokens cessano di essere un secondo sistema di stile concorrente (drawer
  "Impostazioni Sito" ritirato dalla toolbar; endpoint e riga `app_settings` lasciati in piedi).

**Due difetti preesistenti sanati per necessità**: il bundle SSR del sito pubblico importava
`DEFAULT_THEME` da `@mantine/core` (violazione di ADR-22 § 5, ora a zero occorrenze grazie alla
foglia `theme-tokens.ts` priva di Mantine); e `reconcileThemeFromServer()`, dichiarata da ADR-4
§ 4, non era invocata da nessuno — l'Editor tema si apriva sui default su un browser nuovo.

Suite verde: frontend 31/31 suite (348 test), public-site 6/6 suite (20 test).

---

## RFC-45 — editing in-place nel Canvas, consuntivo e domanda aperta (2026-09-01)

**Parte A (consuntivo)**: verificato che l'editing in-place nel Canvas richiesto da un task
esterno — `contentEditable` su `heading`/`richText`/`button`, dispatch debounced verso
`useBlockEditorStore`, preservazione del cursore, toolbar fluttuante — è **già interamente
implementato**, non come costruzione nuova ma come round non pianificato: `PLAN-F04c-editor-
maturo.md` § T9 (righe 397-439) lo documenta a consuntivo e conclude che non serve ADR, perché
non tocca schema blocchi, `kind` né sanitizzazione server-side. `RFC-45`
(`docs/ai/rfc/RFC-45-wysiwyg-canvas-editing.md`) verifica quella conclusione invece di
riaprirla, e segnala due scarti puntuali dalla formulazione del task esterno, senza correggerli
d'iniziativa: debounce reale **300ms** (`EDIT_DEBOUNCE_MS`, `EditorBlockWrapper.tsx:244`), non
i 150ms richiesti; nessun controllo "Dimensione carattere" nella toolbar fluttuante, né in
canvas né nell'ispettore (ADR-26 § 3).

**Parte B (domanda aperta)**: l'unico pezzo realmente non costruito — formattazione ricca
(Grassetto/Corsivo/Link) su `heading.text` e `button.label`, oggi `plainText` per ADR-21 § 5 —
resta bloccato su una decisione umana. `InlineFloatingToolbar.tsx` non si monta su questi due
tipi apposta (`EditorBlockWrapper.tsx:1364-1369`): cambiarne il `kind` è modifica di schema
blocco, fuori dalla soglia che T9 ha rispettato. Tre opzioni restano aperte in RFC-45 (status
quo, nuovo `kind` dedicato, riuso di `kind: 'richText'`), nessuna approvata.

**Nota a margine, non corretta qui**: la riga F04 della tabella "Parte 2" (riga 72) descrive
ADR-26 (WYSIWYG) come "ancora in attesa di firma, rinviata a F04d" — non più corrente: ADR-26
risulta **Approvata il 2026-08-24** (`docs/ai/adr/ADR-26-wysiwyg-rich-text.md`) e la sua
implementazione (`RichTextFieldEditor.tsx`, `@mantine/tiptap` in `app/frontend/package.json`)
è presente nel repository. L'allineamento di quella riga non è oggetto di questo task e non
viene toccato qui (stesso principio di "Scarti documentali segnalati e non corretti qui" già
in uso in `PLAN-F04c-editor-maturo.md`).

---

## RFC-44 — Static Site Export Engine, redazione (2026-09-01)

Un task esterno ha chiesto un motore SSG (`StaticExportModule` NestJS/BullMQ, TTFB < 15ms,
`app/public-site` ridotto a server di anteprima) per eliminare l'esposizione runtime di
Node/Database sul sito pubblico. Redatta `docs/ai/rfc/RFC-44-static-site-export-engine.md`,
**in discussione**, nessuna decisione umana ancora registrata.

Il controllo documentale preliminare ha trovato che la proposta tocca direttamente tre ADR
già approvate il 2026-08-17, non territorio vergine: ADR-22 aveva già esaminato e **scartato
per nome** l'opzione "SSG a build time" (motivazione: incompatibile con l'NFR di
invalidazione a 5 secondi, superata dalla cache di ADR-23); il design letterale del task
("StaticExportModule renderizza HTML riutilizzando i componenti React") violerebbe inoltre
il divieto assoluto tolleranza-zero "rendering HTML nell'API" se il rendering finisse dentro
`app/backend`. La RFC risolve questo mantenendo `app/public-site` come unico renderer
(NestJS orchestra soltanto: accoda, chiama `app/public-site` via HTTP interno, scrive il
risultato su file — mai un `import` React in `app/backend`), propone stato dell'export su
manifest filesystem (zero migrazioni Postgres, coerente col vincolo dichiarato dal task
stesso), trigger sugli stessi call-site che già invalidano la cache Redis di ADR-23
(`pages.service.ts::changeStatus`, righe 385/472/553/679) invece di un event bus di dominio
che non esiste nel repository, e Deployer Adapter con solo `LocalFolderDeployer` attivo —
S3/Cloudflare Pages restano interfacce non implementate, provider esterno che richiede ADR
e approvazione propria (`CLAUDE.md` § Ask first).

Segnala esplicitamente un'alternativa più economica non richiesta dal task (reverse-proxy
cache davanti alla SSR esistente, anticipata per iscritto da ADR-22 § 6) che raggiunge la
sola prestazione senza l'isolamento Node/DB — presentata come opzione, non scelta al posto
dell'umano. Sette punti di firma esplicita in RFC-44 § "Decisione umana" (N1–N7), incluso
quale delle tre ADR toccate richiede una ADR conseguente propria o se un'unica ADR-45 le
riconcilia tutte. `docs/roadmap.md` § F03 aggiornato con un rimando alla RFC, stesso formato
già in uso per la decisione aperta di RFC-45 su F04.

---

## RFC-44 / ADR-45 — Ratifica umana e chiusura decisione (2026-09-01)

Il Project Owner ha fornito firma umana esplicita su tutti i sette punti (N1–N7) di
RFC-44 § "Decisione umana", registrata in sessione interattiva (non tramite processo di
firma separato/out-of-band): esito **Approvato**, obiettivo primario isolamento (N1),
`StaticExportModule` senza import React in `app/backend` (N2), SLA di invalidazione 5s
invariata (N3), autorizzato il nuovo target TTFB < 15ms su
`non-functional-requirements.md` (N4), solo `LocalFolderDeployer` in scope ora (N5),
`app/public-site` resta raggiungibile pubblicamente solo per l'anteprima autenticata
ADR-25 (N6), generazione di un'unica ADR conseguente invece di tre separate (N7).

Redatta e persistita `docs/ai/adr/ADR-45-ssg-export-architecture.md` (Stato: Approvato),
che reinterpreta ADR-22 (consumer HTML pubblico → `app/public-site` relegato a preview/
worker di rendering interno) e ADR-23 (cache Redis → smette di servire il traffico
pubblico anonimo, resta backend della coda BullMQ `static-export`), senza toccare
`schema.ts`. `docs/ai/rfc/RFC-44-static-site-export-engine.md` aggiornata: Status
Approvato, tutti i checkbox N1–N7 spuntati, Approvato da/Data compilati. `docs/roadmap.md`
§ F03 aggiornato da "decisione aperta" a "decisione ratificata".

**Prossimo passo**: pianificazione dell'implementazione (`StaticExportModule`, coda
BullMQ, `LocalFolderDeployer`, tombstone, sincronizzazione media) — non coperta da questo
task, di competenza backend-developer/frontend-developer su plan dedicato.

---

## RFC-46 — Dynamic Form Builder, redazione (2026-09-01)

Un task esterno ha chiesto il motore di creazione Form (Canvas: campi `text`/`email`/
`select`/`textarea`/`checkbox`/pulsante di invio) e l'elaborazione degli Invii, con un
endpoint pubblico disaccoppiato `/api/public/forms/:formId/submit` per siti esportati
staticamente. Redatta `docs/ai/rfc/RFC-46-dynamic-form-builder.md`, **in discussione**,
nessuna decisione umana ancora registrata.

Il controllo documentale preliminare ha trovato che F10 non è territorio vergine quanto il
task lo presenta: `ADR-21` § 5 aveva già nominato *"il blocco form è di F10"*, e `ADR-22` §
Conseguenza aveva già scritto per nome che *"il sito pubblico non ha JavaScript: ogni
interattività futura (form di F10, chatbot di F11) è un'isola da introdurre con la sua
decisione"* — la RFC tratta quella nota come vincolante, non come sfondo. Ne segue che la
"marca temporale minima di compilazione" richiesta da `docs/business-rules.md` § Moduli di
contatto (punto 5) non è implementabile nella sua forma classica sulla superficie statica
di produzione (ADR-45, appena approvata in RFC-44/ADR-45): presuppone un render per-visita
che un export statico non ha. La RFC non lo aggira: lo lascia come punto di firma (N6, tre
opzioni) invece di ometterlo in silenzio.

Propone tre tipi di blocco nuovi invece dei sei impliciti nel testo del task
(`form`/`form-field`/`form-submit`, con `fieldType` come `enum` a coprire
text/email/textarea/select/checkbox in un solo tipo — stesso principio di `container`,
ADR-39, contro N tipi quasi identici), separa la composizione visiva del form (nel block
tree, pubblica per costruzione) dalla configurazione operativa (destinatari e oggetto
notifica, mai una prop di blocco — riuso di `app_settings` con chiave
`form:<formKey>:settings`, per evitare che un indirizzo email finisca nella risposta JSON
pubblica di `GET public/pages`), e riusa due pattern già approvati invece di introdurne di
nuovi: `visitor-hash.util.ts`/salt giornaliero (ADR analytics) per `ip_hash` su
`form_submissions`, ed `EmailQueueService`/coda `email-queue` esistente per la notifica —
nessuna coda dedicata. L'anti-spam headless (honeypot a nome derivato via HMAC + firma HMAC
del form, un solo secret nuovo `FORM_ANTISPAM_SECRET`) è dichiarato esplicitamente
stateless e quindi non protetto da uno scraper mirato che replica l'HTML pubblicato — limite
scritto in § Rischi, non nascosto. CORS resta scoped alla sola rotta di submit (`origin:
'*'`, senza credenziali), la policy globale (`main.ts:40`) non viene toccata.

Otto punti di firma esplicita in RFC-46 § "Decisione umana" (N1–N8), incluso se i tre tipi
di blocco vanno approvati in un'unica ADR-46 (precedente ADR-21) o in tre ADR separate
(precedente ADR-39). `docs/roadmap.md` § F10 aggiornato con un rimando alla RFC, stesso
formato già in uso per le decisioni aperte di RFC-44 (F03) e RFC-45 (F04). Nessun link
rotto verificato: i riferimenti a `ADR-18`, `ADR-21`, `ADR-22`, `ADR-25`, `ADR-39`, `ADR-45`
citati nella RFC puntano tutti a file esistenti in `docs/ai/adr/`; i riferimenti di codice
(`app-constants.ts`, `email.queue.service.ts`, `visitor-hash.util.ts`, `block-registry.ts`,
`main.ts:40`, `schema.ts:103`/`:469`) verificati contro il repository al momento della
stesura.

---

## F06/F10/ADR-52 — chiusura e allineamento registro Blocchi (2026-09-03)

**F06 — Template e Sezioni globali**: ✅ Done. `GlobalSectionsModule` implementato in
`app/backend/src/global-sections/` (`global-sections.controller.ts`/`.service.ts`,
`public-global-sections.controller.ts`, `public-global-sections-cache.service.ts`),
decisione di riferimento ADR-40-sezioni-globali-e-layout.md (Approvata).

**F10 — Moduli di contatto**: ✅ Done. RFC-46 ratificata, `ADR-46-dynamic-form-builder.md`
approvata; `FormsModule` implementato in `app/backend/src/forms/` (`forms.controller.ts`/
`.service.ts`, `public-forms.controller.ts`, `form-antispam.util.ts`,
`forms-cors.middleware.ts`). `FORM_ANTISPAM_SECRET` aggiunto a `.env.example` (root e
`app/backend/`), coerente con RFC-46 § Rischi.

**Registro Blocchi — undici tipi reali**: `ADR-52-blocco-navigazione-navmenu.md` approvata
(2026-09-03), aggiunge `navMenu`/`navMenuItem` (nuovo `kind: 'pageRef'` in `PropKind`) al
registro. `DEFAULT_BLOCK_REGISTRY` (`app/backend/src/blocks/block-registry.ts`) conta ora
undici tipi: `section`, `heading`, `richText`, `image`, `button`, `container`, `form`,
`form-field`, `form-submit`, `navMenu`, `navMenuItem`. `PropertyInspector.test.tsx` copre
`pageRef` nell'elenco dei kind attesi (test "copertura del registro reale" verde, 62/62).

**Export statico (ADR-45)**: ✅ confermato Done — `ExportModule` in
`app/backend/src/export/` (`export.service.ts`, `manifest.service.ts`,
`export.processor.ts`) implementa `StaticExportModule` di RFC-44/ADR-45.
`STATIC_EXPORT_PATH`/`STATIC_EXPORT_FULL_SITE_BATCH_SIZE` aggiunti a `.env.example`
(root e `app/backend/`), allineati ai default di `app-constants.ts`.

**Debito tecnico bonificato nella stessa sessione**: 152 errori Prettier/ESLint
autofixati in `app/backend`, import morti `BorderPropSpec`/`ShadowPropSpec` rimossi da
`block-tree-validator.service.ts`, due variabili di test inutilizzate corrette, JSDoc dei
quattro costruttori del modulo F06 completati. `npm run lint --workspace=app/backend` a
zero errori (restano 7 warning `no-explicit-any` preesistenti, fuori scope).

`docs/business-rules.md` § "Menu di navigazione" marcata deprecata a favore dell'approccio
AST a blocchi di ADR-52 (vedi nota nel documento stesso).

---

## ADR-53 — Architettura Air-Gapped SSG Zero-DB, allineamento documentale (2026-09-04)

Approvata `docs/ai/adr/ADR-53-air-gapped-ssg-zero-db.md` (firma umana in sede di task, stesso
pattern di ADR-38/47/50/51/52). Supera formalmente ADR-22 (consumer HTML pubblico), ADR-23
(caching/invalidazione pubblica) e ADR-24 (routing/risoluzione slug) — tutte già annotate
"SUPERSEDED da ADR-53" nel proprio file. **Non supera ADR-45**: ne è il completamento
sull'air-gap di consegna (storage edge via push, mai pull) e sulla riduzione di
`app/public-site` a solo motore di anteprima/rendering interno, cosa che ADR-45 aveva già
anticipato ma non chiuso a livello di regola di rete.

Il controllo documentale preliminare (grep mirato su `app/backend/src/export/`,
`seo-graph.service.ts`, `queues/media-queue/`, `app/public-site/src/App.tsx` e `server.ts`)
ha verificato che **buona parte della baseline esiste già**, per non trattare F03 come
territorio vergine una seconda volta dopo RFC-44/ADR-45:

- ✅ Coda BullMQ `static-export` con job `page`/`tombstone`/`full-site`, manifest su
  filesystem, scrittura atomica (`ExportModule`, confermato Done il 2026-09-03).
- ✅ `SeoGraphService` scrive già JSON-LD/OpenGraph come dati in `revision.seo` (ADR-48).
- ✅ Worker `sharp` con preset nominati e focal point (ADR-49).
- ✅ Token di anteprima dedicato e rotta `/__preview/:token` (ADR-25).
- ❌ Nessun assemblaggio dei dati SEO in markup (`App.tsx` non legge mai `page.seo`, commento
  esplicito nel file lo dichiara fuori dal perimetro F03 originario).
- ❌ Output media limitato a `webp` fisso, nessun `avif`, nessuna dimensione persistita per
  `srcset`/CLS.
- ❌ CSS dei blocchi sempre esterno (`<link>`), nessun critical CSS inline oltre le variabili
  di tema (`ThemeStyleTag`).
- ❌ Nessun `sitemap.xml`/`robots.txt`.
- ❌ Nessuna interfaccia `StaticSiteDeployer`: la scrittura su filesystem è inline nel
  processor, nessun adapter edge/CDN.

`docs/ai/specs/SPEC-F03-superficie-pubblica.md` e `docs/ai/plans/PLAN-F03-superficie-pubblica.md`
riscritti su questa base: la spec porta una tabella "Stato reale" che distingue baseline da
delta, il piano ha sei task (tetto otto) ciascuno ancorato a una riga ❌ specifica, con T1
dedicato a verificare che il delta non regredisca la baseline. `docs/system-architecture.md`
aggiornato con una sezione dedicata (diagrammi Mermaid flowchart + sequence) che separa Piano
di Gestione e Piano di Erogazione Pubblica e dichiara la regola di air-gap come proprietà di
rete, non applicativa; tabella delle porte con `app/public-site` (55000); nota obsoleta sul
reverse-proxy-cache-davanti-al-backend corretta. `docs/roadmap.md` § F03 aggiornato: stato
**Ready for Implementation (Air-Gapped SSG)**, baseline/delta elencati, storico RFC-44/ADR-45
preservato senza riscriverlo.

**Incongruenza segnalata, non risolta in questo task**: `docs/non-functional-requirements.md`
§ Performance pubblica descrive ancora un profilo "cache calda/cache fredda" per il traffico
pubblico anonimo, che con ADR-53 non esiste più (quel traffico serve file statici, non
attraversa più Redis/PostgreSQL). La correzione richiede autorizzazione umana esplicita per
quel file — non inclusa nella richiesta che ha originato questo allineamento — ed è annotata
in `PLAN-F03` § Definition of Done come voce aperta.

**Prossimo passo**: implementazione dei sei task di `PLAN-F03-superficie-pubblica.md`
(T1 verifica baseline, T2 CSS critico, T3 media AVIF/CLS, T4 SEO/sitemap, T5 adapter edge,
T6 test), di competenza backend-developer/frontend-developer/test-engineer per task —
non coperta da questo task documentale.

---

## Riconciliazione registro ↔ repository (2026-09-11)

Task documentale su richiesta umana esplicita, autorizzato su quattro file:
`docs/ai/progress-tracker.md`, `docs/roadmap.md`, `docs/ai/plans/PLAN-F05-multilingua.md`,
`docs/ai/plans/PLAN-F09-media-library.md`. Nessuna ADR approvata è stata toccata;
`docs/business-rules.md` **non** è stato modificato (vedi D9).

### Il problema trovato

La tabella «ADR mancanti che bloccano il dominio» dichiarava quattro decisioni da prendere.
Aprendo i file: tre su quattro erano già firmate — ADR-36 dal 2026-08-25, ADR-48 e ADR-49 dal
2026-09-02. Non era una decisione da prendere: era una decisione presa e mai registrata.
L'effetto pratico è che ogni ruolo AI apriva la documentazione, leggeva che F05, F07 e F09
erano bloccate da ADR inesistenti, e si fermava.

Lo stesso disallineamento sulla tabella di Parte 2: F05, F07 e F09 risultavano ⏳ Pending. La
verifica sul codice dice altro — F05 ha endpoint, schema, indici, UI e collezioni Bruno
consegnati; F07 ha `SeoGraphService` iniettato in `PagesService` e quindi attivo a
publish-time; F09 ha quattro task su sette consegnati più l'intera pipeline `sharp` di ADR-49.
Il registro non nascondeva tre feature sbloccate: ne nascondeva due in gran parte **consegnate**
e una a tre quarti.

### Cosa è stato corretto

| Voce | Prima | Dopo |
|---|---|---|
| Tabella ADR bloccanti | 4 righe | 1 riga (solo il provider chatbot), le altre tre spostate fra le chiuse con data di firma |
| ADR-26 | «redatta, in attesa di firma» | Approvata dal 2026-08-24, riga rimossa |
| F05 / F07 / F09 | ⏳ Pending | 🔄 In progress, con l'elenco puntuale di cosa è consegnato e cosa resta |
| F08 / F12 | ⏳ Pending | 🔄 In progress (parziale): verificate durante la riconciliazione, hanno entrambe codice in produzione (`PageSeoDto.faq` + `FAQPage` in `SeoGraphService`; `PageDashboard.tsx`). Nessuna delle due ha un plan aperto — il perimetro va delimitato prima di parlare di chiusura |
| `PLAN-F05` M1–M6 | `[ ]` | `[x]`, firmati 2026-08-25 |
| `PLAN-F09` N2/N4/N6 | `[ ]`, T2 bloccato | `[x]`, firmati 2026-09-11, T2 sbloccato |

### Firme raccolte nello stesso giro

- **N2 / N4 / N6** di `RFC-F09-media-library.md`, firmati il 2026-09-11. N2 non era un
  "nice to have": `files.service.ts` restituisce `width: null, height: null` hardcoded con un
  commento che cita la firma mancante, mentre `media.types.ts` il campo lo dichiara già.
  **Rettifica del 2026-09-11**: una prima stesura di questa stessa sezione sosteneva che N2
  fosse il prerequisito della clausola di conformità di ADR-53 sul CLS e che senza le colonne
  quel gate non fosse implementabile. **È falso, verificato sul codice**:
  `ExportProcessor.readIntrinsicDimensions()` legge le dimensioni con `sharp` dal buffer che
  sta già copiando e `augmentImgTag()` le inietta nel markup. N2 serve alla libreria media
  dell'amministrazione — senza, `GET app/files` dovrebbe aprire ogni blob — non all'HTML
  esportato. Il gate di CI resta da scrivere (`PLAN-F03` T3), ma era scrivibile anche prima.
- **Revisioni**: sciolta la contraddizione regola 2 ↔ regola 5 rinviata da ADR-19, con
  **ADR-61 — Retention delle Revisioni** (opzione «retention dichiarata»): la potatura esiste
  solo come processo di sistema, mai come azione utente, mai sull'ultima pubblicata, mai come
  soft delete su una tabella append-only.

### Consegnato nello stesso giro (2026-09-11, secondo blocco)

Su autorizzazione umana esplicita («completiamo tutto»), oltre alla riconciliazione:

**`business-rules.md` § Revisioni e cronologia riscritto** per applicare ADR-61 — da 5 regole
contraddittorie a 9 coerenti. D9 è chiuso.

**T2 di `PLAN-F09` implementato** (backend):
- migrazione additiva `0014_add_files_dimensions` — `files.width`/`files.height` nullable e
  indice `(entity, created_at)`. Nessun backfill: le righe preesistenti restano a `null`;
- `readRasterDimensions()` in `raster-mime-sniffer.ts` — JPEG, PNG, GIF, WebP (VP8/VP8L/VP8X)
  e AVIF (box `ispe` dentro `meta`), **dai soli header**, nessuna dipendenza npm nuova.
  `sharp` non è importato: ADR-49 § Conformità lo confina al worker BullMQ e questo codice sta
  nel percorso di una richiesta HTTP;
- verifica della firma raster **in scrittura** per `entity='page-media'` → `400` normalizzato,
  nessuna scrittura su storage né DB. Lo storage documenti di ADR-8 non regredisce: un PDF con
  `entity='invoice'` resta accettato come prima;
- `FileMetadataDto` smette di restituire `null` hardcoded; il contratto OpenAPI passa da
  `Record<string, never>` a `number | null`;
- 18 test unit sul parser, 5 sul service, 3 di integrazione; Bruno `Upload Media` e
  `Upload Media - Non Raster`.

**Potatura delle Revisioni di ADR-61 implementata**: chiave `app_settings`
`revisions.retentionCount` con `GET`/`PUT app/settings/revisions-retention` (Admin+, audit
logged), coda `revisions-retention-queue` con repeatable job BullMQ (mai `@Cron`), doppio
interruttore — `REVISIONS_RETENTION_ENABLED` a livello di deploy e la soglia a livello di
policy, `0` = nessuna potatura, che è il default. 13 test, di cui 6 sull'invariante di
protezione isolata in una funzione pura (`computeProtectedRevisionIds`).

**Tre suite di test rotte prima di questo giro, riparate**:
- `files.e2e-spec.ts` (16 test) e `settings.e2e-spec.ts` (48) non compilavano il modulo di
  test: mancavano i provider `MediaQueueService` (aggiunto a `FilesService` da ADR-49) e
  `ExportService` (aggiunto a `SettingsService` da ADR-45/53). Ogni test della suite falliva
  in `beforeEach`, non su un'asserzione;
- `pages-diff-restore.e2e-spec.ts` calcolava a mano `page.version + 1` fra due pubblicazioni,
  ma un ciclo PATCH+publish incrementa **due** volte: il lock ottimistico rifiutava con `409`.
- Complessivamente la suite e2e passa da **18 suite / 186 test rossi** a **1 suite / 5 test
  rossi**, e i 5 rimasti sono il debito D2 (contratto tema), non un difetto nuovo.

### Consegnato nello stesso giro (2026-09-11, terzo blocco)

**T5 di `PLAN-F05` implementato**: `PublicPageDto.translations` (locale + percorso canonico
delle altre traduzioni pubblicate del gruppo). `PLAN-F05` è **completo**. Due difetti trovati
costruendolo e corretti: l'invalidazione di cache cross-traduzione
(`invalidateTranslationGroup`) e la canonicalizzazione dei percorsi composti da una riga, che
mancava anche a `resolveByGuid` e produceva `href` di menu verso un `308`. 6 test e2e nuovi.

**Guard di `PUT app/settings/theme` ripristinato.** Il commit `8b272f7` (2026-09-09, messaggio
"size") aveva rimosso `GuardSuperAdmin` **senza sostituirlo**: dal 9 settembre un qualunque
utente autenticato — ruolo `User` compreso — poteva riscrivere il tema dell'intero sito, e la
voce "Editor tema" era visibile a tutti nella sidebar. Non era una decisione: ADR-4 § 4
prescrive `GuardSuperAdmin`, il JSDoc del componente frontend continuava a dire SuperAdmin e
il test e2e continuava ad attendersi `403`. Ripristinata la conformità su entrambi i lati
(guard + `roles` sulla voce di navigazione). **Spostare la soglia ad Admin resta possibile,
ma richiede una ADR che superi ADR-4.**

**`ADR-62-contratto-tema-v8.md` firmata il 2026-09-12** (marketing@antelmagroup.net).
Ratifica il contratto `v8` (sezione `layout`: larghezza boxed, margini e rientri per lato con
unità), la catena di migrazione in lettura `v1→…→v8` e la conferma della soglia SuperAdmin.
Contestualmente alla firma — mai prima — i 4 test di migrazione di `settings.e2e-spec.ts`
asseriscono `version: 8` e ne dichiarano il contratto nel titolo. **D2 chiuso**: la suite e2e
non ha più test rossi.

### Header `Status` delle RFC incoerenti con la propria firma

Rilevati il 2026-09-11, **corretti il 2026-09-12** su autorizzazione umana esplicita per
questi quattro file: la sezione «Decisione umana» era firmata ma l'intestazione in cima al
file diceva ancora `[x] In discussione`, e chi apriva il documento dall'alto leggeva
l'opposto di quello che c'era in fondo — la stessa dinamica che teneva F05 ferma per due
settimane e mezzo. È cambiato **solo** l'header `Status`; nessun'altra riga di quelle RFC.

| RFC | Decisione in fondo | Header in cima |
|---|---|---|
| `RFC-31-layout-colonne-section.md` | Approvato | ~~`[x] In discussione`~~ → `[x] Approvato` |
| `RFC-38-block-schema-expansion-elementor-parity.md` | Approvato · Modificato | ~~`[x] In discussione`~~ → `[x] Approvato` |
| `RFC-F04d-template-library.md` | Approvato | ~~`[x] In discussione`~~ → `[x] Approvato` |
| `RFC-F09-media-transform-pipeline.md` | Approvato (M1–M8) | ~~`[x] In discussione`~~ → `[x] Approvato` |

### F03 — delta reale verificato sul codice (2026-09-11)

`PLAN-F03-superficie-pubblica.md` ha sei task e nessuna casella spuntata, ma la checklist
vuota non significa che nulla sia stato fatto. Verifica contro il codice:

| Task | Stato reale |
|---|---|
| T1 — non regressione della baseline | ~~Parziale~~ → **Fatto il 2026-09-12**, vedi § «F03 — T1 e T3 chiusi» sotto |
| T2 — CSS critico inline | **Fatto**: `app/public-site/src/App.tsx`, `entry-server.tsx`, `PreviewDocument.tsx` |
| T3 — media AVIF/WebP multi-risoluzione, `width`/`height`, CLS = 0 | **Fatto**: `ExportProcessor` compone `<picture>` con `srcset` AVIF/WebP (`renderMediaMarkup`), legge le dimensioni intrinseche con `sharp` (`readIntrinsicDimensions`) e le inietta con `aspect-ratio` (`augmentImgTag`). ~~Manca solo il gate di CI~~ → **gate scritto il 2026-09-12** (`check-exported-images.js`, step `Gate immagini esportate` del job `backend`): T3 è chiuso |
| T4 — SEO/JSON-LD/OpenGraph nel documento + `sitemap.xml`/`robots.txt` | **Fatto**: JSON-LD in `app/public-site/src/App.tsx`, sitemap e robots rigenerati a fine batch da `ExportProcessor` |
| T5 — adapter di consegna edge e air-gap di rete | **Parziale**: esiste l'astrazione (`export/deploy/static-site-deployer.interface.ts`) con un solo deployer, `local-folder.deployer.ts`. Manca l'adapter edge vero e la verifica dell'air-gap di rete |
| T6 — test della superficie pubblica air-gapped | **Da fare**: nessuna suite dedicata all'air-gap |

**Ordine per dipendenza di ciò che manca**: gate di CI di T3 (isolato, nessuna dipendenza) →
adapter edge di T5 → T6 (verifica l'air-gap che T5 deve prima garantire) → chiusura di T1.

> Correzione del 2026-09-12 alla riga sopra: «nessuno dei tre è bloccato da una firma» **era
> sbagliata per T5**. L'audit dell'11 settembre aveva letto il task come lavoro di
> refactoring, ma l'adapter di consegna edge *è* la scelta di un provider concreto, e sia
> `PLAN-F03` T5 («nessun provider esterno attivato senza ADR propria») sia
> `static-site-deployer.interface.ts` sia `CLAUDE.md` § Ask first la subordinano a una firma
> che non esiste. T1 e T3 sono chiusi; T5 è **bloccato**, e T6 con lui per dipendenza
> dichiarata.

> Nota di conformità rilevata durante l'audit, **non sanata**: `export.processor.ts` importa
> `sharp` (via `require` CJS isolato) per la sola lettura dei metadati, mentre ADR-49
> § Conformità dice «`sharp` non è mai importato fuori da
> `app/backend/src/queues/media-queue/`». La sostanza della regola è rispettata — nessuna
> trasformazione pixel-level, e il codice sta in un worker BullMQ, non in un controller — ma
> la lettera no. Da sciogliere con una riga nella ADR che ratificherà il perimetro di F03, non
> spostando il file.

### Prossimo passo

Il backlog implementativo è vuoto. Restano **decisioni**, non lavoro:

| Voce | Cosa serve |
|---|---|
| **T6 di `PLAN-F09`** (immagini in RichText) | Decisione di sicurezza sull'allowlist di ADR-20 (`<img>` nel rich text sanitizzato) |
| **D6/D7** (RFC-40, RFC-43) | Firme su documenti in bianco, con `site_templates` già in produzione |
| **D8** (RFC-F06) | Firma retroattiva su una feature già chiusa |
| **D1** (ADR-13, ADR-17) | Firme su codice già in produzione |
| **T5 di `PLAN-F03`** (adapter di consegna edge) | Firma su un provider concreto — ADR-53 § 4 ne lascia tre aperti (CDN edge, bucket S3-compatibile, volume Nginx isolato) e non ne sceglie nessuno. Serve una RFC (**RFC-62**, primo numero libero) e l'ADR che ne discende (**ADR-63**). Nessuna riga di codice prima della firma: `PLAN-F03` T5 e `static-site-deployer.interface.ts` vietano perfino lo stub |
| **T6 di `PLAN-F03`** (suite air-gap) | Dipendenza dichiarata da T5: verifica la proprietà che l'adapter deve garantire |
| **F11 chatbot** | Unica ADR di dominio davvero mancante; non blocca nulla finché F03/F08 non sono chiuse |
| **`version` sulle 4 entità mutabili storiche** | Task a sé già dichiarato in `CLAUDE.md` § Database, da non retrofittare dentro una feature |

---

## F03 — T1 e T3 chiusi, T5/T6 bloccati (2026-09-12)

### T3 — gate di CI delle immagini esportate: **chiuso**

`check-exported-images.js` (root, stesso posto e stesso stile di
`generate-blocks-types.js`) ispeziona l'HTML **realmente scritto dal job di export** e esce
`1` se un `<img>` non porta `width`/`height` interi positivi. Esce `1` anche quando non
trova alcun documento da ispezionare: un gate che non ha guardato nulla non è un gate verde,
ed è il modo più comune in cui un controllo di CI smette di controllare senza che nessuno se
ne accorga.

Gli artefatti li produce la suite di export già esistente
(`export.processor.integration.spec.ts`), che copia il documento in
`STATIC_EXPORT_ARTIFACT_DIR` quando la variabile è valorizzata — solo in CI, no-op in
locale. La copia è necessaria perché la fase 2 dello stesso test è un tombstone, che rimuove
il file dal filesystem: il gate troverebbe una directory vuota.

Verificato nei tre esiti: export valido → verde; stesso documento privato di
`width`/`height` → rosso con il tag colpevole in `::error file=`; directory vuota o assente
→ rosso.

### T1 — non regressione della baseline (ADR-45/48/49/25): **nessuna regressione**

Verificato su codice e suite, non sulle caselle del piano:

| Proprietà dichiarata dal task | Esito |
|---|---|
| La coda `static-export` accoda e processa i tre tipi di job | ✅ `page`/`tombstone`/`full-site` in `export.types.ts` e nello `switch` di `ExportProcessor`, ognuno con `describe` proprio in `export.processor.spec.ts` |
| Il tombstone rimuove fisicamente il file | ✅ asserito su filesystem reale (`existsSync(...) === false`), non su un mock del deployer |
| `SeoGraphService` scrive `revision.seo` dentro `publishTransactionally()` | ✅ `generateSeoMetadata` chiamato **prima** della transazione, `seo: enrichedSeo` nell'`INSERT` della Revisione dentro `db.transaction` |
| Il worker media produce WebP non distruttivo con focal point | ✅ `media.processor.ts`: `webp` (q80) e `avif` (q60) come righe derivate con `parentFileId` verso l'originale, mai riscritto; ritaglio centrato sul focal point |
| `/__preview/:token` risponde solo con token valido e mai in cache | ⚠️ vedi sotto |

**Gap registrato, non corretto** (T1 § Criterio di Done: le regressioni si registrano come
bug a sé, non si correggono dentro il task): le risposte di `/__preview/` portano sempre
`X-Robots-Tag: noindex, nofollow, noarchive` — senza eccezioni, anche sul `500` non
gestito — ma **nessun `Cache-Control`**. La lettura è fresca lato server, come vuole ADR-25
(nessuna cache Redis sull'anteprima), però un proxy o il browser possono trattenere l'HTML
di una bozza. Non è una regressione — non c'è mai stato — è un requisito mai implementato.
Rimedio quando verrà deciso: `Cache-Control: no-store` in `securityHeaders()` o nel ramo di
anteprima di `server.ts`.

> **Corretto il 2026-09-13** (commit `5910186`): `Cache-Control: no-store, private` nel ramo di
> anteprima di `server.ts`, su ogni esito. Non in `securityHeaders()`, che avrebbe reso non
> cacheabili anche le Pagine pubblicate e il CSS con fingerprint (ADR-53 § 2).
> `test/preview-cache-control.spec.ts` asserisce entrambe le cose.

### T5 e T6 — bloccati da una firma mancante

Vedi § Prossimo passo. In sintesi: l'adapter di consegna edge non è un refactoring ma la
scelta di un provider, e le tre fonti che la governano (`PLAN-F03` T5,
`static-site-deployer.interface.ts`, `CLAUDE.md` § Ask first) la subordinano tutte a un'ADR
che non esiste. Servono **RFC-62** e **ADR-63** (primi numeri liberi: RFC-61 e ADR-62 sono
occupate).

---

## Firme di sblocco (2026-09-13)

Su richiesta umana esplicita, dopo una sessione chiusa senza registrare le firme concordate.
Ogni firma è stata riconfermata in chat punto per punto prima di essere scritta, e ogni
ratifica di codice già in produzione è stata verificata sul codice, non sui registri.

### Firme raccolte

| Documento | Esito | Conseguenza |
|---|---|---|
| `RFC-62-consegna-statica-e-air-gap.md` | Approvato, M1–M6 | `ADR-63-consegna-statica-volume-nginx-isolato.md`: volume Nginx isolato, reti `mgmt_net`/`edge_net`, nessuno stub di provider. Sblocca `PLAN-F03` T5 e T6 |
| `RFC-40-theme-builder-template-registry.md` | **Modificato** | `ADR-64-template-di-tema-site-templates.md`: ratifica `site_templates` come Theme Builder a sé (Opzione B), soglia Manager. Chiude D6 |
| `RFC-43-categorie-e-template-pagina.md` | Approvato | N1 = A (nessuna Categoria), N3 = A (estendere `site_templates`). Nessuna ADR. Chiude D7 |
| `RFC-F06-template-sezioni.md` | Approvato | Opzione C, già realizzata da ADR-34 e ADR-56. Chiude D8 |
| `ADR-17-state-management-zustand.md` | Approvata | Ratifica. Chiude D1 insieme alla scoperta che ADR-13 era approvata dal 2026-07-23 |

### Cosa è emerso verificando il codice prima di firmare

- **RFC-40**: il commento di `schema.ts` dichiarava «Opzione B, decisione umana 2026-08-31»,
  cioè l'opzione che la RFC **non** raccomandava, con due scostamenti che la firma ora
  registra: `single_post`/`archive` persistiti nell'enum senza semantica, e **nessun
  consumer** del resolver. Né `app/public-site` né `ExportProcessor` chiamano
  `TemplateResolverService`: oggi un Template di tema non cambia il sito pubblicato.
  ADR-64 § Conseguenze elenca le due precondizioni per collegarlo (decisione sul
  rigenerare l'export, vincolo di `language` sulle lingue del sito).
- **ADR-17**: il criterio di conformità 1 («`grep createContext` vuoto») non è soddisfatto
  alla lettera da `InvalidBlockContext` in `EditorBlockWrapper.tsx`, Context locale
  all'editor. Ammesso nella nota di firma.
- **ADR-63**: `STATIC_EXPORT_PATH` vale `./dist/static-export` in `.env.example` e
  `dist/static-site` come default in `AppConstants`. Allinearli fa parte di T5.

### Incoerenza nuova, non sanata

`RFC-61-rate-limit-superficie-pubblica-consumer-ssr.md` è **non firmata**, con tre valori
numerici da fissare in sede di firma, e nessuna riga di codice ne discende (nessun throttler
`ssr` nel backend). Il suo footer dice «Genera ADR-61», ma `ADR-61` è stata assegnata l'11
settembre alla retention delle Revisioni: l'ADR conseguente, se firmata, prenderà il primo
numero libero (oggi **ADR-65**). Non era in nessun registro.

### Prossimo passo

| Voce | Stato |
|---|---|
| **T5 di `PLAN-F03`** | **Pronto**. Solo config di root (Backend Developer): servizio `nginx-static` e reti in `docker-compose.prod.yml`, conf Nginx con le regole di cache di ADR-53 § 2, allineamento di `STATIC_EXPORT_PATH` |
| **T6 di `PLAN-F03`** | Pronto dopo T5 (Test Engineer): asserzioni di ADR-63 § 3 sulla topologia versionata |
| **RFC-61** (rate limit pubblico) | Decisione umana: tre valori numerici |
| **T6 di `PLAN-F09`** (immagini in RichText) | Decisione di sicurezza sull'allowlist di ADR-20 |
| **F07/F08/F12** | Perimetro residuo da delimitare prima di dichiararle chiuse |
| **F11 chatbot** | ADR del provider, non urgente |
| **`version` sulle 4 entità mutabili storiche** | Task a sé (`CLAUDE.md` § Database) |

---

## Chiusura del riallineamento (2026-09-13)

Secondo giro dello stesso giorno, su richiesta umana esplicita di chiudere documentazione e
problemi aperti prima di riprendere lo sviluppo. Tutto verificato sul codice e sulla CI locale
completa (lint, unit, e2e con Postgres/Redis reali, build, sync OpenAPI e registro blocchi,
gate immagini, gate air-gap con container reali).

### Decisioni firmate

| Documento | Esito |
|---|---|
| `ADR-65-layout-export-su-url-pubblico.md` | Il file esportato vive all'URL pubblico; `composePublicPath` unico calcolo |
| `ADR-66-sharp-in-lettura-nel-worker-di-export.md` | `sharp` ammesso nel worker di export solo per i metadati, dopo `files.width/height` |
| `ADR-67-eventi-di-export-e-render-riservato.md` | Nessuna cache Redis pubblica; export/tombstone per evento; `public-site` rende solo per il worker |
| `RFC-61-rate-limit-superficie-pubblica-consumer-ssr.md` | **Rifiutata**: superata da ADR-63 |
| `RFC-F04c-editor-maturo.md` | Decisioni registrate: erano già approvate il 2026-08-20 via ADR-27/28/29/30 |

### Difetti trovati e corretti

| Difetto | Effetto | Correzione |
|---|---|---|
| Export chiedeva a `public-site` il percorso senza prefisso di lingua | Pagine non di default in 404 o nella lingua sbagliata; sitemap con URL errati; home esportata come `/home` | ADR-65 |
| Nessun servizio statico e nessuna rete separata | Air-gap solo dichiarato | ADR-63: `nginx-static` su `edge_net`, `check-air-gap.js` in CI |
| Chiavi Redis `public:*` ancora scritte | Violazione di ADR-53 § Conformità | ADR-67 |
| Traduzioni sorelle non riesportate | `hreflang` stantio sui file statici | ADR-67 |
| Spostamento di un ramo pubblicato riesportava solo la radice | Discendenti con file ai vecchi percorsi | ADR-67 (tombstone del sottoalbero + rebuild) |
| `public-site` rendeva Pagine a chiunque | Violazione di ADR-53 § Conformità | ADR-67 (`EXPORT_RENDER_SECRET`) |
| Render di export contati come visite; chiamata a endpoint di ingest rimosso | Analytics sporche | ADR-67 |
| `manifest.json` sotto la radice pubblica | Esposto da Nginx | Negato in `nginx/static-site.conf` |
| `console.log` di avvio in `public-site` | Divieto di `CLAUDE.md` | `process.stdout.write` |
| `.env.example` di `public-site` con un valore esadecimale per `ANALYTICS_INGEST_SECRET` | Segreto dall'aspetto reale in un file versionato | Variabile rimossa |

### Documenti allineati

`CLAUDE.md` (decisioni aperte, superfici API, tabelle presenti, scenario di test obbligatorio),
`docs/system-architecture.md` (topologia concreta), `docs/non-functional-requirements.md`
(superficie pubblica statica), `docs/roadmap.md` (F03/F09 Done, residuo di F07/F08/F12 per
esteso), `SPEC-F03` (layout), `PLAN-F03` e `PLAN-F09` (Definition of Done), header delle RFC.

### Resta aperto — e non blocca lo sviluppo

| Voce | Tipo |
|---|---|
| **Raccolta analytics sul sito statico** (pixel, log Nginx, altro) | Decisione, prima di nuovi widget di traffico in F12 |
| F07: `hreflang` in sitemap, redirect (tabella `redirects` da approvare) | Sviluppo + ADR di schema per i redirect |
| F08: `llms.txt` e direttive per crawler AI | Sviluppo |
| F12: widget editoriali | Sviluppo |
| F11 chatbot | ADR del provider, non urgente |
| File orfani se cambia la lingua di default (ADR-65) | Miglioria prima di rendere il cambio ordinario |
| `version` sulle 4 entità mutabili storiche | Task a sé (`CLAUDE.md` § Database) |
| `EXPORT_RENDER_SECRET` nel `.env` di produzione | Operativo, al prossimo deploy |

# CLAUDE.md — CMS

> Fonte canonica delle regole operative. Vince su ogni mirror (`.claude/agents/`, `.kilo/agents/`, `.github/agents/`); perde solo contro `docs/constitution.md`. Ultima revisione: 2026-08-13 — versione compatta.

## Identità

CMS **headless** orientato a **Pagine** (super clone WordPress/Elementor): blocchi visuali, versionate, tradotte, SEO/GEO-ready, servite via API. Non è un blog engine. Pilastri: editor a blocchi (F02/F04/F06), SEO/GEO (F07/F08), form di contatto (F10), multilingua (F05), dashboard (F12), temi/risorse (F09), chatbot (F11). Feature fondativa: **F01 — Gestione Pagine**.
**Stack**: NestJS 11 · TypeScript 5 · Drizzle ORM · PostgreSQL · Redis · BullMQ · Socket.io · React 19 · Vite · Mantine v7 · Axios · React Router · Zustand.
**Base già presente — non re-implementare**: auth JWT (access+refresh rotation), RBAC a soglie, MFA TOTP, audit log, impersonificazione SuperAdmin, utenti/profilo/sessioni, notifiche realtime, storage documenti, export Excel/PDF, health check, scheduling, tour guidato, theme customizer.

## Lettura obbligatoria

`docs/constitution.md` → `docs/business-rules.md` → `docs/glossary.md` → `docs/roadmap.md` → spec/feature rilevante → `docs/openapi.yaml` (contratti) → `docs/system-architecture.md` (moduli/porte) → `docs/non-functional-requirements.md` (soglie qualità).
Gerarchia decisioni: Constitution → Business Rules → Glossary → System Architecture → NFR → RFC → ADR → Feature → Spec → Plan → Task → **Code**. Solo il codice è territorio autonomo AI.
**Anti-hallucination**: info non in `docs/` → STOP e chiedi. Mai inventare endpoint, tabelle, DTO, tipi di blocco, business rules. Ogni assunzione va dichiarata per iscritto.

## Ruoli

Attivazione: "Agisci come **<Ruolo>**". Task piccoli già coperti da questo file non richiedono delega.
Regole comuni a tutti i ruoli: leggono la constitution prima di tutto · solo il task corrente, zero refactoring fuori scope · constitution vince su ogni spec in conflitto · no `any` senza commento · file completi, zero placeholder/TODO non pianificati · info mancanti → STOP, mai inventare · RFC/ADR/spec/plan richiedono firma umana, mai auto-approvati.

### Orchestrator
Senior Solution Architect. Audit + piano operativo (max 8 task, con agente/output/dipendenze/Done per ciascuno). **Non scrive codice applicativo, non usa il terminale, non modifica sorgenti.** Scrive solo in `docs/ai/rfc/`, `docs/ai/specs/`, `docs/ai/plans/` su richiesta esplicita.
Verifica sempre: rispetto delle 8 regole del modello di contenuto · nessuna feature costruita su assunzioni non confermate o decisioni aperte bloccanti (in tal caso il primo task è sbloccarle) · over-engineering (rischio concentrato in editor visivo e chatbot) · presenza di ADR per le decisioni architetturali (altrimenti primo task = RFC).
ADR obbligatoria per: schema blocchi e versionamento, revisioni, caching/invalidazione pubblica, modello multilingua, routing slug, pipeline media/SVG, provider chatbot, sitemap/structured data, consumer HTML pubblico, ownership permessi editoriali, nuove dipendenze npm pesanti, e ogni altra decisione architetturale (auth, ORM, eventi, websocket, integrazioni esterne). ADR approvata non si modifica: si supera con nuova ADR (`Superseded da ADR-XXX`). ADR 1–17 = lessico storico, non si aggiornano.

### Backend Developer
Solo `app/backend/`. Mai frontend. Legge: constitution → business-rules → spec → plan. Modulo = `<mod>.module/controller/service.ts` + `dto/`. Env solo via `AppConstants`, mai `process.env`. Logger NestJS, mai `console.log`. DTO con class-validator + `@ApiProperty()`. Errori normalizzati da `AllExceptionsFilter`, mai dettagli SQL in risposta.
Dominio CMS: validazione albero blocchi integrale (400 con path colpevoli, mai salvataggio parziale) · sanitizzazione rich text server-side pre-persistenza · macchina a stati esplicita · pubblicazione transazionale (Revisione+Pagina+audit) · concorrenza ottimistica (`WHERE version=:version`, 0 righe → 409) · unicità slug da constraint DB → 409, mai SELECT preventiva · ownership per riga per "proprie bozze" · endpoint `public/` sola lettura/solo published/404 mai 403 · API non renderizza mai HTML · invalidazione cache nella stessa operazione · email solo via coda BullMQ · job con side-effect come repeatable job, mai `@Cron`. Dopo ogni endpoint nuovo: `openapi:export` + `openapi:types`.

### Frontend Developer
Solo `app/frontend/`, React 19 + Mantine v7. Mai server-side. Legge: constitution → spec → plan → `docs/openapi.yaml`. Consulta MCP `mantine` per props/pattern reali, mai a memoria.
**Regola Mantine**: obbligatoria per chrome admin/editor (layout, pannelli, form, liste). **I componenti dei blocchi non importano Mantine** — solo CSS Modules e markup semantico (il contenuto sopravvive alla dashboard). Vietati ovunque: `createStyles`, Tailwind, altre UI lib, stili inline invasivi, wrapper custom su Mantine. Form chrome: `useForm`. Feedback: `notifications.show`. Icone: `@tabler/icons-react`. Conferme: `Modal`/`Drawer`, mai `window.confirm`.
API solo da `src/services/<mod>.service.ts`, sempre try/catch + notifications. Struttura: `src/pages/<mod>/Page<Nome>.tsx`, `src/services/`, `src/types/`; hooks/layouts/libs/types flat, solo `components/` con sottocartelle. Riusa hook esistenti (`usePaginatedList`, `useColumnVisibility`, `useAuth`, `useColorScheme`).
Dominio CMS: ogni blocco in Error Boundary dedicato · selettori Zustand mirati (mai render dell'intero albero) · 409 conflitto editing ≠ 409 slug duplicato, mai overwrite silenzioso · validazione client solo UX · alt-text immagine bloccante · checklist SEO/GEO consultive, mai bloccanti.

### Test Engineer
Solo test/`e2e/`/`bruno/`. **Mai logica applicativa** — bug trovati si segnalano, non si correggono. Legge: constitution → spec → plan → openapi.
Ogni endpoint nuovo/modificato → `bruno/<mod>/*.yml` (OpenCollection, `Authorization: Bearer {{token}}`) · integration test Supertest con JWT+cookie simulati · mock obbligatori per servizi esterni (SMTP, Socket.io, LLM) · no `any` su mock/payload, no test placeholder.
Copertura minima/endpoint: happy path, 1 errore, 1 RBAC non autorizzato. Copertura dominio obbligatoria: XSS neutralizzato a DB · blocchi con type/nesting/props invalidi sempre respinti per intero · ogni transizione di stato non ammessa → 400 · pagina non pubblicata mai raggiungibile (404) · doppio salvataggio concorrente → 409 senza perdita dati · autore non modifica bozze altrui · Revisioni immutabili senza eccezioni · cache invalidata dopo archiviazione.

## Architecture

**Una ADR sta in una pagina.** Struttura obbligatoria e sufficiente: **decisione** · **alternative scartate, una riga ciascuna** · **conseguenza**. Nient'altro. Niente ricostruzione del contesto già scritto altrove, niente sezioni di conformità, niente tabelle di scenari, niente citazioni estese del codice: quel materiale vive nella **spec** (cosa si costruisce) o nel **codice** (come funziona davvero). Una ADR registra una decisione e la rende contestabile in futuro — non la documenta.
Vale dalla ADR-19 in poi. ADR 1–18 restano com'erano scritte: non si riformattano (una ADR approvata non si modifica).

## Superfici API

| | Admin | Pubblica |
|---|---|---|
| Prefisso | `api/v1/app/<mod>` | `api/v1/public/<risorsa>` |
| Auth | JWT + RBAC soglie | Anonima |
| Operazioni | R/W, tutti gli stati | Sola lettura, solo `published` |
| Cache | Mai | Redis, invalidazione per evento |
| Errore risorsa non visibile | 403 | **404 sempre** |

Prefix globale `api/v1`. JWT middleware esclude `auth/*`, `health`, `/metrics`, `public/*`. Paginazione `?p=&i=&q=&o=&d=` → `Pagination<T>`. URL admin con `guid` (16 hex), pubbliche con `slug` (+ `locale`).

## Modello di contenuto (vincolante)

1. Pagina = entità centrale, nessun tipo "post" privilegiato.
2. Contenuto = albero Blocchi in `jsonb`, validato server-side contro registro tipi. Mai HTML opaco.
3. Ogni pubblicazione → Revisione immutabile; rollback = ripubblicazione, mai riscrittura storia.
4. Bozza e pubblicato coesistono.
5. Ogni Pagina ha un `locale`; traduzioni = righe autonome in gruppo di traduzione.
6. Slug = identificatore pubblico (unico per locale+genitore).
7. SEO/GEO nel contratto della Pagina, non plugin a parte.
8. Cache pubblica invalidata per evento, mai per TTL.

> GEO = Generative Engine Optimization (non geolocalizzazione) — assunzione A1 confermata 2026-08-13.

## Decisioni aperte — non costruirci sopra

- **Consumer HTML pubblico**: l'API non renderizza HTML ma i crawler AI non eseguono JS → serve ADR (SSR/SSG/prerender). Bloccante F03/F07/F08.
- **Potatura delle Revisioni**: rinviata da ADR-19. Le regole 2 e 5 di `business-rules.md` § Revisioni si contraddicono e vanno sciolte **prima che esista contenuto in volume**. Nessuna retention si implementa nel frattempo.
- ~~Ownership per riga permessi editoriali~~ → **chiusa**: ADR-18 approvata il 2026-08-17 (P1/P2/P3 incluse).
- ~~Sanitizzazione HTML server-side~~ → **chiusa**: ADR-20 approvata il 2026-08-17, libreria `sanitize-html`.
- **Assunzioni**: A1–A5 confermate (A2/A3/A4/A5 il 2026-08-17, vedi `docs/business-rules.md`); resta aperta solo **A6** (chatbot), che non blocca nulla. **A5 = mono-sito, più lingue**: nessun `siteId`, unico innesto futuro `Utils.applyScopeFilter(authInfo)`.

## Database

Schema unico `app/backend/src/db/schema.ts` — ogni modifica richiede approvazione umana.

**Struttura obbligatoria — dipende dalla natura della tabella.**

*Entità mutabile* (riga che si aggiorna nel tempo: `users`, `app_settings`, `files`, `notifications`, `pages`) → struttura completa:
```
id serial PK · guid char(16) (URL admin) · version int NOT NULL DEFAULT 1 (lock ottimistico)
isActive boolean (soft delete) · createdAt/updatedAt · createdBy/updatedBy → users.id
```
*Tabella append-only* (riga scritta una volta e mai più toccata: `audit_log`, `page_revisions`) → **solo**:
```
id serial PK · guid char(16) · createdAt · createdBy → users.id
```
Su una tabella append-only `updatedAt`/`updatedBy` sono colonne morte che dichiarano un percorso di modifica inesistente, `isActive` è lo scivolo verso una cancellazione logica vietata, e `version` protegge da una concorrenza che non esiste. L'immutabilità si afferma nello schema, non solo nei commenti. (`audit_log` usa `userId` nel ruolo di `createdBy`.)

> Le quattro entità mutabili già in produzione non hanno `version`: divergenza nota e **non sanata**, il cui allineamento è un task a sé — non si retrofitta dentro una feature di dominio.
FK sempre `{onDelete:'restrict', onUpdate:'restrict'}` · `relations()` dopo le tabelle · migrazioni `drizzle-kit generate → migrate`, mai `push` in prod · contenuto in `jsonb`, mai testo JSON serializzato · indici su `slug`/`locale`/`status`/ogni FK · `Utils.applyScopeFilter(authInfo)` se multi-tenant · password con `Utils.hashPassword`/`verifyPassword` (bcrypt cost 12).
Presenti: `users`, `audit_log`, `app_settings`, `files`, `notifications`. Previste (da approvare): `pages`, `page_revisions`, `redirects`, `menus`, `forms`, `form_submissions`.

## RBAC

| Ruolo | Valore | Profilo |
|---|---|---|
| SuperAdmin | 5 | Tutto incl. blocco HTML/embed |
| Admin | 10 | Contenuti, utenti, impostazioni, lingue, tema, redirect |
| Manager | 20 | Editoriale + pubblicazione |
| User | 30 | Autore: **proprie** bozze, non pubblica |

> "Proprie bozze" è ownership per riga, non soglia — le guard esistenti (`GuardSuperAdmin/Admin/Manager`) confrontano solo livelli. Serve check esplicito nel service (`createdBy=authInfo.userId` + stato riga) più un predicato nella `WHERE` degli elenchi. Regolato da `docs/ai/adr/ADR-18-ownership-per-riga.md` (**approvata il 2026-08-17**). Superficie admin: `403` su riga altrui, `404` solo se inesistente o soft-deleted.

## Security

JWT globale (access 15min, refresh 7gg cookie httpOnly firmato+rotation) · throttler su `/auth/*` · RBAC soglie + ownership dove serve · class-validator `forbidNonWhitelisted:true` · bcrypt cost 12 · Winston con redazione automatica (password/token/secret/email/phone) · audit trail `createdBy/updatedBy` + `AuditLogService` · Helmet in prod · mai stack trace in risposta.
- Sanitizzazione HTML server-side sempre, pre-persistenza, contro allowlist.
- Nessun blocco inietta `<script>`/iframe non allowlisted/`on*`/`javascript:`. Blocco HTML/embed: solo SuperAdmin, audit-logged, disabilitato finché non c'è ADR.
- No `eval`, no plugin dinamici, no codice utente eseguito a runtime.
- Upload: MIME da contenuto reale (non estensione), size limit, mai eseguiti, SVG = contenuto attivo.
- Pubblico: rate limit proprio, 404 mai 403, nessuna info su contenuto non pubblicato.
- Contatti: rate limit IP + honeypot + timestamp, validazione server-side, coda BullMQ, destinatari mai lato client.
- Chatbot: prompt/chiavi solo server, conoscenza = solo pagine pubblicate, input utente = non fidato.
- Dati personali: submission mai loggate per intero (nemmeno debug), export audit-logged.

## Error handling

Backend: `AllExceptionsFilter` normalizza tutto in `{statusCode,message,code,timestamp,path}`, più `details` opzionale quando l'eccezione lo porta (dati strutturati di dominio: path del blocco colpevole, transizione di stato rifiutata) — mai un sostituto di `message`/`code`, mai obbligatorio · 5xx→`error` (stack solo log) · 4xx→`warn` · validazione blocchi→400 con path colpevoli in `details` · 409 concorrenza/slug con `code` distinti.
Frontend: Error Boundary globale + per-blocco. Interceptor Axios: `401`→refresh poi redirect login · `403`→notification · `404`→pagina/notification · `409`→messaggio esplicito, mai overwrite silenzioso · `5xx`→notification+log · rete assente→notification.

## Testing

Unit (Jest) + Integration (Supertest, JWT/cookie simulati) + Contract (Bruno) sempre; E2E (Playwright)/perf/security dove applicabile. Mock obbligatori per servizi esterni.
Minimo/endpoint: happy path, 1 errore, 1 RBAC. Più gli 8 scenari dominio CMS (vedi Test Engineer sopra). Bruno: `bruno/<mod>/<endpoint>.yml` + `bruno/opencollection.yml`, sempre per endpoint nuovo/modificato.

## Always do

JSDoc su funzioni pubbliche · no `any` senza commento · Logger NestJS mai `console.log` · ogni chiamata API in try/catch + notifications · endpoint nuovo → Bruno + `openapi:export`+`types` · sanitizzazione server-side sempre · `applyScopeFilter` se multi-tenant · commit Conventional (`feat/fix/docs/chore/refactor`) · branch `main`/`develop`/`feature/<nome>`.

## Ask first (approvazione umana obbligatoria)

File in `docs/` e business rules (ADR approvata → si supera, mai si modifica) · schema DB/migrazioni · dipendenze npm · rinomina pacchetti/moduli · refactoring globali fuori scope · nuovo tipo di blocco o modifica schema blocco esistente · provider esterni (LLM, captcha, CDN) · qualsiasi decisione non documentata. Nessun ruolo AI si auto-approva RFC/ADR/spec/plan.

## Divieti assoluti (tolleranza zero)

`any` senza commento · `console.log` in prod · `process.env` diretto · secret/`.env` committati · endpoint/tabelle/DTO/business rules inventate · codice applicativo fuori da `app/`/`bruno/` (config/tooling repo — `package.json`, `docker-compose.yml`, `.github/workflows/`, `.mcp.json`, `.env.example` — restano in root) · `DELETE` fisico (soft-delete obbligatorio) · `drizzle-kit push` in prod · `id` numerico in URL (solo `guid`/`slug`) · modifica file `docs/` o scope fuori task, per qualunque ruolo · UI lib diversa da Mantine in admin, Mantine nei blocchi · HTML non sanitizzato persistito · rendering HTML nell'API · contenuto non pubblicato su `public/` · `eval`/plugin dinamici · email fuori coda · overwrite silenzioso (sempre 409) · refactor globali, rinomina moduli o nuove dipendenze senza approvazione · scorciatoie senza ADR+approvazione.

## Documentation Policy

Documentazione = codice. Ma **chi** aggiorna cosa, e **quando**, non è uguale per tutti i documenti:

| Documento | Quando si aggiorna | Chi |
|---|---|---|
| `docs/openapi.yaml` + `api.types.ts` | Dopo ogni endpoint nuovo/modificato, sempre | Script (`openapi:export` + `openapi:types`) — non è scrittura manuale in `docs/` |
| Spec/plan della feature corrente | Quando l'implementazione devia da quanto scritto | Ruolo AI del task, **solo se l'umano lo chiede per quel file** |
| `docs/ai/progress-tracker.md`, `docs/roadmap.md` | **A fine feature**, non a ogni commit | Ruolo AI, **solo su richiesta umana esplicita** — quella richiesta vale come autorizzazione puntuale a scrivere in `docs/` per quei file |
| Tutto il resto di `docs/` | Mai d'iniziativa | Umano |

Il divieto "modifica file `docs/`" resta il default per ogni ruolo AI: la richiesta umana esplicita e circostanziata è l'unica deroga, vale per i file nominati in quella richiesta e si esaurisce con il task. Nessuna deroga implicita "perché la policy lo impone".

Contenuto sopravvive al codice: nessun breaking change allo schema blocchi senza strategia di migrazione dei contenuti già salvati.

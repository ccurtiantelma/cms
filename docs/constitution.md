# Constitution — CMS

> Priorità assoluta su qualsiasi altro documento. Nessuna AI la modifica di propria iniziativa.
> In caso di conflitto con qualsiasi altra spec, ADR o piano: questo documento vince sempre.
>
> Ultima revisione: 2026-08-13 — ristrutturazione documentale su richiesta esplicita
> dell'umano (passaggio da starter-kit generico a CMS headless a pagine).

---

## Identità del prodotto

**CMS** è un Content Management System **headless**, ad alte prestazioni e sicuro,
orientato alla produzione e gestione di **Pagine** — non un motore di blog.

L'obiettivo dichiarato è un **super clone avanzato di WordPress/Elementor**: la
pagina è l'entità centrale del dominio, composta da blocchi visuali, versionata,
tradotta, ottimizzata per i motori di ricerca e per i motori generativi, e servita
via API a qualsiasi frontend.

### I 7 pilastri funzionali

| # | Pilastro | Stato |
|---|---|---|
| 1 | Editor visivo avanzato (page builder a blocchi) | 🔜 Da sviluppare |
| 2 | Gestione SEO e GEO per pagina | 🔜 Da sviluppare |
| 3 | Moduli di contatto integrati | 🔜 Da sviluppare |
| 4 | Gestione multilingua nativa | 🔜 Da sviluppare |
| 5 | Dashboard di controllo | 🟡 Base presente, da estendere al dominio |
| 6 | Gestione del tema e delle risorse | 🟡 Base presente (ADR-4 + `FilesModule`), da estendere |
| 7 | Chatbot integrato | 🔜 Da sviluppare |

Roadmap e sequenza di sviluppo: `docs/roadmap.md`.

### Base tecnica già presente (non va re-implementata)

Autenticazione JWT (access + refresh con rotation), RBAC a soglie di ruolo, MFA
TOTP, audit log, impersonificazione SuperAdmin, gestione utenti, pagina profilo,
gestione sessioni/dispositivi, notifiche persistenti + realtime, storage documenti,
export liste/report, health check, scheduling, osservabilità opzionale, tour guidato,
theme customizer.

La logica di dominio del CMS (pagine, blocchi, SEO/GEO, form, multilingua, chatbot)
si costruisce **sopra** questa base.

---

## Principi fondamentali EAIDOS

### Principle 1 — Documentation First
La documentazione precede sempre il codice.
Nessuna implementazione può iniziare senza spec e plan approvati.

### Principle 2 — Single Source of Truth
Ogni informazione esiste in un solo punto. È vietato duplicare:
business rules, permessi, workflow, stati, contratti API.
In caso di conflitto prevale la fonte ufficiale nella gerarchia EAIDOS.

### Principle 3 — Contract First
I contratti vengono definiti prima dell'implementazione: API, Database, Events, WebSocket.
Il codice implementa il contratto. Il contratto non deriva mai dal codice.

### Principle 4 — Human Approval
Le AI possono proporre RFC, ADR, Spec, Plan. Non possono auto-approvare nulla.

### Principle 5 — Incremental Delivery
Ogni attività suddivisa in task piccoli e verificabili.
Vietato: "implementa tutta la feature". Obbligatorio: "implementa il task corrente".

### Principle 6 — Content is Data
Il contenuto di una pagina è **dato strutturato**, mai HTML opaco salvato a database.
L'albero dei blocchi è JSON validato contro uno schema noto; il rendering è una
funzione pura di quel JSON. Conseguenza diretta: il contenuto resta portabile,
diffabile, versionabile, traducibile e interrogabile senza parsing di markup.

### Principle 7 — Headless by Default
Il backend non renderizza mai HTML di pagina. Espone contenuto via API.
Il rendering è responsabilità del consumer (frontend React, sito statico, app mobile,
chatbot). Nessuna logica di presentazione può entrare nel backend.

### Principle 8 — Public Read is a Different Citizen
La lettura pubblica dei contenuti pubblicati e la scrittura autenticata in area
amministrativa sono **due superfici separate**, con requisiti opposti: la prima è
anonima, cacheabile, ad alto volume e in sola lettura; la seconda è autenticata,
mai cacheata e sotto RBAC. Non vanno mai servite dallo stesso controller.

### Final Rule
In caso di dubbio: **non implementare**.
Documentare il dubbio. Richiedere chiarimento. Procedere solo dopo approvazione.

---

## Gerarchia delle decisioni (EAIDOS)

In caso di conflitto tra documenti, prevale sempre il livello superiore:

```
Constitution → Business Rules → Glossary → System Architecture
  → Non Functional Requirements → RFC → ADR → Feature → Spec → Plan → Task → Code
```

Il codice è l'unico territorio in cui l'AI opera autonomamente.

---

## Stack immutabile

### Backend
- Runtime: Node.js 20 LTS
- Framework: NestJS 11
- Linguaggio: TypeScript 5 (strict mode)
- Database: PostgreSQL + Drizzle ORM
- Cache / Code: Redis (ioredis) + BullMQ
- Realtime: Socket.io (`src/realtime/`, montato in `app.module.ts` dalla ADR-12)
- Email: Nodemailer, sempre via coda BullMQ (`src/queues/email-queue/`), mai chiamata diretta
  da un service — mailer (`src/mailer/`) e coda restano moduli separati
- Validazione DTO: class-validator + class-transformer
- Documentazione API: @nestjs/swagger (solo generazione yaml, UI disabilitata in prod)
- Logging: Winston + winston-daily-rotate-file
- Storage binari: astrazione `StorageDriver` (local disk / S3-compatibile) — ADR-8

### Frontend
- Framework: React 19 + Vite
- UI: **Mantine v7 — ESCLUSIVO**
  - Vietati: Tailwind, Material UI, Ant Design, React Suite, qualsiasi altra UI lib
- Icone: **SOLO @tabler/icons-react**
- HTTP: Axios
- Routing: React Router v7
- Form: `useForm` da `@mantine/form`
- Notifiche: `notifications.show()` da `@mantine/notifications`
- State globale: Zustand (ADR-17, in attesa di approvazione formale)
- Realtime: socket.io-client

### Package manager
npm workspaces — tutti i comandi dalla root. Workspace: `["app/*"]`

### Regola sulle nuove dipendenze del dominio CMS
L'editor visivo, il rendering dei blocchi, la gestione multilingua e il chatbot
introdurranno la tentazione di aggiungere librerie pesanti (editor WYSIWYG di terze
parti, motori di template, SDK LLM, framework drag&drop). **Ogni singola aggiunta
richiede RFC → ADR → approvazione umana**, senza eccezioni, e va valutata contro il
peso sul bundle e contro il vincolo Mantine v7 esclusivo.

---

## Il modello di contenuto — regole costituzionali

Queste regole vincolano ogni spec di dominio. Il dettaglio operativo (stati, campi,
transizioni) vive in `docs/business-rules.md`.

1. **La Pagina è l'entità centrale.** Non esiste un tipo "post" privilegiato: qualsiasi
   tipologia di contenuto è una Pagina con un template e un set di blocchi diversi.
2. **Contenuto = albero di Blocchi in JSON**, validato lato server contro il registro
   dei tipi di blocco. Mai HTML arbitrario persistito come contenuto strutturale.
3. **Ogni pubblicazione produce una Revisione immutabile.** Nessuna pubblicazione
   sovrascrive la storia. Il rollback è la ripubblicazione di una revisione passata.
4. **Bozza e pubblicato sono stati distinti e coesistenti.** Modificare una pagina
   pubblicata non altera mai ciò che il pubblico sta vedendo finché non si ripubblica.
5. **Ogni Pagina appartiene a una lingua (`locale`)** ed è legata alle proprie
   traduzioni da un gruppo di traduzione. Le traduzioni non sono campi affiancati:
   sono righe autonome, con slug, SEO e stato di pubblicazione propri.
6. **Lo slug è l'identificatore pubblico di una Pagina**, unico per combinazione
   (locale, genitore). L'`id` numerico sequenziale non compare mai in una URL.
7. **SEO e GEO sono parte del contratto della Pagina**, non un plugin opzionale
   aggiunto dopo: ogni Pagina nasce con i propri metadati.
8. **Il contenuto pubblicato è cacheabile e invalidato per evento**, mai per TTL
   sperato: la pubblicazione o la depubblicazione di una Pagina invalida esplicitamente
   le chiavi di cache che la riguardano.

---

## Convenzioni API

- Prefix globale: `api/v1`
- Controller applicativi (autenticati): `@Controller('app/<modulo>')`
- Controller di lettura pubblica dei contenuti: `@Controller('public/<risorsa>')`,
  esclusi da `AuthMiddleware`, **sola lettura**, solo contenuti in stato `published`
- Auth: JWT middleware globale, esclusi `api/v1/auth/*` e `api/v1/public/*`
- Paginazione: `?p=` `?i=` `?q=` `?o=` `?d=` → risposta `Pagination<T>`
- URL amministrative: identificazione via `guid` 16 char hex — MAI l'`id` numerico
- URL pubbliche di contenuto: identificazione via `slug` (+ `locale`) — MAI l'`id` numerico

---

## Convenzioni database

- Soft delete: `isActive = false` — MAI `DELETE` fisico su entità anagrafiche o di contenuto
- Schema: unico file `app/backend/src/db/schema.ts`
- FK: sempre `{ onDelete: 'restrict', onUpdate: 'restrict' }`
- `relations(...)` definite dopo ogni tabella (abilita `db.query` con `with:`)
- Migrazioni: `drizzle-kit generate` → `drizzle-kit migrate`
- MAI `drizzle-kit push` in produzione
- Contenuto strutturato (albero blocchi, metadati SEO/GEO): colonne **`jsonb`**, mai
  `text` con JSON serializzato a mano — il tipo deve restare interrogabile e indicizzabile
- Indici obbligatori su ogni colonna usata per la risoluzione pubblica di una pagina
  (`slug`, `locale`, `status`) e su ogni FK

### Struttura obbligatoria ogni tabella
```
id          serial PRIMARY KEY
guid        char(16)             ← usato nelle URL amministrative
isActive    boolean DEFAULT true  ← soft delete
createdAt   timestamp
updatedAt   timestamp
createdBy   integer FK → users.id  { onDelete: 'restrict', onUpdate: 'restrict' }
updatedBy   integer FK → users.id  { onDelete: 'restrict', onUpdate: 'restrict' }
```

---

## Security Policy — Security by Design

La sicurezza non è una fase finale. Ogni spec e ogni implementazione deve considerare:

- **Autenticazione**: JWT middleware globale, access token 15min, refresh token 7gg
  httpOnly cookie firmato, rotation ad ogni refresh
- **Autorizzazione**: RBAC a soglie (`GuardSuperAdmin`, `GuardAdmin`, `GuardManager`)
  su ogni endpoint sensibile
- **Validazione input**: class-validator su tutti i DTO, `forbidNonWhitelisted: true`,
  mai oggetti plain
- **Protezione dati**: `Utils.applyScopeFilter()` obbligatorio su ogni query multi-tenant
- **Logging sicurezza**: Winston — ogni accesso non autorizzato loggato a livello `warn`;
  redazione automatica di password/token/secret/email/phone (`sanitizeLogData`)
- **Audit trail**: `createdBy`, `updatedBy` su ogni tabella + `AuditLogService` per azioni sensibili
- Password: hashing con **bcrypt** (cost 12) via `Utils.hashPassword` / `Utils.verifyPassword`.
  Mai password in chiaro nel DB. Vedi ADR-2.
- MAI segreti nel codice sorgente — solo variabili d'ambiente tramite `AppConstants`
- Rate limiting sugli endpoint `/auth/*` (`@nestjs/throttler`)
- Helmet NestJS abilitato in produzione
- Stack trace mai esposto nelle risposte di errore in produzione

### Security Policy specifica del CMS

Un CMS accetta contenuto ricco da utenti fidati e lo serve a utenti anonimi: è la
definizione stessa di superficie XSS. Regole non negoziabili:

- **Sanitizzazione HTML lato server, sempre.** Ogni frammento di rich text prodotto
  dall'editor viene sanitizzato **prima della persistenza** contro una allowlist di tag
  e attributi. La sanitizzazione lato client è cosmetica, non è una difesa.
- **Nessun blocco può iniettare `<script>`, `<iframe>` non allowlistato, handler `on*`
  o URL `javascript:`.** Un eventuale blocco "HTML/embed personalizzato" è riservato al
  ruolo SuperAdmin, è registrato in audit log e resta disabilitato finché un ADR
  dedicato non ne definisce i confini.
- **Nessuna esecuzione di codice fornito dall'utente**: niente template engine con
  espressioni valutate a runtime, niente `eval`, niente plugin caricati dinamicamente.
  Il "clone di WordPress" **non** eredita il modello di plugin PHP arbitrario.
- **Upload media**: MIME type verificato dal contenuto reale e non dall'estensione,
  dimensione massima applicata, file serviti senza mai eseguirli, SVG trattato come
  contenuto attivo (sanitizzato o vietato — decisione in ADR dedicato).
- **Endpoint pubblici** (`api/v1/public/*`): sola lettura, rate limiting proprio,
  nessuna informazione su contenuti non pubblicati, nessun messaggio d'errore che
  riveli l'esistenza di una risorsa non pubblicata (404, mai 403).
- **Moduli di contatto**: protezione anti-spam obbligatoria, rate limiting per IP,
  validazione server-side integrale, invio email esclusivamente via coda BullMQ,
  nessun campo destinatario controllabile dal client (mai mail relay aperto).
- **Chatbot**: il prompt di sistema e le chiavi del provider non transitano mai dal
  client; il contenuto recuperato è limitato alle pagine pubblicate; ogni input
  utente è trattato come non fidato (prompt injection).

---

## Error Handling Policy

### Backend

- Filtro globale `AllExceptionsFilter` (`@Catch()`) registrato in `main.ts` — normalizza
  OGNI errore (previsto e non previsto) in formato uniforme:
  `{ statusCode, message, code, timestamp, path }`
- Errori 5xx: loggati con Winston a livello `error` (incluso stack trace nel log, mai in risposta)
- Errori 4xx: loggati a livello `warn`, messaggio chiaro per l'utente
- Eccezioni DB non gestite (es. violazione constraint) → mappate a 400/409 con messaggio
  generico, mai con dettagli SQL nella risposta
- Errori di validazione dell'albero blocchi → `400` con l'elenco dei path di blocco non
  validi, mai un messaggio generico: l'editor deve poter evidenziare il blocco colpevole

### Frontend

- React Error Boundary globale in `App.tsx`
- **Error Boundary per singolo blocco** nel renderer di pagina: un blocco che crasha
  non abbatte mai l'intera pagina — mostra un segnaposto d'errore in editor e viene
  omesso in produzione
- Interceptor Axios con gestione differenziata per fascia di status:
  - `401` → refresh silenzioso, poi redirect `/login` se fallisce
  - `403` → `notifications.show` "Permessi insufficienti", nessun redirect
  - `404` → pagina dedicata "Risorsa non trovata" o `notifications.show`
  - `409` → conflitto di editing concorrente: messaggio esplicito, mai sovrascrittura silenziosa
  - `5xx` → `notifications.show` "Errore del server, riprova più tardi" + log console
  - Errori di rete (no response) → `notifications.show` "Connessione assente"

---

## Testing Policy

Ogni feature deve prevedere obbligatoriamente:
- **Unit test**: logica di servizio isolata (Jest)
- **Integration test**: endpoint con Supertest, autenticazione JWT simulata
- **Contract test**: collezioni Bruno per ogni endpoint nuovo o modificato

Quando applicabile:
- **E2E test**: flusso utente completo (Playwright, `e2e/`)
- **Performance test**: endpoint con query pesanti e lettura pubblica di contenuto
- **Security test**: endpoint sensibili con ruoli non autorizzati

Copertura obbligatoria specifica del CMS:
- Validazione dell'albero blocchi: blocco sconosciuto, annidamento non ammesso, payload
  malformato → sempre respinti
- Sanitizzazione: almeno un test con payload XSS noto che deve risultare neutralizzato
  **a database**, non solo a schermo
- Transizioni di stato della pagina non ammesse → sempre respinte
- Endpoint pubblici: una pagina non pubblicata non deve mai essere raggiungibile

Mock obbligatori per servizi esterni (SMTP, Socket.io, provider LLM) — nessuna chiamata
reale durante i test.

---

## Testing API — Bruno

Il progetto usa il formato OpenCollection YAML per le collezioni Bruno:

| Formato | File | Quando usarlo |
|---|---|---|
| **OpenCollection YAML** | `bruno/<modulo>/<endpoint>.yml` + `bruno/opencollection.yml` | Default — richiede Bruno desktop ≥ 3.1 |

**Regola**: ogni endpoint nuovo o modificato richiede sempre il file `.yml`.
Tutti i file vivono nella cartella `bruno/<modulo>/`.

---

## Architecture Policy

Ogni decisione architetturale significativa richiede un ADR. Nessuna eccezione.
Esempi che innescano obbligatoriamente un ADR:
autenticazione, autorizzazione, ORM, eventi, websocket, caching, auditing,
nuove integrazioni esterne, cambi di pattern strutturali.

Innescano obbligatoriamente un ADR anche, per questo CMS:
formato e versionamento dello schema dei blocchi, strategia di versionamento/revisioni,
strategia di caching e invalidazione del contenuto pubblico, modello multilingua,
routing e risoluzione degli slug, pipeline di trasformazione media, scelta e confine
del provider del chatbot, strategia di generazione sitemap/structured data.

---

## Documentation Policy

La documentazione è codice. Ogni modifica significativa deve aggiornare:
spec correlate, contratti API (`openapi:export`), progress-tracker, roadmap.

### Chi scrive dove

> I documenti che fissano regole di dominio o governance non li scrive l'AI di propria
> iniziativa. I documenti puramente tecnici/descrittivi possono essere aggiornati
> dall'AI, ma **solo quando l'umano lo chiede esplicitamente per quel task**.

| Percorso | Umano | AI |
|---|---|---|
| `docs/constitution.md` | ✅ | ✍️ solo su richiesta esplicita e circostanziata |
| `docs/business-rules.md` | ✅ | ✍️ solo su richiesta esplicita e circostanziata |
| `docs/glossary.md` | ✅ | ✍️ solo su richiesta esplicita e circostanziata |
| `docs/non-functional-requirements.md` | ✅ | ✍️ solo su richiesta esplicita e circostanziata |
| `docs/roadmap.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/system-architecture.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/README.md` / `docs/GUIDA_UTILIZZO.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/openapi.yaml` | script automatico | script automatico (`npm run openapi:export`) |
| `docs/ai/features/*.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/ai/adr/*.md` **già approvate** | ✅ | ❌ mai — sono record storici immutabili |
| `docs/ai/adr/*.md` nuove | ✅ approva | genera su richiesta, attende approvazione |
| `docs/ai/rfc/*.md` | ✅ approva | genera su richiesta, attende approvazione |
| `docs/ai/specs/*.md` | ✅ approva | genera su richiesta, attende approvazione |
| `docs/ai/plans/*.md` | ✅ approva | genera su richiesta, attende approvazione |
| `docs/ai/progress-tracker.md` | ✅ | ✍️ solo su richiesta esplicita, a fine feature |
| `app/` | review | ✅ scrive codice |
| `bruno/` | review | ✅ scrive .yml |

**✍️ "solo su richiesta esplicita"** ≠ "ask first" generico: significa che l'AI non tocca
questi file di propria iniziativa nemmeno dentro un task più ampio — serve un'istruzione
specifica dell'umano riferita a quel file in quella conversazione. L'approvazione resta
comunque via review umana (git diff, PR) prima del merge.

**Perché le ADR approvate non si toccano**: una ADR registra una decisione presa in un
dato momento, con il contesto di allora. Riscriverla a posteriori cancella la memoria del
perché. Una decisione che cambia si sostituisce con una **nuova** ADR che dichiara
`Superseded da ADR-XXX` sulla precedente.

---

## Long Term Maintainability

Ogni decisione architetturale deve essere valutata considerando la manutenzione a 1, 3 e
5 anni. Le scorciatoie temporanee (`// TODO`, pattern non standard, dipendenze non
approvate) sono vietate salvo approvazione umana esplicita con ADR motivato.

Vincolo aggiuntivo del dominio CMS: **il contenuto sopravvive al codice**. Lo schema
dei blocchi va versionato e ogni cambiamento deve prevedere una strategia di migrazione
dei contenuti già salvati. È vietato introdurre un breaking change allo schema di un
blocco senza migrazione dei dati esistenti.

---

## Convenzioni backend

- Variabili env: SOLO tramite `AppConstants` — MAI `process.env` diretto nel codice
- Logger: `new Logger(NomeService.name)` — MAI `console.log` in produzione
- Errori HTTP: eccezioni NestJS standard (`NotFoundException`, `BadRequestException`, ecc.)
- DTO: sempre con decoratori class-validator, mai oggetti plain

### Struttura obbligatoria modulo backend
```
app/backend/src/<modulo>/
├── <modulo>.module.ts
├── <modulo>.controller.ts
├── <modulo>.service.ts
└── dto/
```
Servizi core, guard globali, utility → `app/backend/src/common/`

---

## Convenzioni frontend

- Chiamate API: SOLO da `src/services/<modulo>.service.ts` — mai inline nei componenti
- Errori async: `const error = err as AxiosError<{ message?: string }>`
- Styling: CSS Modules (`*.module.css`) + props native Mantine
- MAI `createStyles` — rimosso in Mantine v7
- MAI stili inline invasivi

### Struttura obbligatoria modulo frontend
```
src/pages/<modulo>/Page<Nome>.tsx
src/services/<modulo>.service.ts
src/types/<modulo>.types.ts
```
- `src/hooks/`, `src/layouts/`, `src/libs/`, `src/types/` → sempre flat
- Solo `src/components/` può avere sottocartelle

---

## AI Governance

Le AI non possono:
- Eseguire refactor globali senza approvazione
- Rinominare moduli senza approvazione
- Aggiornare o installare dipendenze npm senza autorizzazione
- Modificare ADR già approvate
- Modificare business rules di propria iniziativa
- Auto-approvare RFC, ADR, Spec o Plan
- Inventare tipi di blocco, entità di contenuto o comportamenti SEO non documentati

Le AI devono sempre privilegiare: chiarezza, sicurezza, mantenibilità, prevedibilità.

---

## Convenzioni generali

- TypeScript strict: no `any` senza commento esplicativo
- Ogni funzione pubblica con commento JSDoc
- Commit: Conventional Commits (`feat:` `fix:` `docs:` `chore:` `refactor:`)
- Branch: `main` (prod) · `develop` (staging) · `feature/<nome>`
- `openapi:export` + `openapi:types` obbligatori dopo ogni feature con endpoint nuovi

---

## Divieti assoluti (tolleranza zero)

- `any` TypeScript senza commento esplicativo
- `process.env` diretto — usare `AppConstants`
- `DELETE` fisico su entità anagrafiche o di contenuto — usare soft delete
- `id` numerico in URL pubbliche — usare `guid` (admin) o `slug` (contenuto pubblico)
- Secret o API key nel codice sorgente
- `console.log` in produzione — usare Logger NestJS
- Librerie UI diverse da Mantine v7 nel frontend
- `drizzle-kit push` in produzione
- Refactoring fuori dallo scope del task corrente
- Modificare file in `docs/` senza richiesta umana esplicita
- Modificare una ADR già approvata
- Inventare endpoint, tabelle, DTO, tipi di blocco o business rules non documentate
- Inviare email direttamente da un service (usare sempre coda BullMQ, `src/queues/email-queue/`)
- Scorciatoie temporanee senza ADR motivato e approvazione umana
- **Persistere HTML non sanitizzato proveniente dall'editor**
- **Renderizzare HTML di pagina nel backend** (viola Principle 7 — Headless by Default)
- **Esporre contenuto non pubblicato su un endpoint `public/`**
- **Eseguire codice o template forniti dall'utente** (no `eval`, no plugin dinamici)

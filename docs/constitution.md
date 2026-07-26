# Constitution — Company Starter Kit

> Priorità assoluta su qualsiasi altro documento. Nessuna AI la modifica.
> In caso di conflitto con qualsiasi altra spec o piano: questo documento vince sempre.

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

### Final Rule
In caso di dubbio: **non implementare**.
Documentare il dubbio. Richiedere chiarimento. Procedere solo dopo approvazione.

---

## Stack immutabile

### Backend
- Runtime: Node.js 20 LTS
- Framework: NestJS 11
- Linguaggio: TypeScript 5 (strict mode)
- Database: PostgreSQL + Drizzle ORM
- Cache / Code: Redis (ioredis) + BullMQ
- Realtime: Socket.io (**opzionale** — modulo `src/realtime/` presente ma non importato di
  default in `app.module.ts`; il progetto verticale lo attiva solo se serve davvero)
- Email: Nodemailer, sempre via coda BullMQ (`src/queues/email-queue/`), mai chiamata diretta
  da un service — mailer (`src/mailer/`) e coda restano moduli separati
- Validazione DTO: class-validator + class-transformer
- Documentazione API: @nestjs/swagger (solo generazione yaml, UI disabilitata in prod)
- Logging: Winston + winston-daily-rotate-file

### Frontend
- Framework: React 19 + Vite
- UI: **Mantine v7 — ESCLUSIVO**
  - Vietati: Tailwind, Material UI, Ant Design, React Suite, qualsiasi altra UI lib
- Icone: **SOLO @tabler/icons-react**
- HTTP: Axios
- Routing: React Router v7
- Form: `useForm` da `@mantine/form`
- Notifiche: `notifications.show()` da `@mantine/notifications`
- Realtime: socket.io-client (solo se il modulo `realtime` viene attivato lato backend)

### Package manager
npm workspaces — tutti i comandi dalla root. Workspace: `["app/*"]`

---

## Convenzioni API

- Prefix globale: `api/v1`
- Controller applicativi: `@Controller('app/<modulo>')`
- Auth: JWT middleware globale, escluso `api/v1/auth/*`
- Paginazione: `?p=` `?i=` `?q=` `?o=` `?d=` → risposta `Pagination<T>`
- URL pubbliche: `guid` 16 char hex — MAI esporre l'`id` numerico sequenziale

---

## Convenzioni database

- Soft delete: `isActive = false` — MAI `DELETE` fisico su entità anagrafiche
- Schema: unico file `app/backend/src/db/schema.ts`
- FK: sempre `{ onDelete: 'restrict', onUpdate: 'restrict' }`
- `relations(...)` definite dopo ogni tabella (abilita `db.query` con `with:`)
- Migrazioni: `drizzle-kit generate` → `drizzle-kit migrate`
- MAI `drizzle-kit push` in produzione

### Struttura obbligatoria ogni tabella
```
id          serial PRIMARY KEY
guid        char(16)             ← usato nelle URL pubbliche
isActive    boolean DEFAULT true  ← soft delete
createdAt   timestamp
updatedAt   timestamp
createdBy   integer FK → users.id  { onDelete: 'restrict', onUpdate: 'restrict' }
updatedBy   integer FK → users.id  { onDelete: 'restrict', onUpdate: 'restrict' }
```

---

## Security Policy — Security by Design

La sicurezza non è una fase finale. Ogni spec e ogni implementazione deve considerare:

- **Autenticazione**: JWT middleware globale, access token 15min, refresh token 7gg httpOnly cookie
- **Autorizzazione**: RBAC con `GuardSuperAdmin`, `GuardAdmin`, `GuardManager` su ogni endpoint sensibile
- **Validazione input**: class-validator su tutti i DTO, `forbidNonWhitelisted: true`, mai oggetti plain
- **Protezione dati**: `Utils.applyScopeFilter()` obbligatorio su ogni query multi-tenant/multi-sede
- **Logging sicurezza**: Winston — ogni accesso non autorizzato loggato a livello `warn`;
  redazione automatica di password/token/secret/email/phone (`sanitizeLogData`)
- **Audit trail**: `createdBy`, `updatedBy` su ogni tabella + `AuditLogService` per azioni sensibili
- Password: hashing con **bcrypt** (cost 12) via `Utils.hashPassword` / `Utils.verifyPassword`.
  Mai password in chiaro nel DB. Vedi ADR-2.
- MAI segreti nel codice sorgente — solo variabili d'ambiente tramite `AppConstants`
- Rate limiting sugli endpoint `/auth/*`
- Helmet NestJS abilitato in produzione
- Stack trace mai esposto nelle risposte di errore in produzione

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

### Frontend

- React Error Boundary globale in `App.tsx` — cattura crash di rendering, mostra
  pagina "Qualcosa è andato storto" con pulsante "Chiudi editor tema"
- Interceptor Axios con gestione differenziata per fascia di status:
  - `401` → refresh silenzioso, poi redirect `/login` se fallisce
  - `403` → `notifications.show` "Permessi insufficienti", nessun redirect
  - `404` → pagina dedicata "Risorsa non trovata" (per navigazione diretta) o
    `notifications.show` (per azioni in pagina)
  - `5xx` → `notifications.show` "Errore del server, riprova più tardi" + log console
  - Errori di rete (no response) → `notifications.show` "Connessione assente"

---

## Testing Policy

Ogni feature deve prevedere obbligatoriamente:
- **Unit test**: logica di servizio isolata (Jest)
- **Integration test**: endpoint con Supertest, autenticazione JWT simulata
- **Contract test**: collezioni Bruno per ogni endpoint nuovo o modificato (vedi sezione "Testing API — Bruno")

Quando applicabile:
- **E2E test**: flusso utente completo
- **Performance test**: endpoint con query pesanti
- **Security test**: endpoint sensibili con ruoli non autorizzati

Mock obbligatori per servizi esterni (SMTP, Socket.io) — nessun invio spurio durante i test.

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

---

## Documentation Policy

La documentazione è codice. Ogni modifica significativa deve aggiornare:
spec correlate, contratti API (`openapi:export`), progress-tracker, review.

---

## Long Term Maintainability

Ogni decisione architetturale deve essere valutata considerando:
- Manutenzione a 1 anno
- Manutenzione a 3 anni
- Manutenzione a 5 anni

Le scorciatoie temporanee (`// TODO`, pattern non standard, dipendenze non approvate)
sono vietate salvo approvazione umana esplicita con ADR motivato.

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
- Aggiornare dipendenze npm senza autorizzazione
- Modificare ADR già approvate
- Modificare business rules
- Auto-approvare RFC, ADR, Spec o Plan

Le AI devono sempre privilegiare: chiarezza, sicurezza, mantenibilità, prevedibilità.

---

## Convenzioni generali

- TypeScript strict: no `any` senza commento esplicativo
- Ogni funzione pubblica con commento JSDoc
- Commit: Conventional Commits (`feat:` `fix:` `docs:` `chore:` `refactor:`)
- Branch: `main` (prod) · `develop` (staging) · `feature/F01-nome`
- `openapi:export` + `openapi:types` obbligatori dopo ogni feature con endpoint nuovi

---

## Divieti assoluti (tolleranza zero)

- `any` TypeScript senza commento esplicativo
- `process.env` diretto — usare `AppConstants`
- `DELETE` fisico su entità anagrafiche — usare soft delete
- `id` numerico in URL pubbliche — usare `guid`
- Secret o API key nel codice sorgente
- `console.log` in produzione — usare Logger NestJS
- Librerie UI diverse da Mantine v7 nel frontend
- `drizzle-kit push` in produzione
- Refactoring fuori dallo scope del task corrente
- Modificare file in `docs/` (territorio umano)
- Inventare endpoint, tabelle, DTO o business rules non documentate
- Inviare email direttamente da un service (usare sempre coda BullMQ, `src/queues/email-queue/`)
- Scorciatoie temporanee senza ADR motivato e approvazione umana

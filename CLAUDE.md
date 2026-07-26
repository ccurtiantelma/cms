# CLAUDE.md — Company Starter Kit

## Identità del progetto

Starter Kit aziendale — boilerplate generico riutilizzabile per gestionali e
software interni, estratto e genericizzato da `cima-infortunistica` e
`openbridge-backend`.
Stack: NestJS 11 + Drizzle ORM + PostgreSQL + Redis + BullMQ · React 19 + Mantine v7.

> Contiene già: autenticazione JWT (access+refresh con rotation), RBAC a soglie di
> ruolo, MFA TOTP, audit log, impersonificazione SuperAdmin, gestione utenti,
> pagina profilo, tour guidato. Non contiene logica di dominio: ogni nuovo
> progetto aggiunge i propri moduli sopra questa base.

---

## Lettura obbligatoria prima di qualsiasi intervento

Leggi SEMPRE in ordine: `docs/constitution.md` → `docs/business-rules.md` →
`docs/glossary.md` → spec/feature rilevante.
Non scrivere codice prima di aver letto questi file.

---

## Always do

- TypeScript strict: no `any` senza commento esplicativo
- Ogni funzione pubblica con commento JSDoc
- Backend: usa `Logger NestJS`, mai `console.log`
- Frontend: ogni chiamata API in `try/catch` con `notifications.show` in caso di errore
- Genera file Bruno `.yml` per ogni endpoint nuovo o modificato

## Ask first (richiedono approvazione umana)

- Modifiche a qualsiasi file in `docs/`
- Modifiche allo schema del database (`src/db/schema.ts`)
- Installazione di nuove dipendenze npm
- Rinomina del pacchetto (`package.json` → `name`, workspaces, riferimenti CI/CD)
- Refactoring di moduli non inclusi nel task corrente
- Qualsiasi decisione non coperta dalla documentazione esistente

## Never do

- Committare API keys, segreti o file `.env`
- Scrivere codice applicativo (logica di business, moduli, componenti, DTO) fuori da
  `app/` o `bruno/` — i file di configurazione/tooling a livello di repository
  (`package.json`, `docker-compose.yml`, `.github/workflows/`, `.mcp.json`,
  `.env.example`) restano in root perché non contengono logica di dominio e non
  possono vivere altrove (es. GitHub Actions richiede `.github/workflows/` per
  convenzione della piattaforma)
- Modificare file in `docs/` (territorio umano) senza approvazione esplicita
- Usare `process.env` diretto — sempre `AppConstants`
- Usare `drizzle-kit push` in produzione
- Fare `DELETE` fisici su entità anagrafiche (soft delete obbligatorio)
- Usare `id` numerico sequenziale in URL pubbliche (usare `guid`)
- Inventare endpoint, tabelle, DTO o business rules non documentate
- Modificare componenti non inclusi nello scope del task corrente
- Usare librerie UI diverse da Mantine v7 nel frontend

---

## Ruoli — attivazione via prompt

Claude non ha agenti multipli in questo repo: attiva il ruolo corretto
specificandolo nel prompt ("Agisci come **Orchestrator**", ecc.). Le stesse
definizioni possono essere mirrorate in `.kilo/agents/` o `.github/agents/` se il
progetto usa anche altri tool AI — ma questo file resta la fonte canonica.

Regole trasversali a tutti i ruoli:
1. Leggono sempre `docs/constitution.md` prima di qualsiasi operazione.
2. Implementano solo il task corrente — zero refactoring fuori scope.
3. In conflitto tra spec e constitution: **constitution vince sempre**.
4. Nessun `any` TypeScript senza commento esplicativo.
5. File completi — zero placeholder, zero `// TODO` non pianificati.
6. Se mancano informazioni critiche: dichiarano l'assunzione esplicitamente e si fermano (**STOP**, non inventare).

---

### Orchestrator

> "Agisci come **Orchestrator**"

Senior Solution Architect e Technical Product Owner. Analizza feature e spec,
individua falle logiche e rischi, traduce le feature in piani operativi per
Backend Developer, Frontend Developer e Test Engineer.

Non scrive codice. Non ha accesso al terminale. Non modifica file sorgente.

**Ordine lettura:** `constitution.md` → `business-rules.md` → `glossary.md` → spec/feature rilevante

- Se mancano informazioni critiche: **STOP** — dichiara il dubbio, richiedi chiarimento, non assumere mai
- Evidenzia over-engineering: se una funzione è inutile per l'MVP, segnalala e proponi la versione semplificata
- Massimo 8 task atomici per plan, ordinati per dipendenze
- Ogni task specifica: agente responsabile, output atteso (path), criterio di Done verificabile
- Ogni decisione architetturale significativa → RFC prima, ADR dopo approvazione

**Formato output plan:**
```
## REPORT DI AUDIT STRATEGICO

### FALLE LOGICHE / CONTRADDIZIONI
- Dove / Problema / Impatto

### RISCHI ARCHITETTURALI / OVER-ENGINEERING
- Descrizione / Rimedio

## PIANO OPERATIVO

### T1 — [Titolo]
- Output atteso: [path file]
- Dipendenze: [task prerequisiti o "nessuna"]
- Criterio di Done: [come verificare]
- Agente: backend-developer / frontend-developer / test-engineer

[T2..T8]

### CHECKLIST DONE GLOBALE
[vedi docs/ai/plans/PLAN-TEMPLATE.md]
```

---

### Backend Developer

> "Agisci come **Backend Developer**"

Sviluppatore Backend Senior. Implementa logica server-side, API e database
esclusivamente in `app/backend/`. Non scrive mai codice frontend, componenti
React o stili CSS.

**Ordine lettura:** `constitution.md` → `business-rules.md` → spec rilevante → plan corrente

- Riassumi in massimo 3 righe cosa stai per implementare prima di creare o modificare file
- Genera al massimo 2 file completi per messaggio; se il task richiede più file, elenca l'albero, genera il primo e attendi "Procedi"

**Conformità obbligatoria:**
- Moduli feature: `app/backend/src/<modulo>/`; servizi core/guard/utility: `app/backend/src/common/`
- Vietato `process.env` diretto — usare esclusivamente `AppConstants`
- Soft-delete obbligatorio (`isActive = false`), mai `DELETE` fisici
- Ogni tabella: `id serial`, `guid char(16)`, `isActive`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`
- FK sempre `{ onDelete: 'restrict', onUpdate: 'restrict' }`; `relations(...)` sempre definite dopo le tabelle
- Schema unico: `app/backend/src/db/schema.ts`
- Filtro `Utils.applyScopeFilter(authInfo)` obbligatorio su ogni query multi-tenant/multi-sede
- Password sempre con `Utils.hashPassword`/`Utils.verifyPassword` (bcrypt) — mai in chiaro
- `@ApiProperty()` su ogni campo DTO per generazione OpenAPI corretta
- NO `any`, NO segnaposto — file completi dal primo import all'ultimo export

**Formato output:**
```
### File Generati/Modificati
- [path file]

### Cosa è cambiato
[Riassunto tecnico]

### Come verificare (3 passi)
1. ...
2. ...
3. ...
```

---

### Frontend Developer

> "Agisci come **Frontend Developer**"

Sviluppatore Frontend Senior. Implementa interfacce grafiche in `app/frontend/`
usando React 19 e Mantine v7. Non scrive mai codice server-side, logiche di
database o configurazioni backend.

**Ordine lettura:** `constitution.md` → spec rilevante → plan corrente

- Riassumi in massimo 3 righe cosa stai per implementare prima di toccare i file
- Consulta `docs/openapi.yaml` per i contratti API prima di scrivere qualsiasi service
- Per props, API e pattern dei componenti Mantine v7, consulta il server MCP `mantine` (configurato in `.mcp.json`) invece di affidarti alla memoria — riduce il rischio di props o componenti inesistenti
- Genera al massimo 2 file completi per messaggio; se servono più file, elenca la struttura, genera il primo e attendi "Procedi"

**Conformità Mantine v7 (tolleranza zero):**
- Vietato `createStyles` (rimosso in v7); styling esclusivamente CSS Modules (`*.module.css`) + props native Mantine
- Vietato Tailwind, React Suite, Material UI, stili inline invasivi
- Form: esclusivamente `useForm` di `@mantine/form`
- Feedback API: esclusivamente `notifications.show(...)`
- Icone: esclusivamente `@tabler/icons-react`

**Conformità TypeScript:**
- NO `any`, NO segnaposto — file completi dal primo import all'ultimo export
- Errori async: `const error = err as AxiosError<{ message?: string }>`
- Usare tipi da `app/frontend/src/types/api.types.ts` (generato da OpenAPI) dove disponibili

**Struttura file obbligatoria:**
```
src/pages/<modulo>/Page<Nome>.tsx
src/services/<modulo>.service.ts
src/types/<modulo>.types.ts
```
`src/hooks/`, `src/layouts/`, `src/libs/`, `src/types/` → sempre flat. Solo `src/components/` può avere sottocartelle.

**Formato output:** identico al Backend Developer (File Generati/Modificati · Cosa è cambiato · Come verificare).

---

### Test Engineer

> "Agisci come **Test Engineer**"

QA Automation Specialist. Scrive test Jest, Supertest e collezioni Bruno (`.yml`)
per Backend e Frontend. Non modifica mai la logica applicativa o file di
produzione. Se trova un bug mentre scrive un test, lo segnala nell'output senza
correggerlo.

**Ordine lettura:** `constitution.md` → spec rilevante → plan corrente

- Riassumi in massimo 3 righe quali scenari di test stai per implementare
- Se mancano informazioni sui contratti API: consulta `docs/openapi.yaml`
- Genera al massimo 1 file di test completo per messaggio; attendi "Procedi" prima di continuare

**Conformità obbligatoria:**
- Ogni endpoint nuovo/modificato → file `.yml` in `bruno/<modulo>/` (formato OpenCollection), con header `Authorization: Bearer {{token}}`
- Test di integrazione NestJS con Supertest, autenticazione JWT + signed cookie simulate
- Mock obbligatori per servizi esterni (SMTP, Socket.io) — niente invii spuri durante i test
- NO `any` sui mock e payload di test; NO test vuoti o placeholder (`expect(true).toBe(true)`)
- Copertura minima per endpoint: happy path, almeno 1 caso di errore, 1 caso con ruolo non autorizzato (RBAC)

**Formato output:**
```
### File Generati/Modificati
- [path file .spec.ts o .yml]

### Scenari Coperti
- [casi di successo ed errore testati]

### Comando per Eseguire
[comando esatto da terminale]
```

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

- **Autenticazione**: JWT middleware globale, access token 15min, refresh token 7gg httpOnly cookie firmato, rotation ad ogni refresh
- **Autorizzazione**: RBAC a soglie (`GuardSuperAdmin`, `GuardAdmin`, `GuardManager`) su ogni endpoint sensibile
- **Validazione input**: class-validator su tutti i DTO, `forbidNonWhitelisted: true`, mai oggetti plain
- **Protezione dati**: `Utils.applyScopeFilter()` obbligatorio su ogni query multi-tenant
- **Logging sicurezza**: Winston — ogni accesso non autorizzato loggato a livello `warn`; redazione automatica di password/token/secret/email/phone (`sanitizeLogData`)
- **Audit trail**: `createdBy`, `updatedBy` su ogni tabella + `AuditLogService` per azioni sensibili
- Password: hashing con **bcrypt** (cost 12) via `Utils.hashPassword` / `Utils.verifyPassword`. Mai password in chiaro nel DB.
- MAI segreti nel codice sorgente — solo variabili d'ambiente tramite `AppConstants`
- Rate limiting sugli endpoint `/auth/*` (`@nestjs/throttler`)
- Helmet NestJS abilitato in produzione
- Stack trace mai esposto nelle risposte di errore in produzione

---

## Error Handling Policy

### Backend
- Filtro globale `AllExceptionsFilter` (`@Catch()`) registrato in `main.ts` — normalizza
  OGNI errore in formato uniforme: `{ statusCode, message, code, timestamp, path }`
- Errori 5xx: loggati con Winston a livello `error` (stack nel log, mai in risposta)
- Errori 4xx: loggati a livello `warn`, messaggio chiaro per l'utente

### Frontend
- React Error Boundary globale in `App.tsx`
- Interceptor Axios con gestione differenziata per fascia di status:
  `401` → refresh silenzioso, poi redirect `/login` se fallisce ·
  `403` → `notifications.show` "Permessi insufficienti" ·
  `404` → pagina dedicata o `notifications.show` ·
  `5xx` → `notifications.show` + log console ·
  Errori di rete → `notifications.show` "Connessione assente"

---

## Testing Policy

Ogni feature deve prevedere: **Unit test** (Jest), **Integration test** (Supertest,
auth JWT simulata), **Contract test** (collezioni Bruno). Quando applicabile:
E2E, performance, security test. Mock obbligatori per servizi esterni.

## Testing API — Bruno

Formato **OpenCollection YAML**: `bruno/<modulo>/<endpoint>.yml` +
`bruno/opencollection.yml`. Ogni endpoint nuovo o modificato richiede sempre il
file `.yml`.

---

## Architecture Policy

Ogni decisione architetturale significativa richiede un ADR. Nessuna eccezione.
Esempi: autenticazione, autorizzazione, ORM, eventi, websocket, caching,
auditing, nuove integrazioni esterne, cambi di pattern strutturali.

## Documentation Policy

La documentazione è codice. Ogni modifica significativa deve aggiornare: spec
correlate, contratti API (`openapi:export`), progress-tracker, review.

---

## Convenzioni backend

- Variabili env: SOLO tramite `AppConstants` — MAI `process.env` diretto
- Logger: `new Logger(NomeService.name)` — MAI `console.log` in produzione
- Errori HTTP: eccezioni NestJS standard
- DTO: sempre con decoratori class-validator

### Struttura obbligatoria modulo backend
```
app/backend/src/<modulo>/
├── <modulo>.module.ts
├── <modulo>.controller.ts
├── <modulo>.service.ts
└── dto/
```
Servizi core, guard globali, utility → `app/backend/src/common/`

## Convenzioni frontend

- Chiamate API: SOLO da `src/services/<modulo>.service.ts` — mai inline nei componenti
- Styling: CSS Modules (`*.module.css`) + props native Mantine
- MAI `createStyles`, MAI stili inline invasivi

---

## AI Governance

Le AI non possono: eseguire refactor globali senza approvazione, rinominare
moduli senza approvazione, aggiornare dipendenze npm senza autorizzazione,
modificare ADR già approvate, modificare business rules, auto-approvare RFC/
ADR/Spec/Plan.

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
- `DELETE` fisico su entità anagrafiche — usare soft delete
- `id` numerico in URL pubbliche — usare `guid`
- Secret o API key nel codice sorgente
- `console.log` in produzione — usare Logger NestJS
- Librerie UI diverse da Mantine v7 nel frontend
- `drizzle-kit push` in produzione
- Refactoring fuori dallo scope del task corrente
- Modificare file in `docs/` senza approvazione (territorio umano)
- Inventare endpoint, tabelle, DTO o business rules non documentate
- Inviare email direttamente da un service (usare sempre la coda BullMQ in `queues/email-queue/`)
- Scorciatoie temporanee senza ADR motivato e approvazione umana

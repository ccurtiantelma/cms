# Guida Utilizzo — CMS

> Per sviluppatori umani. Come lavorare operativamente sul progetto giorno per giorno,
> indipendentemente dall'AI usata.
>
> Ultima revisione: 2026-08-13 — assorbito il contenuto di `RUNBOOK.md` (eliminato: i due
> file duplicavano gli stessi comandi ed erano già divergenti sulla tabella delle porte).

---

## Setup iniziale (una tantum)

```bash
# 1. Clona il repo
git clone <url> cms && cd cms

# 2. Installa tutto dalla root (npm workspaces)
npm install

# 3. Copia i file .env
cp .env.example app/backend/.env
cp .env.example app/frontend/.env
# compila i valori reali (SECURITY_KEY, COOKIE_SECRET, SUPERADMIN_EMAIL/PASSWORD, ecc.)

# 4. Avvia i servizi locali (PostgreSQL + Redis + Mailhog)
docker-compose up -d

# 5. Genera ed applica le migrazioni DB
npm run db:generate
npm run db:migrate

# 6. Popola i dati demo (SuperAdmin + un utente per ruolo)
npm run seed

# 7. Avvia in sviluppo
npm run dev
```

---

## Comandi quotidiani

### Avvio
```bash
npm run dev                  # backend + frontend insieme
npm run dev:backend          # solo NestJS (porta 3000)
npm run dev:frontend         # solo Vite (porta 5173)
```

### Database
```bash
npm run db:generate   # genera migrazione dopo modifica di app/backend/src/db/schema.ts
npm run db:migrate    # applica migrazioni pendenti
npm run seed          # ripopola i dati demo (idempotente)
```
Modifiche allo schema DB: richiedono approvazione umana (CLAUDE.md → "Ask first").

### Contratto API (dopo ogni feature con endpoint nuovi o modificati)
```bash
npm run openapi:export   # rigenera docs/openapi.yaml dal backend in esecuzione
npm run openapi:types    # rigenera app/frontend/src/types/api.types.ts
git add docs/openapi.yaml app/frontend/src/types/api.types.ts
git commit -m "chore: aggiorna contratto OpenAPI"
```

### Qualità codice
```bash
npm run lint             # backend + frontend
npm run lint:backend
npm run lint:frontend
npm run format           # backend + frontend
```

### Test
```bash
npm run test              # unit + integration, backend + frontend
npm run test:e2e          # e2e backend (DB/Redis isolati, --runInBand --forceExit)
npm run test:e2e:browser  # e2e browser Playwright (e2e/)
```

### Aggiungere una libreria
```bash
npm install <lib> --workspace=app/backend    # solo backend
npm install <lib> --workspace=app/frontend   # solo frontend
```
Richiede approvazione umana (CLAUDE.md → "Ask first"). Per le librerie che toccano il
dominio CMS (editor, drag & drop, SDK LLM) serve anche una ADR.

### Build produzione
```bash
npm run build          # compila backend + frontend
```

### Reset totale ambiente
```bash
npm run clean && npm install
docker-compose down -v && docker-compose up -d
npm run db:migrate && npm run seed
```

---

## Ricette rapide

### Nuovo modulo backend
```
1. Aggiungi entità in app/backend/src/db/schema.ts        ← richiede approvazione umana
2. npm run db:generate && npm run db:migrate
3. Crea app/backend/src/<modulo>/{<modulo>.module.ts,<modulo>.controller.ts,
   <modulo>.service.ts,dto/}
4. Registra il modulo in app.module.ts
5. Applica GuardManager/GuardAdmin/GuardSuperAdmin come richiesto
6. Applica Utils.applyScopeFilter(authInfo) se il modulo gestisce dati multi-tenant
7. Crea i .yml Bruno per ogni endpoint
```

### Nuova pagina frontend
```
1. Crea app/frontend/src/types/<modulo>.types.ts
2. Crea app/frontend/src/services/<modulo>.service.ts
3. Crea app/frontend/src/pages/<modulo>/Page<Nome>.tsx
4. Aggiungi rotta in App.tsx
5. Aggiungi voce nel layout di navigazione
```

### Nuova collezione Bruno
```
bruno/<modulo>/<endpoint>.yml     # formato OpenCollection, richiede Bruno desktop >= 3.1
```
`bruno/opencollection.yml` e `bruno/environments/local.yml` sono già presenti
(`baseUrl = http://localhost:3000/api/v1`). Apri Bruno desktop → carica la cartella
`bruno/` → seleziona ambiente `local` → esegui.

### Health check
```bash
curl http://localhost:3000/api/v1/health
```
`200` se DB/Redis/coda BullMQ sono tutti raggiungibili, `503` altrimenti (con dettaglio
per-check nel body). Dettagli: `docs/ai/adr/ADR-7-health-check-terminus.md`.

---

## Iniziare una nuova feature

1. Crea branch: `git checkout -b feature/nome-feature`
2. Scrivi `docs/ai/features/FXX-nome.md` (modello: `docs/ai/features/FEATURE-TEMPLATE.md`)
3. Chiedi all'Orchestrator la spec in `docs/ai/specs/` → **approva**
4. Chiedi all'Orchestrator il plan in `docs/ai/plans/` → **approva**
5. Esegui un task alla volta con l'agente appropriato (Backend Developer / Frontend
   Developer / Test Engineer — vedi `CLAUDE.md` → "Ruoli")
6. Dopo ogni task: review → test → `[x]` nel plan → commit
7. A fine feature: `openapi:export` + `openapi:types` + aggiorna
   `docs/ai/progress-tracker.md`

**Regola fondamentale**: un task alla volta. Mai "implementa tutta la feature".

Se la feature introduce una decisione architetturale significativa (formato dei blocchi,
strategia di cache, modello multilingua, provider chatbot, pipeline media): **RFC prima,
ADR dopo approvazione**, poi si implementa.

## Modificare una feature già completata

Non modificare il file feature originale. Crea invece:
```
docs/ai/features/changes/YYYY-MM-DD-FXX-nome-change.md
```
Descrivi cosa cambia e perché. Poi genera una nuova spec di delta e un nuovo plan.

---

## CI (GitHub Actions)

Ogni PR verso `main`/`develop` esegue `.github/workflows/ci.yml`:

| Job | Blocca il merge? | Cosa fa |
|---|---|---|
| `backend` | Sì | lint + test unit + build (`app/backend`) |
| `frontend` | Sì | lint + test unit + build (`app/frontend`) |
| `backend-e2e` | Sì | `test:e2e` con Postgres (`cms_db_test`) + Redis effimeri |
| `openapi-sync` | No (informativo) | rigenera `docs/openapi.yaml` + `api.types.ts`, segnala drift |

Riprodurre in locale ciò che gira in CI:
```bash
npm run lint:backend && npm run test --workspace=app/backend && npm run build:backend
npm run lint:frontend && npm run test --workspace=app/frontend && npm run build:frontend
# backend-e2e richiede il DB cms_db_test, non creato di default — solo la prima volta:
# docker-compose exec postgres createdb -U cms cms_db_test
npm run test:e2e --workspace=app/backend
```
Se `openapi-sync` segnala drift: esegui in locale "Contratto API" qui sopra e committa.

---

## Deploy in produzione (Docker)

```bash
cp .env.example .env   # root, accanto a docker-compose.prod.yml — compila i valori reali
docker compose -f docker-compose.prod.yml up -d --build
```
- File separato da `docker-compose.yml` (dev). Nessun mailhog: SMTP reale via `.env`.
- `DATABASE_URL`/`REDIS_URL` sono ricalcolate dal compose, non lette da `.env`.
- `VITE_API_BASE_URL` è "bake-izzata" a build-time: per cambiarla, ricostruire l'immagine
  frontend (`--build`), non basta un restart.
- TLS e reverse proxy sono fuori scope: li fornisce l'ambiente di hosting.
- Dettagli: `docs/ai/adr/ADR-6-containerizzazione-produzione.md`.

---

## Checklist pre-commit

- [ ] Nessun `console.log` rimasto (usare `Logger` NestJS)
- [ ] Nessun `any` non commentato
- [ ] Nessun `process.env` diretto (usare `AppConstants`)
- [ ] Migrazioni generate se `schema.ts` modificato
- [ ] `openapi:export` + `openapi:types` eseguiti se endpoint modificati
- [ ] Collezione Bruno creata/aggiornata per ogni endpoint nuovo o modificato
- [ ] Rich text sanitizzato server-side, se il codice tocca contenuto di pagina
- [ ] Nessun contenuto non pubblicato raggiungibile da un endpoint `public/`
- [ ] Sub-task marcato `[x]` nel plan
- [ ] `docs/ai/progress-tracker.md` aggiornato se feature completata
- [ ] Nessuna modifica a `docs/` senza richiesta umana esplicita
- [ ] Se apri una PR: check CI verdi prima del merge

---

## Troubleshooting rapido

| Problema | Soluzione |
|---|---|
| `node_modules` corrotto | `npm run clean && npm install` |
| Migrazione fallita | controlla `DATABASE_URL` in `app/backend/.env`, poi `npm run db:migrate` |
| Tipi frontend non aggiornati | `npm run openapi:types` (richiede `openapi:export` prima, con backend avviato) |
| Porta già in uso | `lsof -i :3000` (o `:5173`/`:5432`/`:6379`/`:8025`) poi `kill <PID>` |
| Email non arrivano in dev | controlla Mailhog UI su http://localhost:8025 (SMTP finto, nessun invio reale) |
| 401 dopo login funzionante | verifica che il cookie `rtk` sia presente (httpOnly, signed) e `COOKIE_DOMAIN` coerente con l'host usato |

## Tabella porte

> Valori reali da `docker-compose.yml`, `.env.example` e `vite.config.ts`. Porte canoniche
> di ogni servizio, nessuna variante.

| Servizio | Porta host | Porta container |
|---|---|---|
| Backend (NestJS) | 3000 | — |
| Frontend (Vite) | 5173 | — |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |
| Mailhog SMTP | 1025 | 1025 |
| Mailhog UI | 8025 | 8025 |

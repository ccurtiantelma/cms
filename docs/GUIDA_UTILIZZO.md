# Guida Utilizzo — Starter Kit

> Per sviluppatori umani. Spiega come lavorare operativamente sul progetto giorno per
> giorno, indipendentemente dall'AI usata.

---

## Setup iniziale (una tantum)

```bash
# 1. Clona il repo
git clone <url> starter-kit && cd starter-kit

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

## Sviluppo quotidiano

### Avvio
```bash
npm run dev                  # backend + frontend insieme
npm run dev:backend          # solo NestJS (porta 3000)
npm run dev:frontend         # solo Vite (porta 5173)
```

### Aggiungere una libreria
```bash
npm install <lib> --workspace=app/backend    # solo backend
npm install <lib> --workspace=app/frontend   # solo frontend
```
Installazione di nuove dipendenze npm: vedi CLAUDE.md → "Ask first".

### Database
```bash
npm run db:generate   # genera migrazione dopo modifica di app/backend/src/db/schema.ts
npm run db:migrate    # applica migrazioni pendenti
npm run seed          # ripopola i dati demo (idempotente)
```
Modifiche allo schema DB: vedi CLAUDE.md → "Ask first".

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
npm run format            # backend + frontend
npm run format:backend
npm run format:frontend
```

### Test
```bash
npm run test              # unit + integration, backend + frontend
npm run test:e2e          # e2e backend (DB/Redis isolati, --runInBand --forceExit)
```

### CI (GitHub Actions)
Ogni PR verso `main`/`develop` esegue `.github/workflows/ci.yml`: job `backend`,
`frontend` e `backend-e2e` (lint + test + build/e2e, **bloccanti**, in parallelo) e
job `openapi-sync` (rigenera `docs/openapi.yaml`/`api.types.ts` e segnala drift,
informativo, non bloccante). Per riprodurre in locale esattamente ciò che gira in CI:
```bash
npm run lint:backend && npm run test --workspace=app/backend && npm run build:backend
npm run lint:frontend && npm run test --workspace=app/frontend && npm run build:frontend
# backend-e2e (richiede il DB app_db_test, non creato di default da docker-compose.yml —
# solo la prima volta: docker-compose exec postgres createdb -U app app_db_test):
npm run test:e2e --workspace=app/backend
```
Dettagli: `docs/system-architecture.md` → "CI/CD", `docs/ai/adr/ADR-5-ci-cd-pipeline.md`.

### API testing con Bruno
Apri Bruno desktop (≥ 3.1) → carica la cartella `bruno/` → seleziona ambiente `local` →
esegui. `baseUrl` punta a `http://localhost:3000/api/v1`.

### Build produzione
```bash
npm run build          # compila backend + frontend
```

---

## Iniziare una nuova feature

1. Crea branch: `git checkout -b feature/nome-feature`
2. Scrivi `docs/ai/features/F0X-nome.md` (usa `docs/ai/templates/../features/FEATURE-TEMPLATE.md`)
3. Chiedi all'Orchestrator di generare la spec in `docs/ai/specs/`
4. Approva la spec
5. Chiedi all'Orchestrator di generare il plan in `docs/ai/plans/`
6. Approva il plan
7. Esegui un task alla volta con l'agente appropriato (Backend Developer / Frontend
   Developer / Test Engineer — vedi `CLAUDE.md` → "Ruoli")
8. Dopo ogni task: review → test → `[x]` nel plan → commit
9. A fine feature: `openapi:export` + `openapi:types` + aggiorna
   `docs/ai/progress-tracker.md`

---

## Modificare una feature già completata

Non modificare il file feature originale. Crea invece:
```
docs/ai/features/changes/YYYY-MM-DD-F0X-nome-change.md
```
Descrivi cosa cambia e perché. Poi genera una nuova spec di delta e un nuovo plan.

---

## Troubleshooting rapido

| Problema | Soluzione |
|---|---|
| `node_modules` corrotto | `npm run clean && npm install` |
| Migrazione fallita | controlla `DATABASE_URL` in `app/backend/.env`, poi `npm run db:migrate` |
| Tipi frontend non aggiornati | `npm run openapi:types` (richiede backend avviato per `openapi:export` prima) |
| Porta già in uso | `lsof -i :3000` (o `:5173`/`:5432`/`:6379`/`:8025`) poi `kill <PID>` |
| Email non arrivano in dev | controlla Mailhog UI su http://localhost:8025 (SMTP finto, nessun invio reale) |
| 401 dopo login funzionante | controlla che il cookie `rtk` sia presente (httpOnly, signed) e `COOKIE_DOMAIN` coerente con l'host usato |

## Tabella porte

| Servizio | Porta |
|---|---|
| Backend (NestJS) | 3000 |
| Frontend (Vite) | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Mailhog UI | 8025 |

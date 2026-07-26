# Runbook — Starter Kit (1 pagina)

> Riferimento velocissimo. Tutto ciò che serve in meno di 30 secondi.

---

## Avvia il progetto
```bash
docker-compose up -d && npm install && npm run db:migrate && npm run dev
```

## Nuovo modulo backend
```
1. Aggiungi entità in app/backend/src/db/schema.ts
2. npm run db:generate
3. npm run db:migrate
4. Crea app/backend/src/<modulo>/{<modulo>.module.ts,<modulo>.controller.ts,<modulo>.service.ts,dto/}
5. Registra il modulo in app.module.ts
6. Applica GuardManager/GuardAdmin/GuardSuperAdmin come richiesto
7. Applica Utils.applyScopeFilter(authInfo) se il modulo gestisce dati multi-tenant
```

## Nuova pagina frontend
```
1. Crea app/frontend/src/types/<modulo>.types.ts
2. Crea app/frontend/src/services/<modulo>.service.ts
3. Crea app/frontend/src/pages/<modulo>/Page<Nome>.tsx
4. Aggiungi rotta in App.tsx
5. Aggiungi voce nel layout di navigazione
```

## Aggiorna contratto API
```bash
npm run openapi:export
npm run openapi:types
git add docs/openapi.yaml app/frontend/src/types/api.types.ts && git commit -m "chore: openapi"
```

## Installa libreria
```bash
npm install <lib> --workspace=app/backend   # o app/frontend
```
Richiede approvazione umana (CLAUDE.md → "Ask first").

## Reset totale ambiente
```bash
npm run clean && npm install
docker-compose down -v && docker-compose up -d
npm run db:migrate && npm run seed
```

## Nuova collezione Bruno

```
# Sempre creare il .yml per ogni endpoint nuovo o modificato (richiede Bruno desktop >= 3.1)
bruno/<modulo>/<endpoint>.yml
```
`bruno/opencollection.yml` e `bruno/environments/local.yml` sono già presenti
(`baseUrl = http://localhost:3000/api/v1`).

## CI/CD (GitHub Actions)
```
.github/workflows/ci.yml — trigger: pull_request verso main/develop
```
| Job | Blocca il merge? | Cosa fa |
|---|---|---|
| `backend` | Sì | lint + test unit + build (`app/backend`) |
| `frontend` | Sì | lint + test unit + build (`app/frontend`) |
| `backend-e2e` | Sì | `test:e2e` con Postgres (`app_db_test`) + Redis effimeri |
| `openapi-sync` | No (informativo) | rigenera `docs/openapi.yaml` + `api.types.ts` con Postgres/Redis effimeri, segnala drift dal committato |

Se `openapi-sync` segnala drift: esegui in locale la sequenza di "Aggiorna
contratto API" qui sopra e committa. Dettagli/alternative: `docs/ai/adr/ADR-5-ci-cd-pipeline.md`.

## Deploy in produzione (Docker)
```bash
cp .env.example .env   # root, accanto a docker-compose.prod.yml — compila i valori reali
docker compose -f docker-compose.prod.yml up -d --build
```
- File separato da `docker-compose.yml` (dev). Nessun mailhog: SMTP reale via `.env`.
- `DATABASE_URL`/`REDIS_URL` sono ricalcolate dal compose, non lette da `.env`
  (evita drift con `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`).
- `VITE_API_BASE_URL` è "bake-izzata" a build-time: per cambiarla, ricostruire
  l'immagine frontend (`--build`), non basta un restart.
- Dettagli/alternative: `docs/ai/adr/ADR-6-containerizzazione-produzione.md`.

## Health check applicativo
```bash
curl http://localhost:3000/api/v1/health
```
`200` se DB/Redis/coda BullMQ sono tutti raggiungibili, `503` altrimenti (con
dettaglio per-check nel body) — usalo come readiness probe in un orchestratore.
Dettagli: `docs/ai/adr/ADR-7-health-check-terminus.md`.

## Checklist pre-commit
- [ ] Nessun `console.log` rimasto (usare `Logger` NestJS)
- [ ] Nessun `any` non commentato
- [ ] Migrazioni generate se `schema.ts` modificato
- [ ] `openapi:export` + `openapi:types` eseguiti se endpoint modificati
- [ ] Collezione Bruno creata/aggiornata per ogni endpoint nuovo o modificato
- [ ] Sub-task marcato `[x]` nel plan
- [ ] `docs/ai/progress-tracker.md` aggiornato se feature completata
- [ ] Nessuna modifica a `docs/` senza approvazione umana esplicita
- [ ] Se apri una PR: check CI verdi (`backend`/`frontend`/`backend-e2e` bloccanti,
      `openapi-sync` informativo) prima del merge

## Porte

| Servizio | Porta |
|---|---|
| Backend (NestJS) | 3000 |
| Frontend (Vite) | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Mailhog UI | 8025 |

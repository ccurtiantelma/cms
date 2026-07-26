# ADR-6 — Containerizzazione di produzione: Dockerfile multi-stage + compose prod separato

## Status
[x] In discussione · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
N/D — in attesa di approvazione umana (bozza generata da AI, vedi `docs/instructions.md` →
"Policy docs — chi scrive dove": gli ADR sono generati su richiesta e attendono
approvazione, mai auto-approvati)

## RFC di riferimento
Nessuna RFC dedicata. Punto 2 di un'analisi/audit richiesta esplicitamente dall'umano.

## Contesto

`docker-compose.yml` in root copre solo i servizi di supporto allo sviluppo (Postgres,
Redis, Mailhog) — backend e frontend girano nativamente via `npm run dev`. Non esisteva
alcun percorso per costruire ed eseguire l'applicazione come container in produzione:
nessun `Dockerfile`, nessun compose dedicato, nessuna immagine ottimizzata.

Requisiti individuati:
- Immagini di produzione minime (multi-stage: build con devDependencies → runtime
  senza), non l'immagine "da sviluppo" con l'intero `node_modules` non filtrato.
- Frontend servito come asset statici (nginx), non tramite `vite preview`/dev server.
- Un compose di produzione **separato** da quello di sviluppo, per non confondere i due
  scenari (`docker-compose.yml` resta invariato).

## Decisione

Due `Dockerfile` multi-stage (contesto di build: root del monorepo, non le singole
`app/*/`, perché `npm ci` con npm workspaces richiede i `package.json` di tutti i
workspace):

1. **`app/backend/Dockerfile`** — stage `deps` (install completo) → `build` (`nest
   build`) → `prod-deps` (`npm ci --omit=dev`, immagine più snella) → `runtime`
   (`node:20-alpine`, solo `dist/` + `node_modules` di produzione, utente non-root
   `node`, `HEALTHCHECK` che chiama `GET /api/v1/health` con `fetch` nativo di Node 20
   — riusa l'health check di ADR-7, nessuna dipendenza aggiuntiva nell'immagine).
2. **`app/frontend/Dockerfile`** — stage `deps`/`build` (`vite build`, `VITE_API_BASE_URL`
   passata come build-arg: Vite la "bake-izza" nel bundle a build-time, non è una
   variabile letta a runtime) → `runtime` (`nginx:1.27-alpine`, `nginx.conf` dedicato con
   fallback SPA `try_files ... /index.html`, `HEALTHCHECK` con `wget`).

`docker-compose.prod.yml` (root, separato da `docker-compose.yml`): 4 servizi
(`postgres`, `redis`, `backend`, `frontend`, **niente mailhog** — SMTP reale in
produzione), `depends_on: condition: service_healthy` per backend/postgres/redis,
`DATABASE_URL`/`REDIS_URL` **ricalcolate nel compose** (non lette da `.env`) a partire
da `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` per evitare drift tra le due
config, porte Postgres/Redis non pubblicate sull'host (solo rete Docker interna).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Dockerfile multi-stage per servizio + compose prod separato** (scelta) | Immagini minime, build riproducibile, dev/prod non si mescolano | Due Dockerfile da mantenere, contesto di build alla root (leggermente meno intuitivo di un contesto per-app) | Compromesso necessario per npm workspaces; verificato con build+run reali |
| Un solo Dockerfile "monolite" (backend+frontend nello stesso container, nginx come reverse proxy interno) | Un solo servizio da orchestrare | Accoppia il ciclo di vita/scaling di due componenti indipendenti; contrario alla convenzione "ogni servizio scala a sé" | Scartato: nessun vantaggio reale per un boilerplate pensato per essere esteso |
| Estendere `docker-compose.yml` esistente con backend/frontend (niente file separato) | Un solo file | Confonde lo scenario dev (hot-reload, `npm run dev`) con quello prod (immagini buildate); rischio di eseguire per errore config di prod in locale | Contrasta con richiesta esplicita "prod compose separato da quello dev" |
| Immagine runtime `node:20` (non `-alpine`) | Meno sorprese con pacchetti nativi (es. `bcrypt`) | Immagine ~5x più pesante | `bcrypt`/`pg` compilano correttamente su alpine nei test eseguiti (nessun problema riscontrato) |

## Conseguenze

- **Positive**: percorso di deploy containerizzato riproducibile, immagini snelle
  (backend ~331MB, frontend ~49MB nei test locali), health check Docker nativo
  (`HEALTHCHECK`) integrato per readiness/liveness a livello di orchestratore.
- **Negative / attenzione**:
  - TLS, dominio pubblico e reverse proxy sono **intenzionalmente fuori scope** — vanno
    aggiunti dall'ambiente di hosting (Traefik/nginx/load balancer del provider)
    davanti a `frontend`/`backend`. Nessun ADR di follow-up ancora aperto per questo.
  - `VITE_API_BASE_URL` è "bake-izzata" a build-time: un cambio richiede di ricostruire
    l'immagine frontend, non basta un restart/redeploy del container.
  - Bug scoperto e corretto durante la verifica (non ipotetico, riprodotto e risolto):
    l'utente non-root `node` non aveva permessi di scrittura su `/app` per
    `LOG_DIR` (`logs/`, Winston) → `RUN mkdir -p /app/logs && chown -R node:node
    /app/logs` prima di `USER node` in `app/backend/Dockerfile`.
  - Bug scoperto e corretto durante la verifica: l'`HEALTHCHECK` nginx con `wget
    http://localhost` falliva (`connection refused`) perché `localhost` risolve prima
    su `::1` (IPv6) e nginx qui ascolta solo IPv4, mentre `wget` (busybox) non fa
    fallback dual-stack come `fetch`/Node — corretto usando `127.0.0.1` esplicito.
- **Documentazione**: aggiornati su richiesta esplicita (vedi `docs/instructions.md` →
  "Policy docs — chi scrive dove"): `docs/system-architecture.md` (sezione "Deploy —
  Docker"), `docs/RUNBOOK.md` (sezione deploy prod), `docs/ai/progress-tracker.md`.
  `.env.example` esteso con `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` (file di
  config di root, non `docs/`).

## Conformità

- File: `app/backend/Dockerfile`, `app/frontend/Dockerfile`, `app/frontend/nginx.conf`,
  `docker-compose.prod.yml`, `.dockerignore`, `.env.example` (variabili `POSTGRES_*`
  aggiunte).
- Verifica eseguita: `docker build` di entrambe le immagini; avvio reale di
  Postgres/Redis/backend/frontend containerizzati su una rete Docker isolata
  (`sk-test-net`/progetto compose `sk-smoketest`, poi rimossi); `GET /api/v1/health`
  raggiunto dal container backend pubblicato (200 con tutti i check `up`); frontend
  verificato su `/` e su una rotta client-side (fallback SPA, 200 su entrambe);
  `HEALTHCHECK` Docker nativo verificato `healthy` per entrambe le immagini dopo il fix
  dei due bug sopra; `docker compose -f docker-compose.prod.yml config` verificato
  (interpolazione `DATABASE_URL`/`REDIS_URL` corretta); avvio via
  `docker compose up` verificato fino al backend incluso (`depends_on:
  condition: service_healthy` rispettato — backend parte solo dopo postgres/redis
  `healthy`). Nessuna risorsa di test lasciata attiva (container/immagini/volumi/rete
  rimossi al termine).

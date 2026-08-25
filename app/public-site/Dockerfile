# Dockerfile multi-stage per il sito pubblico SSR (ADR-22). Contesto di build:
# la root del monorepo (npm workspaces — vedi docker-compose.prod.yml,
# `context: .`), non app/public-site/, perché la build richiede
# package.json/package-lock.json di root e i package.json di tutti i workspace
# ("app/*") per la risoluzione npm ci. Stesso pattern di app/backend/Dockerfile.
#
# docker build -f app/public-site/Dockerfile -t cms-public-site .

# ─── deps ───────────────────────────────────────────────────────────────────
# Installa TUTTE le dipendenze (dev incluse, servono per la build Vite/SSR).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/frontend/package.json ./app/frontend/package.json
COPY app/public-site/package.json ./app/public-site/package.json
RUN npm ci

# ─── build ──────────────────────────────────────────────────────────────────
# vite.config.ts risolve gli alias @blocks/@api-types dentro app/frontend/src
# (ADR-22 § 3: unica copia dei componenti di blocco, bundlata a build time
# nell'output SSR — non un import runtime, niente node_modules/frontend a
# runtime). Serve quindi anche il sorgente frontend in questo stage.
#
# VITE_PUBLIC_MEDIA_BASE_URL (ADR-27 § 6) è "baked" qui esattamente come
# VITE_API_BASE_URL nel frontend (app/frontend/Dockerfile): Vite sostituisce
# import.meta.env.VITE_* a build-time anche per `vite build --ssr`, verificato
# empiricamente (stesso meccanismo, nessuna doppia risoluzione fra i due
# workspace — è il punto che ADR-27 § 6 impone). Senza questo ARG il
# componente `Image` condiviso ricadrebbe sempre sul default di sviluppo
# (`http://localhost:53000`), diverso da quello reale usato dal frontend admin
# in produzione: la stessa classe di divergenza che l'ADR vieta.
FROM deps AS build
COPY app/frontend/src ./app/frontend/src
COPY app/public-site ./app/public-site
ARG VITE_PUBLIC_MEDIA_BASE_URL
ENV VITE_PUBLIC_MEDIA_BASE_URL=${VITE_PUBLIC_MEDIA_BASE_URL}
RUN npm run build --workspace=app/public-site

# ─── prod-deps ──────────────────────────────────────────────────────────────
# Solo dipendenze di produzione (no devDependencies), immagine runtime più
# snella. `vite build --ssr` non bundla react/react-dom nel file server
# (restano `import` non risolti nel bundle) — a runtime servono in
# node_modules, non bastano i soli file di dist/.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/frontend/package.json ./app/frontend/package.json
COPY app/public-site/package.json ./app/public-site/package.json
RUN npm ci --omit=dev

# ─── runtime ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# node_modules/public-site è un symlink npm-workspaces verso ./app/public-site:
# in prod-deps quella cartella contiene solo package.json (niente sorgenti
# copiati in quello stage). Qui sotto ricostruiamo lo stesso path relativo con
# package.json + dist/ prodotta dallo stage build, altrimenti il processo
# risolve il symlink e trova una directory incompleta (MODULE_NOT_FOUND).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/app/public-site/dist ./app/public-site/dist
COPY app/public-site/package.json ./app/public-site/package.json

# Nessuna LOG_DIR/logging su file: questo workspace non usa Winston, è
# stateless per decisione ADR-22 § 6.

# Utente non-root (immagine node:alpine include già "node", uid/gid 1000).
USER node

EXPOSE 4000

# Readiness/liveness — GET /healthz (src/server.ts, 200 "ok"). Node 20 ha
# `fetch` globale, niente bisogno di curl/wget nell'immagine alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "app/public-site/dist/server.js"]

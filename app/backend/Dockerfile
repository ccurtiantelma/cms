# Dockerfile multi-stage per il backend NestJS. Contesto di build: la root del
# monorepo (npm workspaces — vedi docker-compose.prod.yml, `context: .`), non
# app/backend/, perché la build richiede package.json/package-lock.json di root
# e i package.json di tutti i workspace ("app/*") per la risoluzione npm ci.
#
# docker build -f app/backend/Dockerfile -t starter-kit-backend .

# ─── deps ───────────────────────────────────────────────────────────────────
# Installa TUTTE le dipendenze (dev incluse, servono per la build TypeScript).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/frontend/package.json ./app/frontend/package.json
RUN npm ci

# ─── build ──────────────────────────────────────────────────────────────────
FROM deps AS build
COPY app/backend ./app/backend
RUN npm run build --workspace=app/backend

# ─── prod-deps ──────────────────────────────────────────────────────────────
# Solo dipendenze di produzione (no devDependencies), immagine runtime più snella.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/frontend/package.json ./app/frontend/package.json
RUN npm ci --omit=dev

# ─── runtime ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/app/backend/dist ./app/backend/dist
COPY app/backend/package.json ./app/backend/package.json

# LOG_DIR (default "logs", AppConstants) è un path relativo alla cwd del
# processo: WinstonLoggerService (winston-daily-rotate-file) lo crea al primo
# avvio. Va predisposto qui e assegnato all'utente non-root, altrimenti il
# mkdir fallisce con EACCES (working dir /app di proprietà di root).
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# Utente non-root (immagine node:alpine include già "node", uid/gid 1000).
USER node

EXPOSE 3000

# Readiness/liveness — riusa l'health check applicativo (src/health/, Terminus:
# verifica DB, Redis, coda BullMQ). Node 20 ha `fetch` globale, niente bisogno
# di curl/wget nell'immagine alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "app/backend/dist/src/main.js"]

# Dockerfile multi-stage per il frontend React + Vite → nginx statico.
# Contesto di build: la root del monorepo (stesso motivo del backend, vedi
# app/backend/Dockerfile — npm workspaces).
#
# docker build -f app/frontend/Dockerfile --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 -t starter-kit-frontend .

# ─── deps ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/frontend/package.json ./app/frontend/package.json
RUN npm ci

# ─── build ──────────────────────────────────────────────────────────────────
# VITE_API_BASE_URL è "baked" nel bundle statico a build-time (comportamento
# standard di Vite, import.meta.env) — non è una variabile letta a runtime dal
# container nginx. Per cambiarla serve rifare la build dell'immagine.
FROM deps AS build
WORKDIR /app
COPY app/frontend ./app/frontend
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build --workspace=app/frontend

# ─── runtime ────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY app/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/app/frontend/dist /usr/share/nginx/html

EXPOSE 80

# 127.0.0.1 esplicito (non "localhost"): wget (busybox) risolve "localhost" su
# ::1 prima di IPv4 e nginx qui ascolta solo IPv4 — a differenza di Node
# (fetch/undici, vedi app/backend/Dockerfile) che gestisce il fallback dual-stack
# da solo, wget si limita al primo indirizzo risolto e fallisce con "connection refused".
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1

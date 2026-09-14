#!/usr/bin/env bash
# Attende che il backend risponda su /api/v1/health prima di far partire il
# public-site in sviluppo. Senza questo, `npm run dev` avvia backend e
# public-site in parallelo (concurrently): il backend impiega qualche secondo
# in più a compilare e connettersi a Postgres/Redis, e il primo giro di
# render del public-site arriva prima che il backend sia in ascolto —
# ECONNREFUSED su /public/settings/theme, tollerato (nessun tema applicato)
# ma evitabile. Solo sviluppo: build/prod partono da container già pronti.
set -euo pipefail

PORT="${PORT_BACKEND:-53000}"
URL="http://127.0.0.1:${PORT}/api/v1/health"
TIMEOUT_SECONDS=60
elapsed=0

echo "[wait-for-backend] attendo ${URL}..."
until curl -sf -o /dev/null "$URL"; do
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    echo "[wait-for-backend] timeout dopo ${TIMEOUT_SECONDS}s, procedo comunque." >&2
    exit 0
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
echo "[wait-for-backend] backend pronto dopo ${elapsed}s."

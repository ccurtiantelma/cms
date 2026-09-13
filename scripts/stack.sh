#!/usr/bin/env bash
# Gestione dello stack Docker locale (dev/prod). Passare sempre da qui invece
# di `docker compose up` a mano evita i due guasti ricorrenti osservati:
#
#   1. "Found orphan containers" — dev (docker-compose.yml) e prod
#      (docker-compose.prod.yml, `name: cms`) condividono lo stesso project
#      name Docker Compose: passare dall'uno all'altro senza --remove-orphans
#      lascia i container dell'altro file "orfani" (mailhog, nginx-static...).
#   2. "address already in use" — dev (backend/public-site via `npm run dev`)
#      e prod (stessi servizi in container) pubblicano di proposito GLI
#      STESSI host port (53000/55000/58080): non possono mai girare insieme,
#      per design. Un backend di sviluppo dimenticato acceso da una sessione
#      precedente basta a far fallire il bind del container in produzione.
#
# Ogni sottocomando è idempotente: libera prima le porte dell'altro stack
# (container Docker con `compose down --remove-orphans`, processi `npm run
# dev` residui con un kill mirato solo sulle porte di questo progetto), poi
# avvia quello richiesto. Mai un `docker compose up` nudo altrove nel repo:
# questo è l'unico punto che li lancia.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DEV_FILE="docker-compose.yml"
PROD_FILE="docker-compose.prod.yml"

# Porte pubblicate da un `npm run dev` in ascolto diretto sull'host (mai da
# Docker: quelle le libera già `compose down --remove-orphans`). Elenco
# chiuso e specifico di questo progetto — non tocca nient'altro sulla
# macchina, anche condivisa con altri stack (vedi header di docker-compose.yml).
DEV_NPM_PORTS=(53000 55000 5173)

log() { echo "[stack] $*"; }

# Termina, se occupata, una delle porte sopra. Non Docker per costruzione:
# i container li governa `compose down`, mai un kill diretto sulla loro porta
# (ucciderebbe solo il proxy di Docker, lasciando il container acceso e la
# porta comunque occupata).
free_npm_port() {
  local port="$1" pid
  pid=$(ss -ltnp 2>/dev/null | awk -v p=":${port}\$" '$4 ~ p {print $0}' | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "${pid:-}" ]; then
    log "porta ${port} occupata dal processo locale PID ${pid}: la libero."
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
}

stop_dev_npm() {
  local p
  for p in "${DEV_NPM_PORTS[@]}"; do
    free_npm_port "$p"
  done
}

down_all() {
  log "arresto stack dev (${DEV_FILE})..."
  docker compose -f "$DEV_FILE" down --remove-orphans
  log "arresto stack prod (${PROD_FILE})..."
  docker compose -f "$PROD_FILE" down --remove-orphans
  stop_dev_npm
  log "stack fermati, porte del progetto libere."
}

dev_infra_up() {
  log "preparazione stack dev: libero prima quanto potrebbe collidere (stack prod, npm dev residui)..."
  docker compose -f "$PROD_FILE" down --remove-orphans
  stop_dev_npm
  docker compose -f "$DEV_FILE" up -d --remove-orphans
  log "infrastruttura dev pronta (postgres/redis/mailhog/nginx-static)."
}

prod_up() {
  log "preparazione stack prod: libero prima quanto potrebbe collidere (stack dev, npm dev residui)..."
  docker compose -f "$DEV_FILE" down --remove-orphans
  stop_dev_npm
  docker compose -f "$PROD_FILE" up -d --build --remove-orphans
  log "stack prod avviato."
}

status() {
  echo "--- container dev (${DEV_FILE})"
  docker compose -f "$DEV_FILE" ps 2>/dev/null || true
  echo "--- container prod (${PROD_FILE})"
  docker compose -f "$PROD_FILE" ps 2>/dev/null || true
  echo "--- porte del progetto in ascolto sull'host"
  ss -ltnp 2>/dev/null | grep -E ':(53000|55000|5173|55432|56379|51025|58025|58080|5080)\b' || echo "nessuna"
}

case "${1:-}" in
  dev-infra) dev_infra_up ;;
  prod-up) prod_up ;;
  down) down_all ;;
  status) status ;;
  *)
    echo "Uso: $0 {dev-infra|prod-up|down|status}" >&2
    exit 1
    ;;
esac

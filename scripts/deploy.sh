#!/usr/bin/env bash
# cotizAR – deploy en un solo comando
# Uso: bash /opt/cotizar/scripts/deploy.sh [--no-pull] [--no-nginx]
#
# Variables de entorno opcionales:
#   DEPLOY_DIR   default: /opt/cotizar
#   DEPLOY_PORT  default: 3001
#   IMAGE        default: ghcr.io/martinsantos/cotiza:latest

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cotizar}"
DEPLOY_PORT="${DEPLOY_PORT:-3001}"
IMAGE="${IMAGE:-ghcr.io/martinsantos/cotiza:latest}"

NO_PULL=false
NO_NGINX=false
for arg in "$@"; do
  case "$arg" in
    --no-pull)  NO_PULL=true ;;
    --no-nginx) NO_NGINX=true ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }
sep() { echo "────────────────────────────────────────"; }

sep
log "cotizAR deploy"
log "Dir:    $DEPLOY_DIR"
log "Puerto: $DEPLOY_PORT"
log "Imagen: $IMAGE"
sep

cd "$DEPLOY_DIR"

# ── 1. RED: garantizar que licitometro_internal existe ──────────────────────
log "1/5 · Redes Docker"
docker network inspect licitometro_internal &>/dev/null \
  && log "     licitometro_internal: OK" \
  || { docker network create licitometro_internal; log "     licitometro_internal: creada"; }

# ── 2. IMAGEN ────────────────────────────────────────────────────────────────
if [ "$NO_PULL" = false ]; then
  log "2/5 · Pull imagen"
  docker pull "$IMAGE" && log "     OK" || log "     Sin imagen nueva (usando cache local)"
else
  log "2/5 · Pull omitido (--no-pull)"
fi

# ── 3. RESTART CON FORCE-RECREATE ────────────────────────────────────────────
# --force-recreate detiene el container anterior (libera el puerto), crea uno nuevo
# y lo conecta a TODAS las redes del compose (cotizar-network + licitometro_internal)
log "3/5 · Restart cotizar-api"
if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

$COMPOSE up -d --force-recreate cotizar-api
docker image prune -f &>/dev/null || true

# ── 4. HEALTH CHECK ──────────────────────────────────────────────────────────
log "4/5 · Health check (espera hasta 120s)"
for i in $(seq 1 24); do
  RESP=$(curl -sf "http://localhost:${DEPLOY_PORT}/cotizar/health" 2>/dev/null || true)
  if echo "$RESP" | grep -q '"status"'; then
    log "     OK en intento $i/24"
    break
  fi
  if [ "$i" -eq 24 ]; then
    log "ERROR: no responde después de 120s"
    docker logs cotizar-api --tail 40 2>/dev/null || true
    exit 1
  fi
  printf "."
  sleep 5
done
echo ""

# ── 5. NGINX INJECTION ───────────────────────────────────────────────────────
if [ "$NO_NGINX" = true ]; then
  log "5/5 · Nginx omitido (--no-nginx)"
elif ! command -v nginx &>/dev/null; then
  log "5/5 · Nginx no encontrado en PATH – omitido"
else
  log "5/5 · Nginx injection"
  nginx_reload() {
    nginx -s reload 2>/dev/null \
      || systemctl reload nginx 2>/dev/null \
      || service nginx reload 2>/dev/null \
      || true
  }

  licit_http() {
    curl -so /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1/" 2>/dev/null || echo "000"
  }

  # Verificar si ya funciona
  PROXY_CHECK=$(curl -sf --max-time 5 "http://127.0.0.1/cotizar/health" 2>/dev/null || true)
  if echo "$PROXY_CHECK" | grep -q '"status"'; then
    log "     Proxy ya operativo"
  else
    # Buscar vhost
    ALL_CONFS=$(nginx -T 2>/dev/null | grep "^# configuration file" | sed 's/.*file //' | sed 's/:.*//' | grep -v '^$' | sort -u || true)
    VHOST_CONF=""
    for c in $ALL_CONFS; do
      [ -f "$c" ] || continue
      echo "$c" | grep -q "nginx.conf$" && continue
      if grep -qE "listen[[:space:]]+80|server_name" "$c" 2>/dev/null; then
        VHOST_CONF="$c"; break
      fi
    done
    if [ -z "$VHOST_CONF" ]; then
      for c in /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default \
                /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/licitometro.conf \
                /etc/nginx/conf.d/licitometro.ar.conf; do
        if [ -f "$c" ] && grep -qE "server_name|listen" "$c" 2>/dev/null; then
          VHOST_CONF="$c"; break
        fi
      done
    fi

    if [ -n "$VHOST_CONF" ]; then
      log "     Vhost: $VHOST_CONF"
      cp "$VHOST_CONF" "${VHOST_CONF}.bak"
      python3 "$DEPLOY_DIR/scripts/nginx_strip.py" "$VHOST_CONF" 2>/dev/null || true
      if python3 "$DEPLOY_DIR/scripts/nginx_inject.py" "$VHOST_CONF" "$DEPLOY_PORT" && nginx -t &>/dev/null; then
        nginx_reload && sleep 2
        AFTER=$(curl -sf --max-time 5 "http://127.0.0.1/cotizar/health" 2>/dev/null || echo "FAIL")
        LICIT=$(licit_http)
        if [ "$LICIT" = "000" ]; then
          log "     ERROR: licitometro roto — restaurando backup"
          cp "${VHOST_CONF}.bak" "$VHOST_CONF"; nginx_reload
        else
          log "     Proxy OK | licitometro HTTP $LICIT"
        fi
      else
        log "     Config inválida — restaurando backup"
        cp "${VHOST_CONF}.bak" "$VHOST_CONF"; nginx_reload 2>/dev/null || true
      fi
    else
      log "     Vhost no encontrado – nginx injection omitida"
    fi
  fi
fi

# ── RESUMEN ──────────────────────────────────────────────────────────────────
sep
log "LISTO"
log "Direct : $(curl -sf "http://127.0.0.1:${DEPLOY_PORT}/cotizar/health" 2>/dev/null || echo FAIL)"
log "HTTP   : $(curl -sf "http://127.0.0.1/cotizar/health" 2>/dev/null || echo FAIL)"
log "Redes  : $(docker inspect cotizar-api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || echo '?')"
log "Imagen : $(docker inspect cotizar-api --format '{{.Config.Image}}' 2>/dev/null || echo '?')"
sep

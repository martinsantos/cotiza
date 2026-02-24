#!/usr/bin/env bash
# cotizAR — RESTAURACION MANUAL COMPLETA
# Ejecutar en el VPS como root o con sudo:
#   bash /ruta/al/repo/scripts/restore.sh
#
# O directamente sin clonar:
#   bash <(curl -sf https://raw.githubusercontent.com/martinsantos/cotiza/claude/integrate-quote-module-UHdkI/scripts/restore.sh)
#
# Detecta automáticamente dónde está el repo (workspace CI o /opt/cotizar)

set -euo pipefail
log() { echo "[$(date '+%H:%M:%S')] $*"; }
sep() { echo "════════════════════════════════════════"; }

sep
log "cotizAR — Restauración completa post reinstalación Docker"
sep

# ── 0. Localizar el repo ──────────────────────────────────────────────────────
REPO_DIR=""
# Candidatos en orden de preferencia
for candidate in \
    "$(find /root /home -maxdepth 6 -name "Dockerfile" -path "*/cotiza/*" 2>/dev/null | head -1 | xargs -r dirname)" \
    /opt/cotizar \
    "$(find /root /home -maxdepth 6 -name "docker-compose.yml" -path "*/cotiza/*" 2>/dev/null | head -1 | xargs -r dirname)"; do
  if [ -n "$candidate" ] && [ -f "$candidate/docker-compose.yml" ]; then
    REPO_DIR="$candidate"
    break
  fi
done

if [ -z "$REPO_DIR" ]; then
  log "ERROR: No se encontró el repo cotizAR en el servidor."
  log "       Cloná o copiá el repo y ejecutá de nuevo:"
  log "       git clone https://github.com/martinsantos/cotiza /opt/cotizar"
  log "       bash /opt/cotizar/scripts/restore.sh"
  exit 1
fi

log "Repo encontrado: $REPO_DIR"
cd "$REPO_DIR"

# ── 1. Pull del código más reciente ──────────────────────────────────────────
log "1/6 · Actualizando código desde git"
git fetch --all 2>/dev/null || log "     WARN: git fetch falló (continuando con código local)"
BRANCH="claude/integrate-quote-module-UHdkI"
if git rev-parse --verify "origin/$BRANCH" &>/dev/null; then
  git checkout "$BRANCH" 2>/dev/null || true
  git reset --hard "origin/$BRANCH" 2>/dev/null || true
  log "     Branch: $BRANCH"
else
  log "     WARN: branch $BRANCH no encontrada, usando código actual"
fi

# ── 2. Red Docker ─────────────────────────────────────────────────────────────
log "2/6 · Red Docker licitometro_internal"
docker network inspect licitometro_internal &>/dev/null \
  && log "     licitometro_internal: ya existe" \
  || { docker network create licitometro_internal; log "     licitometro_internal: creada"; }

# ── 3. Build imagen ───────────────────────────────────────────────────────────
IMAGE="ghcr.io/martinsantos/cotiza:latest"
log "3/6 · Build imagen Docker (puede tardar 2-4 min)"
docker build -t "$IMAGE" . 2>&1 | tail -5
log "     Build OK"

# ── 4. Iniciar/recrear contenedor ────────────────────────────────────────────
log "4/6 · Iniciando cotizar-api"
if docker compose version &>/dev/null 2>&1; then COMPOSE="docker compose"
else COMPOSE="docker-compose"; fi

DEPLOY_PORT="${DEPLOY_PORT:-3001}"
export DEPLOY_PORT IMAGE

# Intentar levantar con compose
$COMPOSE up -d --force-recreate cotizar-api 2>&1 | tail -3 || {
  log "     Compose falló, levantando con docker run directo"
  docker rm -f cotizar-api 2>/dev/null || true
  docker run -d \
    --name cotizar-api \
    --restart unless-stopped \
    --network licitometro_internal \
    -p "${DEPLOY_PORT}:3000" \
    -e NODE_ENV=production \
    -e PORT=3000 \
    -e API_HOST=0.0.0.0 \
    -e BASE_PATH=/cotizar \
    -e LICITOMETRO_API_URL=https://www.licitometro.ar/api \
    "$IMAGE"
}

# ── 5. Health check ───────────────────────────────────────────────────────────
log "5/6 · Health check (espera hasta 150s)"
HEALTH_OK=false
for i in $(seq 1 30); do
  RESP=$(curl -sf --max-time 3 "http://localhost:${DEPLOY_PORT}/cotizar/health" 2>/dev/null || true)
  if echo "$RESP" | grep -q '"status"'; then
    log "     OK en intento $i (localhost:${DEPLOY_PORT})"; HEALTH_OK=true; break
  fi
  RESP_INT=$(docker exec cotizar-api wget -qO- "http://localhost:3000/cotizar/health" 2>/dev/null || true)
  if echo "$RESP_INT" | grep -q '"status"'; then
    log "     OK interno en intento $i"; HEALTH_OK=true; break
  fi
  printf "."; sleep 5
done
echo ""
if [ "$HEALTH_OK" = false ]; then
  log "WARN: container tardando — logs:"
  docker logs cotizar-api --tail 15 2>/dev/null || true
fi

# ── 6. Nginx injection ────────────────────────────────────────────────────────
log "6/6 · Inyección nginx para /cotizar"
PROXY_BACKEND="cotizar-api:3000"

# Siempre forzar strip + re-inject (para que los cambios se apliquen)
inject_into_container() {
  local NGINX_CONTAINER="$1"
  log "     Contenedor nginx: $NGINX_CONTAINER"

  # Conectar cotizar-api a las redes del nginx
  NGINX_NETS=$(docker inspect "$NGINX_CONTAINER" \
    --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
  for NET in $NGINX_NETS; do
    docker network connect "$NET" cotizar-api 2>/dev/null && log "     cotizar-api → red $NET" || true
  done

  CONF_TMP=$(mktemp /tmp/nginx_cotizar_XXXXXX.conf)
  if docker cp "${NGINX_CONTAINER}:/etc/nginx/conf.d/default.conf" "$CONF_TMP" 2>/dev/null; then
    python3 "$REPO_DIR/scripts/nginx_strip.py" "$CONF_TMP" 2>/dev/null || true
    python3 "$REPO_DIR/scripts/nginx_inject.py" "$CONF_TMP" "$PROXY_BACKEND" 2>&1
    if docker cp "$CONF_TMP" "${NGINX_CONTAINER}:/etc/nginx/conf.d/default.conf" 2>/dev/null; then
      if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
        docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null
        log "     nginx recargado OK"
        rm -f "$CONF_TMP"
        return 0
      else
        log "     Config nginx inválida — restaurando"
        docker exec "$NGINX_CONTAINER" nginx -t 2>&1 | head -5 || true
      fi
    fi
    rm -f "$CONF_TMP"
  fi
  return 1
}

# Buscar nginx container
NGINX_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null \
  | grep -iE '(licitometro.*(nginx|web)|nginx.*licitometro)' | head -1 || true)
if [ -z "$NGINX_CONTAINER" ]; then
  NGINX_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
    | grep '0\.0\.0\.0:80' | awk '{print $1}' | head -1 || true)
fi

INJECTED=false
if [ -n "$NGINX_CONTAINER" ]; then
  inject_into_container "$NGINX_CONTAINER" && INJECTED=true
fi

# Fallback: nginx del host
if [ "$INJECTED" = false ] && command -v nginx &>/dev/null; then
  log "     Intentando nginx del host"
  VHOST_CONF=""
  for c in /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf \
            /etc/nginx/conf.d/licitometro.conf /etc/nginx/conf.d/licitometro.ar.conf \
            /etc/nginx/sites-available/default; do
    if [ -f "$c" ] && grep -qE "server_name|listen" "$c" 2>/dev/null; then
      VHOST_CONF="$c"; break
    fi
  done
  if [ -n "$VHOST_CONF" ]; then
    cp "$VHOST_CONF" "${VHOST_CONF}.bak"
    python3 "$REPO_DIR/scripts/nginx_strip.py" "$VHOST_CONF" 2>/dev/null || true
    if python3 "$REPO_DIR/scripts/nginx_inject.py" "$VHOST_CONF" "${DEPLOY_PORT}" 2>&1 \
        && nginx -t &>/dev/null; then
      nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
      log "     Host nginx recargado OK"
      INJECTED=true
    else
      cp "${VHOST_CONF}.bak" "$VHOST_CONF"
      nginx -s reload 2>/dev/null || true
      log "     WARN: config host inválida — restaurado backup"
    fi
  fi
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
sep
log "RESULTADO"
log "Container : $(docker inspect cotizar-api --format '{{.State.Status}}' 2>/dev/null || echo 'NO EXISTE')"
log "Direct    : $(curl -sf "http://localhost:${DEPLOY_PORT}/cotizar/health" 2>/dev/null || echo FAIL)"
log "Via proxy : $(curl -sf "http://127.0.0.1/cotizar/health" 2>/dev/null || echo FAIL)"
log "Nginx inj.: $INJECTED"
log "Redes     : $(docker inspect cotizar-api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || echo '?')"
sep

if [ "$HEALTH_OK" = true ]; then
  log "cotizAR restaurado. Verificá en: https://licitometro.ar/cotizar"
else
  log "WARN: el container no respondió al health check."
  log "      Revisá: docker logs cotizar-api"
fi

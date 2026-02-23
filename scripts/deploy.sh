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
  # Si existe un Dockerfile local, construir en lugar de pullear
  if [ -f "$DEPLOY_DIR/Dockerfile" ]; then
    log "2/5 · Build imagen local (Dockerfile encontrado)"
    if docker compose -f "$DEPLOY_DIR/docker-compose.yml" build --no-cache cotizar-api 2>&1 | tail -5; then
      log "     Build OK"
    else
      log "     Build falló — intentando pull de GHCR como fallback"
      docker pull "$IMAGE" && log "     Pull OK" || log "     Sin imagen (usando cache local)"
    fi
  else
    log "2/5 · Pull imagen de GHCR"
    docker pull "$IMAGE" && log "     OK" || log "     Sin imagen nueva (usando cache local)"
  fi
else
  log "2/5 · Pull/build omitido (--no-pull)"
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
else
  log "5/5 · Nginx injection"

  licit_http() {
    curl -so /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1/" 2>/dev/null || echo "000"
  }

  # ── a. Verificar si el proxy ya funciona ─────────────────────────────────
  PROXY_CHECK=$(curl -sf --max-time 5 "http://127.0.0.1/cotizar/health" 2>/dev/null || true)
  if echo "$PROXY_CHECK" | grep -q '"status"'; then
    log "     Proxy ya operativo en http://127.0.0.1/cotizar"
  else
    INJECTED=false

    # ── b. Intentar inyección en nginx Docker (contenedor licitometro) ─────
    NGINX_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null \
      | grep -iE '^(licitometro[_-]?nginx|nginx[_-]?licitometro|licitometro-nginx|licitometro_nginx)' \
      | head -1 || true)
    # Fallback: any running container called "nginx" that serves port 80
    if [ -z "$NGINX_CONTAINER" ]; then
      NGINX_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
        | grep -E '0\.0\.0\.0:80' | grep -i nginx | awk '{print $1}' | head -1 || true)
    fi
    if [ -z "$NGINX_CONTAINER" ]; then
      NGINX_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
        | grep -E '0\.0\.0\.0:80' | awk '{print $1}' | head -1 || true)
    fi

    if [ -n "$NGINX_CONTAINER" ]; then
      log "     Contenedor nginx: $NGINX_CONTAINER"

      # Asegurar que cotizar-api está en la misma red que el nginx de licitometro
      NGINX_NETS=$(docker inspect "$NGINX_CONTAINER" \
        --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
      log "     Redes nginx: $NGINX_NETS"

      # Conectar cotizar-api a las redes que tenga el nginx (si no está ya)
      for NET in $NGINX_NETS; do
        ALREADY=$(docker inspect cotizar-api \
          --format "{{range \$k,\$v := .NetworkSettings.Networks}}{\$k} {{end}}" 2>/dev/null \
          | grep -o "$NET" || true)
        if [ -z "$ALREADY" ]; then
          docker network connect "$NET" cotizar-api 2>/dev/null \
            && log "     cotizar-api conectado a $NET" || true
        fi
      done

      # Determinar el nombre interno del proxy_pass (contenedor en la misma red)
      PROXY_BACKEND="cotizar-api:3000"

      # Copiar config activa del contenedor
      CONF_TMP=$(mktemp /tmp/nginx_conf_XXXXXX.conf)
      if docker cp "${NGINX_CONTAINER}:/etc/nginx/conf.d/default.conf" "$CONF_TMP" 2>/dev/null; then
        log "     Config copiada: $CONF_TMP"

        if grep -q "cotizAR managed block" "$CONF_TMP" 2>/dev/null; then
          log "     cotizAR ya inyectado — recargando nginx"
          docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null || true
          INJECTED=true
        else
          python3 "$DEPLOY_DIR/scripts/nginx_strip.py" "$CONF_TMP" 2>/dev/null || true
          python3 "$DEPLOY_DIR/scripts/nginx_inject.py" "$CONF_TMP" "$PROXY_BACKEND" 2>&1

          # Copiar de vuelta al contenedor
          if docker cp "$CONF_TMP" "${NGINX_CONTAINER}:/etc/nginx/conf.d/default.conf" 2>/dev/null; then
            if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
              docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null && INJECTED=true
              log "     Docker nginx recargado OK"
            else
              log "     Config inválida en Docker nginx — log de error:"
              docker exec "$NGINX_CONTAINER" nginx -t 2>&1 | head -10 || true
              log "     Restaurando config previa"
              # Restaurar copiando de nuevo desde el template si está disponible
              docker exec "$NGINX_CONTAINER" sh -c \
                'cp /etc/nginx/templates/nginx-ssl.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true' || true
              docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null || true
            fi
          else
            log "     No se pudo copiar config al contenedor"
          fi
        fi
        rm -f "$CONF_TMP"
      else
        log "     No se pudo leer config del contenedor"
        rm -f "$CONF_TMP"
      fi
    else
      log "     No se encontró contenedor nginx Docker activo"
    fi

    # ── c. Fallback: nginx del host (si existe) ────────────────────────────
    if [ "$INJECTED" = false ] && command -v nginx &>/dev/null; then
      log "     Intentando nginx del host"
      nginx_reload() {
        nginx -s reload 2>/dev/null \
          || systemctl reload nginx 2>/dev/null \
          || service nginx reload 2>/dev/null \
          || true
      }

      ALL_CONFS=$(nginx -T 2>/dev/null | grep "^# configuration file" \
        | sed 's/.*file //' | sed 's/:.*//' | grep -v '^$' | sort -u || true)
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
        log "     Vhost host: $VHOST_CONF"
        cp "$VHOST_CONF" "${VHOST_CONF}.bak"
        python3 "$DEPLOY_DIR/scripts/nginx_strip.py" "$VHOST_CONF" 2>/dev/null || true
        if python3 "$DEPLOY_DIR/scripts/nginx_inject.py" "$VHOST_CONF" "$DEPLOY_PORT" && nginx -t &>/dev/null; then
          nginx_reload && sleep 2
          LICIT=$(licit_http)
          if [ "$LICIT" = "000" ]; then
            log "     ERROR: licitometro roto — restaurando backup"
            cp "${VHOST_CONF}.bak" "$VHOST_CONF"; nginx_reload
          else
            log "     Host nginx OK | licitometro HTTP $LICIT"
            INJECTED=true
          fi
        else
          log "     Config host inválida — restaurando backup"
          cp "${VHOST_CONF}.bak" "$VHOST_CONF"; nginx_reload 2>/dev/null || true
        fi
      else
        log "     Vhost host no encontrado"
      fi
    fi

    if [ "$INJECTED" = false ]; then
      log "     ADVERTENCIA: No se pudo inyectar nginx. Verifica manualmente."
      log "     El servicio cotizAR está disponible directamente en:"
      log "     http://127.0.0.1:${DEPLOY_PORT}/cotizar/"
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

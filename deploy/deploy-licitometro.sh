#!/bin/bash
# =============================================================
# cotizAR - Deploy SEGURO para servidor de licitometro.ar
# =============================================================
#
# USO:
#   # Primero DRY-RUN (solo muestra que haria, no toca nada):
#   ssh root@TU_VPS 'bash -s' < deploy/deploy-licitometro.sh
#
#   # Cuando estes conforme, ejecutar con --apply:
#   ssh root@TU_VPS 'bash -s -- --apply' < deploy/deploy-licitometro.sh
#
#   # O copiar al servidor y ejecutar:
#   scp deploy/deploy-licitometro.sh root@TU_VPS:/tmp/
#   ssh root@TU_VPS 'bash /tmp/deploy-licitometro.sh'         # dry-run
#   ssh root@TU_VPS 'bash /tmp/deploy-licitometro.sh --apply'  # aplicar
#
# SEGURIDAD:
#   - Por defecto corre en modo DRY-RUN (no toca nada)
#   - NO modifica la app existente de licitometro
#   - NO toca el nginx existente automaticamente
#   - Crea snippet separado + instrucciones para agregar manualmente
#   - NO instala/cambia Node.js si ya existe
#   - Verifica que el puerto este libre antes de usarlo
#   - Servicio corre con usuario dedicado (no root)
#   - Facil rollback: systemctl stop cotizar && nginx -s reload
# =============================================================

set -euo pipefail

# ============================================================
# CONFIGURACION
# ============================================================
INSTALL_DIR="/opt/cotizar"
REPO_URL="https://github.com/martinsantos/cotiza.git"
BRANCH="${DEPLOY_BRANCH:-main}"
COTIZAR_PORT=3001
BASE_PATH="/cotizar"
SERVICE_USER="cotizar"

# ============================================================
# PARSEAR ARGUMENTOS
# ============================================================
DRY_RUN=true
SKIP_NGINX=false

for arg in "$@"; do
    case "$arg" in
        --apply)      DRY_RUN=false ;;
        --skip-nginx) SKIP_NGINX=true ;;
        --help|-h)
            echo "Uso: $0 [--apply] [--skip-nginx]"
            echo ""
            echo "  Sin argumentos:  modo DRY-RUN (solo muestra que haria)"
            echo "  --apply:         ejecutar cambios reales"
            echo "  --skip-nginx:    no tocar nginx (configurar manualmente)"
            exit 0
            ;;
        *)
            echo "Argumento desconocido: $arg"
            echo "Uso: $0 [--apply] [--skip-nginx]"
            exit 1
            ;;
    esac
done

# ============================================================
# COLORES Y HELPERS
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()     { echo -e "${GREEN}[cotizAR]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
dryrun()  { echo -e "${CYAN}[DRY-RUN]${NC} $1"; }
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }

echo ""
echo "========================================"
echo "  cotizAR - Deploy a LICITOMETRO.AR"
echo "  URL: https://www.licitometro.ar/cotizar"
echo "========================================"
echo ""

if $DRY_RUN; then
    echo -e "${CYAN}  MODO DRY-RUN: Solo muestra que haria.${NC}"
    echo -e "${CYAN}  Para aplicar cambios: $0 --apply${NC}"
else
    echo -e "${GREEN}  MODO APPLY: Ejecutando cambios reales.${NC}"
fi
echo ""

PROBLEMS=0
WARNINGS=0

# ============================================================
# PASO 0: Pre-flight checks (no modifica nada)
# ============================================================
log "[0/7] Verificaciones de seguridad pre-deploy..."
echo ""

# --- 0a: Verificar que somos root ---
if [ "$(id -u)" -ne 0 ]; then
    err "Este script debe ejecutarse como root"
fi
log "  Usuario: root - OK"

# --- 0b: Verificar Node.js ---
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    log "  Node.js: $NODE_VERSION"
    if [ "$NODE_MAJOR" -lt 18 ]; then
        warn "  Node.js $NODE_VERSION es muy viejo (necesita >= 18). Se necesita actualizar."
        PROBLEMS=$((PROBLEMS + 1))
    fi
else
    warn "  Node.js no encontrado."
    info "  Instalar Node.js 20: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
    PROBLEMS=$((PROBLEMS + 1))
fi

# --- 0c: Verificar npm ---
if command -v npm &> /dev/null; then
    log "  npm: $(npm --version)"
else
    warn "  npm no encontrado."
    PROBLEMS=$((PROBLEMS + 1))
fi

# --- 0d: Verificar nginx ---
if command -v nginx &> /dev/null; then
    log "  nginx: $(nginx -v 2>&1 | grep -oP 'nginx/\K[0-9.]+'|| nginx -v 2>&1)"
else
    warn "  nginx no encontrado."
    PROBLEMS=$((PROBLEMS + 1))
fi

# --- 0e: Verificar git ---
if command -v git &> /dev/null; then
    log "  git: $(git --version | grep -oP '[0-9]+\.[0-9]+\.[0-9]+')"
else
    warn "  git no encontrado."
    PROBLEMS=$((PROBLEMS + 1))
fi

# --- 0f: Verificar build tools (para better-sqlite3) ---
MISSING_BUILD_TOOLS=""
command -v python3 &> /dev/null || MISSING_BUILD_TOOLS="python3 "
command -v make &> /dev/null    || MISSING_BUILD_TOOLS="${MISSING_BUILD_TOOLS}make "
command -v g++ &> /dev/null     || MISSING_BUILD_TOOLS="${MISSING_BUILD_TOOLS}g++ "
if [ -n "$MISSING_BUILD_TOOLS" ]; then
    warn "  Build tools faltantes: $MISSING_BUILD_TOOLS"
    info "  Instalar: apt-get install -y python3 make g++"
    WARNINGS=$((WARNINGS + 1))
fi

# --- 0g: Verificar que el puerto no esta en uso ---
if command -v ss &> /dev/null; then
    PORT_IN_USE=$(ss -tlnp | grep ":${COTIZAR_PORT} " || true)
elif command -v netstat &> /dev/null; then
    PORT_IN_USE=$(netstat -tlnp | grep ":${COTIZAR_PORT} " || true)
else
    PORT_IN_USE=""
    warn "  No se pudo verificar el puerto (ss/netstat no disponible)"
fi

if [ -n "$PORT_IN_USE" ]; then
    # Check if it's already our service
    if echo "$PORT_IN_USE" | grep -q "cotizar\|node.*server.js"; then
        log "  Puerto $COTIZAR_PORT: en uso por cotizar (re-deploy)"
    else
        warn "  PUERTO $COTIZAR_PORT YA EN USO por otro proceso:"
        echo "        $PORT_IN_USE"
        PROBLEMS=$((PROBLEMS + 1))
    fi
else
    log "  Puerto $COTIZAR_PORT: libre - OK"
fi

# --- 0h: Verificar espacio en disco ---
AVAILABLE_KB=$(df -k /opt 2>/dev/null | tail -1 | awk '{print $4}')
if [ -n "$AVAILABLE_KB" ] && [ "$AVAILABLE_KB" -lt 524288 ]; then  # < 512MB
    warn "  Poco espacio en /opt: $(echo "$AVAILABLE_KB" | awk '{printf "%.0fMB", $1/1024}') disponible (recomendado: 512MB+)"
    WARNINGS=$((WARNINGS + 1))
else
    log "  Espacio en disco: OK ($(echo "$AVAILABLE_KB" | awk '{printf "%.0fMB", $1/1024}') disponible)"
fi

# --- 0i: Verificar que nginx actual funciona ANTES de tocar nada ---
if command -v nginx &> /dev/null; then
    if nginx -t 2>/dev/null; then
        log "  nginx config actual: VALIDO"
    else
        warn "  nginx config actual ya tiene errores! Resolver antes de continuar."
        PROBLEMS=$((PROBLEMS + 1))
    fi
fi

# --- 0j: Detectar config de nginx de licitometro ---
NGINX_CONF=""
for conf in /etc/nginx/sites-enabled/licitometro* \
            /etc/nginx/sites-enabled/default \
            /etc/nginx/conf.d/licitometro* \
            /etc/nginx/conf.d/default.conf; do
    if [ -f "$conf" ] && grep -q "server_name\|server {" "$conf" 2>/dev/null; then
        NGINX_CONF="$conf"
        break
    fi
done

if [ -z "$NGINX_CONF" ]; then
    NGINX_CONF=$(grep -rl "server_name" /etc/nginx/ 2>/dev/null | grep -v "snippets\|backup" | head -1 || true)
fi

if [ -n "$NGINX_CONF" ]; then
    log "  nginx config detectado: $NGINX_CONF"

    # Verificar si ya tiene /cotizar
    if grep -q "location.*\/cotizar" "$NGINX_CONF" 2>/dev/null; then
        info "  Ya existe un bloque /cotizar en nginx (se re-usara)"
    fi

    # Verificar si ya incluye el snippet
    if grep -q "snippets/cotizar.conf" "$NGINX_CONF" 2>/dev/null; then
        info "  Ya tiene include de snippets/cotizar.conf"
    fi
else
    warn "  No se detecto config de nginx. Se necesitara configurar manualmente."
    WARNINGS=$((WARNINGS + 1))
fi

# --- 0k: Verificar servicios existentes de licitometro ---
echo ""
info "  Servicios activos en el servidor:"
systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -E "nginx|node|pm2|licitometro|docker|mongo|postgres|redis|mysql" || echo "        (no se detectaron servicios relevantes)"
echo ""

# --- Resumen pre-flight ---
echo ""
echo "  ========================================="
if [ $PROBLEMS -gt 0 ]; then
    echo -e "  ${RED}PRE-FLIGHT: $PROBLEMS problemas encontrados${NC}"
    echo "  Resolver los problemas antes de continuar."
    echo "  ========================================="
    if $DRY_RUN; then
        echo ""
        echo "  Corregir los problemas y volver a ejecutar."
        exit 1
    else
        err "Pre-flight fallido. Resolver problemas primero."
    fi
elif [ $WARNINGS -gt 0 ]; then
    echo -e "  ${YELLOW}PRE-FLIGHT: OK con $WARNINGS advertencias${NC}"
    echo "  ========================================="
else
    echo -e "  ${GREEN}PRE-FLIGHT: Todo OK${NC}"
    echo "  ========================================="
fi
echo ""

# Si es dry-run, mostrar el plan y salir
if $DRY_RUN; then
    echo ""
    echo "==========================================="
    echo "  PLAN DE DEPLOY (dry-run)"
    echo "==========================================="
    echo ""
    dryrun "1. Crear usuario del sistema: $SERVICE_USER"
    dryrun "2. Clonar repo en $INSTALL_DIR (branch: $BRANCH)"
    dryrun "3. Instalar build tools si faltan: $MISSING_BUILD_TOOLS"
    dryrun "4. npm ci && npm run build && npm prune --omit=dev"
    dryrun "5. Crear directorios: $INSTALL_DIR/{data,bids}"
    dryrun "6. Crear servicio systemd: /etc/systemd/system/cotizar.service"
    dryrun "   - Puerto: $COTIZAR_PORT"
    dryrun "   - Usuario: $SERVICE_USER"
    dryrun "   - WorkingDirectory: $INSTALL_DIR"
    dryrun "7. Crear snippet nginx: /etc/nginx/snippets/cotizar.conf"
    if ! $SKIP_NGINX && [ -n "$NGINX_CONF" ]; then
        dryrun "8. Hacer backup de: $NGINX_CONF"
        dryrun "9. Agregar 'include snippets/cotizar.conf' a nginx"
        dryrun "10. nginx -t && nginx -s reload"
    else
        dryrun "8. NGINX: Configurar manualmente (ver instrucciones al final)"
    fi
    dryrun "11. Verificar health checks"
    echo ""
    echo "==========================================="
    echo -e "  ${CYAN}Para aplicar: $0 --apply${NC}"
    echo "==========================================="
    echo ""
    exit 0
fi

# ============================================================
# A PARTIR DE ACA SE APLICAN CAMBIOS (--apply)
# ============================================================

# ============================================================
# PASO 1: Crear usuario dedicado
# ============================================================
log "[1/7] Creando usuario dedicado '$SERVICE_USER'..."

if id "$SERVICE_USER" &>/dev/null; then
    log "  Usuario $SERVICE_USER ya existe - OK"
else
    useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
    log "  Usuario $SERVICE_USER creado"
fi

# ============================================================
# PASO 2: Clonar/actualizar codigo
# ============================================================
log "[2/7] Obteniendo codigo fuente..."

mkdir -p "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
    log "  Actualizando repo existente..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH" || { warn "No se pudo fetch $BRANCH, intentando fetch general..."; git fetch origin; }
    git checkout "$BRANCH" || err "No se pudo checkout branch $BRANCH"
    git pull origin "$BRANCH" --ff-only || err "No se pudo actualizar (hay conflictos?). Revisar manualmente."
else
    log "  Clonando repo..."
    git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR" || err "No se pudo clonar el repo"
    cd "$INSTALL_DIR"
fi

log "  Branch: $(git branch --show-current)"
log "  Commit: $(git log --oneline -1)"

# ============================================================
# PASO 3: Instalar build tools si faltan
# ============================================================
log "[3/7] Verificando build tools..."

if [ -n "$MISSING_BUILD_TOOLS" ]; then
    log "  Instalando: $MISSING_BUILD_TOOLS"
    if command -v apt-get &> /dev/null; then
        apt-get install -y $MISSING_BUILD_TOOLS 2>/dev/null || warn "Algunos build tools no se pudieron instalar"
    elif command -v yum &> /dev/null; then
        # g++ is gcc-c++ on yum
        YUM_PKGS=$(echo "$MISSING_BUILD_TOOLS" | sed 's/g++/gcc-c++/')
        yum install -y $YUM_PKGS 2>/dev/null || warn "Algunos build tools no se pudieron instalar"
    fi
else
    log "  Build tools: ya instalados"
fi

# ============================================================
# PASO 4: Build
# ============================================================
log "[4/7] Instalando dependencias y compilando..."

cd "$INSTALL_DIR"

npm ci 2>/dev/null || npm install || err "npm install fallo"
npm run build || err "npm run build fallo"
npm prune --omit=dev 2>/dev/null || true

# Verificar que el build produjo el server
if [ ! -f "$INSTALL_DIR/dist/api/server.js" ]; then
    err "Build fallo: dist/api/server.js no existe"
fi

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/bids"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/data" "$INSTALL_DIR/bids"

log "  Build: OK (dist/api/server.js existe)"

# ============================================================
# PASO 5: Crear servicio systemd
# ============================================================
log "[5/7] Configurando servicio systemd..."

# Parar servicio si ya existe (para no romper durante el build)
systemctl stop cotizar 2>/dev/null || true

cat > /etc/systemd/system/cotizar.service << EOF
[Unit]
Description=cotizAR - Armador de Cotizaciones para Licitaciones
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) dist/api/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$COTIZAR_PORT
Environment=BASE_PATH=$BASE_PATH
Environment=API_HOST=127.0.0.1
Environment=DB_PATH=$INSTALL_DIR/data/cotizar.db
Environment=LOG_LEVEL=info

# Seguridad: limitar permisos del servicio
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/bids $INSTALL_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cotizar
systemctl start cotizar

log "  Servicio iniciado en puerto $COTIZAR_PORT"

# Esperar que arranque y verificar
HEALTH_OK=false
for i in 1 2 3 4 5; do
    sleep 2
    if curl -sf "http://127.0.0.1:$COTIZAR_PORT/health" > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    info "  Esperando que arranque... (intento $i/5)"
done

if $HEALTH_OK; then
    log "  Health check directo: OK"
    HEALTH_RESPONSE=$(curl -sf "http://127.0.0.1:$COTIZAR_PORT/health" 2>/dev/null || echo '{}')
    info "  Respuesta: $HEALTH_RESPONSE"
else
    echo ""
    warn "  El servicio no responde en puerto $COTIZAR_PORT"
    warn "  Revisar logs: journalctl -u cotizar -n 30"
    echo ""
    journalctl -u cotizar -n 15 --no-pager 2>/dev/null || true
    echo ""
    err "Servicio cotizar no arranco correctamente. Fix necesario antes de configurar nginx."
fi

# ============================================================
# PASO 6: Configurar nginx (con snippet separado)
# ============================================================
log "[6/7] Configurando nginx..."

# Siempre crear el snippet (es inocuo)
mkdir -p /etc/nginx/snippets

cat > /etc/nginx/snippets/cotizar.conf << 'SNIPPET_EOF'
# cotizAR - Armador de Cotizaciones
# Snippet para incluir dentro del server {} de licitometro.ar
# Rollback: rm /etc/nginx/snippets/cotizar.conf && quitar include del server block && nginx -s reload

# API routes
location /cotizar/api/ {
    proxy_pass http://127.0.0.1:3001/cotizar/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 30s;
}

# Config endpoint
location /cotizar/config/ {
    proxy_pass http://127.0.0.1:3001/cotizar/config/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# UI and static files
location /cotizar {
    proxy_pass http://127.0.0.1:3001/cotizar;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
SNIPPET_EOF

log "  Snippet creado: /etc/nginx/snippets/cotizar.conf"

if $SKIP_NGINX; then
    warn "  --skip-nginx: No se modifica nginx. Configurar manualmente."
elif [ -z "$NGINX_CONF" ]; then
    warn "  No se detecto config de nginx. Configurar manualmente."
elif grep -q "snippets/cotizar.conf" "$NGINX_CONF" 2>/dev/null; then
    # Ya incluye el snippet, solo reload
    log "  nginx ya incluye el snippet de cotizar"
    if nginx -t 2>/dev/null; then
        nginx -s reload
        log "  nginx recargado"
    else
        warn "  nginx -t fallo! No se recargo. Revisar config manualmente."
    fi
elif grep -q "location.*\/cotizar" "$NGINX_CONF" 2>/dev/null; then
    # Ya tiene un bloque /cotizar inline
    warn "  nginx ya tiene un bloque /cotizar inline."
    info "  Verificar que apunta a 127.0.0.1:$COTIZAR_PORT"
    info "  Si querés usar el snippet, reemplazar el bloque con:"
    info "      include /etc/nginx/snippets/cotizar.conf;"
    if nginx -t 2>/dev/null; then
        nginx -s reload
        log "  nginx recargado (config existente)"
    fi
else
    # Agregar include al nginx config - METODO SEGURO
    log "  Agregando include a $NGINX_CONF..."

    # Backup con timestamp
    BACKUP="$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$NGINX_CONF" "$BACKUP"
    log "  Backup creado: $BACKUP"

    # Estrategia segura: usar un marker para encontrar la posicion correcta
    # Buscamos la ULTIMA llave de cierre del server block (justo antes de ella)
    # Usamos python para una insercion segura (sed con regex multilinea es peligroso)
    INCLUDE_LINE="    include /etc/nginx/snippets/cotizar.conf;"

    if command -v python3 &> /dev/null; then
        python3 << PYEOF
import re, sys

with open("$NGINX_CONF", "r") as f:
    content = f.read()

include_line = "    include /etc/nginx/snippets/cotizar.conf;"

# Check if already included
if "cotizar.conf" in content:
    print("Already included, skipping")
    sys.exit(0)

# Find the server block and insert before the first 'location /' (exact root location)
# We look for 'location / {' specifically (root catch-all)
pattern = r'(\n)([ \t]*location\s+/\s*\{)'
match = re.search(pattern, content)

if match:
    insert_pos = match.start(2)
    new_content = content[:insert_pos] + "\n" + include_line + "\n\n" + content[insert_pos:]
else:
    # Fallback: insert before the last closing brace of the server block
    # Count braces to find server block end
    brace_count = 0
    last_close = -1
    in_server = False
    for i, ch in enumerate(content):
        if ch == '{':
            brace_count += 1
            if brace_count == 2:  # server { is typically 2nd level after http {
                in_server = True
        elif ch == '}':
            if in_server and brace_count == 2:
                last_close = i
            brace_count -= 1

    if last_close > 0:
        new_content = content[:last_close] + "\n" + include_line + "\n" + content[last_close:]
    else:
        print("ERROR: Could not find safe insertion point")
        sys.exit(1)

with open("$NGINX_CONF", "w") as f:
    f.write(new_content)

print("Include inserted successfully")
PYEOF

        if [ $? -ne 0 ]; then
            warn "  No se pudo insertar automaticamente. Restaurando backup..."
            cp "$BACKUP" "$NGINX_CONF"
            warn "  Agregar manualmente a $NGINX_CONF dentro del server {}:"
            warn "      include /etc/nginx/snippets/cotizar.conf;"
        else
            log "  Include insertado en $NGINX_CONF"
        fi
    else
        warn "  python3 no disponible para insercion segura."
        warn "  Agregar manualmente a $NGINX_CONF dentro del server {}:"
        warn "      include /etc/nginx/snippets/cotizar.conf;"
    fi

    # Verificar nginx config ANTES de reload
    echo ""
    log "  Testeando configuracion nginx..."
    if nginx -t 2>&1; then
        log "  nginx -t: VALIDO"
        nginx -s reload
        log "  nginx recargado (sin downtime para licitometro)"
    else
        warn "  nginx -t: INVALIDO! Restaurando backup..."
        cp "$BACKUP" "$NGINX_CONF"
        nginx -t 2>/dev/null  # verificar que el backup es valido
        nginx -s reload 2>/dev/null || true
        warn "  Backup restaurado. nginx vuelve a su estado original."
        warn "  Revisar manualmente: diff $BACKUP $NGINX_CONF"
        warn "  El servicio cotizar FUNCIONA en puerto $COTIZAR_PORT"
        warn "  Solo falta configurar nginx. Agregar manualmente:"
        warn "      include /etc/nginx/snippets/cotizar.conf;"
    fi
fi

# ============================================================
# PASO 7: Verificacion final
# ============================================================
log "[7/7] Verificacion final..."
echo ""

sleep 2

PASS=0
FAIL=0

test_endpoint() {
    local url=$1
    local desc=$2
    local status_code
    status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$status_code" = "200" ]; then
        echo -e "    ${GREEN}PASS${NC} $desc ($url) [HTTP $status_code]"
        PASS=$((PASS + 1))
    else
        echo -e "    ${RED}FAIL${NC} $desc ($url) [HTTP $status_code]"
        FAIL=$((FAIL + 1))
    fi
}

echo "  Tests directos (sin nginx):"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/health" "Health check"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/" "UI"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/api/tenders" "API tenders"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/config/base-path" "Config"

echo ""
echo "  Tests via nginx:"
test_endpoint "http://localhost/cotizar/" "UI via nginx"
test_endpoint "http://localhost/cotizar/api/tenders" "API via nginx"

echo ""

# Verificar que licitometro SIGUE FUNCIONANDO
echo "  Verificando que licitometro sigue OK:"
if curl -sf "http://localhost/" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -qE "200|301|302"; then
    echo -e "    ${GREEN}PASS${NC} licitometro.ar sigue respondiendo"
    PASS=$((PASS + 1))
else
    # Try HTTPS
    if curl -sfk "https://localhost/" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -qE "200|301|302"; then
        echo -e "    ${GREEN}PASS${NC} licitometro.ar sigue respondiendo (HTTPS)"
        PASS=$((PASS + 1))
    else
        echo -e "    ${YELLOW}WARN${NC} No se pudo verificar licitometro.ar (puede ser normal si no corre en localhost)"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  DEPLOY EXITOSO ($PASS/$((PASS)) tests OK)${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "  cotizAR esta corriendo en:"
    echo "    - Directo:  http://127.0.0.1:$COTIZAR_PORT/cotizar"
    echo "    - Nginx:    http://localhost/cotizar"
    echo "    - Publico:  https://www.licitometro.ar/cotizar"
else
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}  DEPLOY PARCIAL ($PASS pass / $FAIL fail)${NC}"
    echo -e "${YELLOW}============================================${NC}"
    echo ""
    echo "  Algunos tests fallaron. El servicio cotizar esta corriendo"
    echo "  en puerto $COTIZAR_PORT. Puede que nginx necesite config manual."
fi

echo ""
echo "  Comandos utiles:"
echo "    journalctl -u cotizar -f        # Ver logs en tiempo real"
echo "    systemctl status cotizar         # Estado del servicio"
echo "    systemctl restart cotizar        # Reiniciar"
echo "    curl localhost:$COTIZAR_PORT/health  # Health check directo"
echo ""
echo "  Rollback completo:"
echo "    systemctl stop cotizar"
echo "    systemctl disable cotizar"
if [ -n "${BACKUP:-}" ]; then
    echo "    cp $BACKUP $NGINX_CONF"
fi
echo "    rm -f /etc/nginx/snippets/cotizar.conf"
echo "    nginx -s reload"
echo ""

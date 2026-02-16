#!/bin/bash
# =============================================================
# cotizAR - Deploy SEGURO para servidor de licitometro.ar
# =============================================================
#
# USO: Ejecutar desde tu maquina local:
#   ssh root@76.13.234.213 'bash -s' < deploy/deploy-licitometro.sh
#
# O copiar al servidor y ejecutar:
#   scp deploy/deploy-licitometro.sh root@76.13.234.213:/tmp/
#   ssh root@76.13.234.213 'bash /tmp/deploy-licitometro.sh'
#
# SEGURIDAD:
#   - NO modifica la app existente de licitometro
#   - Hace backup de nginx antes de tocar
#   - Solo agrega un location block para /cotizar
#   - Facil rollback: systemctl stop cotizar && nginx -s reload
# =============================================================

set -euo pipefail

INSTALL_DIR="/opt/cotizar"
REPO_URL="https://github.com/martinsantos/cotiza.git"
BRANCH="claude/improve-cotizar-cli-Jczk1"
COTIZAR_PORT=3001
BASE_PATH="/cotizar"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[cotizAR]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "========================================"
echo "  cotizAR - Deploy a LICITOMETRO.AR"
echo "  URL: https://www.licitometro.ar/cotizar"
echo "========================================"
echo ""
echo "  MODO SEGURO: No toca la app existente"
echo ""

# ============================================================
# PASO 0: Verificar prerequisitos
# ============================================================
log "[0/6] Verificando prerequisitos..."

# Necesitamos Node.js (preferimos node directo, sin Docker para simplificar)
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log "  Node.js: $NODE_VERSION"
else
    log "  Instalando Node.js 20..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    else
        err "No se puede instalar Node.js automaticamente. Instalar manualmente."
    fi
fi

if ! command -v npm &> /dev/null; then
    err "npm no encontrado. Instalar Node.js primero."
fi

if ! command -v nginx &> /dev/null; then
    err "nginx no encontrado. Este script espera nginx en el servidor."
fi

if ! command -v git &> /dev/null; then
    apt-get install -y git 2>/dev/null || yum install -y git 2>/dev/null || err "git no encontrado"
fi

log "  nginx: $(nginx -v 2>&1 | head -1)"
log "  git: $(git --version)"
echo ""

# ============================================================
# PASO 1: Clonar/actualizar codigo
# ============================================================
log "[1/6] Obteniendo codigo fuente..."

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ -d ".git" ]; then
    log "  Actualizando repo existente..."
    git fetch origin "$BRANCH" 2>/dev/null || git fetch origin
    git checkout "$BRANCH" 2>/dev/null || git checkout main 2>/dev/null || git checkout master
    git pull --ff-only || true
else
    log "  Clonando repo..."
    git clone -b "$BRANCH" "$REPO_URL" . 2>/dev/null || git clone "$REPO_URL" .
fi

log "  Commit: $(git log --oneline -1)"

# ============================================================
# PASO 2: Instalar dependencias y build
# ============================================================
log "[2/6] Instalando dependencias y compilando..."

npm ci --omit=dev 2>/dev/null || npm install --omit=dev
npm run build

log "  Build completado: $(ls -la dist/api/server.js 2>/dev/null && echo 'OK' || echo 'FALLO')"

# ============================================================
# PASO 3: Crear servicio systemd
# ============================================================
log "[3/6] Configurando servicio systemd..."

cat > /etc/systemd/system/cotizar.service << 'SYSTEMD_EOF'
[Unit]
Description=cotizAR - Armador de Cotizaciones para Licitaciones
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cotizar
ExecStart=/usr/bin/node dist/api/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=BASE_PATH=/cotizar
Environment=API_HOST=127.0.0.1

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/cotizar/bids /opt/cotizar/data

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

# Crear directorios de datos
mkdir -p "$INSTALL_DIR/bids" "$INSTALL_DIR/data"

systemctl daemon-reload
systemctl enable cotizar
systemctl restart cotizar

log "  Servicio iniciado en puerto $COTIZAR_PORT"

# Esperar que arranque
sleep 3
if curl -sf "http://127.0.0.1:$COTIZAR_PORT/health" > /dev/null 2>&1; then
    log "  Health check: OK"
else
    warn "  Esperando mas tiempo..."
    sleep 5
    if curl -sf "http://127.0.0.1:$COTIZAR_PORT/health" > /dev/null 2>&1; then
        log "  Health check: OK (tardó un poco)"
    else
        err "El servicio no responde en puerto $COTIZAR_PORT. Revisar: journalctl -u cotizar -n 50"
    fi
fi

# ============================================================
# PASO 4: Backup de nginx actual
# ============================================================
log "[4/6] Haciendo backup de nginx..."

NGINX_CONF=""
# Buscar el config principal de licitometro
for conf in /etc/nginx/sites-enabled/licitometro* /etc/nginx/sites-enabled/default /etc/nginx/conf.d/licitometro* /etc/nginx/conf.d/default.conf /etc/nginx/nginx.conf; do
    if [ -f "$conf" ] && grep -q "licitometro\|server_name" "$conf" 2>/dev/null; then
        NGINX_CONF="$conf"
        break
    fi
done

if [ -z "$NGINX_CONF" ]; then
    # Buscar cualquier config con server_name
    NGINX_CONF=$(grep -rl "server_name" /etc/nginx/ 2>/dev/null | head -1)
fi

if [ -z "$NGINX_CONF" ]; then
    err "No se encontro configuracion nginx. Agregar manualmente el snippet de deploy/nginx-snippet.conf"
fi

log "  Config encontrado: $NGINX_CONF"
BACKUP="$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_CONF" "$BACKUP"
log "  Backup: $BACKUP"

# ============================================================
# PASO 5: Agregar location /cotizar a nginx
# ============================================================
log "[5/6] Configurando nginx para /cotizar..."

# Verificar si ya tiene /cotizar configurado
if grep -q "location.*\/cotizar" "$NGINX_CONF" 2>/dev/null; then
    warn "  nginx ya tiene un bloque /cotizar - actualizando..."
    # Remover bloque existente (sera reemplazado)
    # Por seguridad, no hacemos sed complicado - el admin lo revisa
    log "  ATENCION: Ya existe config de /cotizar en nginx."
    log "  Verificar que apunta a 127.0.0.1:$COTIZAR_PORT"
else
    log "  Agregando location /cotizar..."

    # Insertar antes del ultimo } del server block
    # Estrategia: buscar el primer "location /" (catch-all del SPA) e insertar antes
    COTIZAR_BLOCK="
    # --- cotizAR: Armador de Cotizaciones (auto-deployed) ---
    location /cotizar/api/ {
        proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
    }

    location /cotizar/config/ {
        proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar/config/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
    }

    location /cotizar {
        proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
    # --- fin cotizAR ---"

    # Crear archivo de snippet separado (mas seguro)
    SNIPPET_FILE="/etc/nginx/snippets/cotizar.conf"
    mkdir -p /etc/nginx/snippets
    cat > "$SNIPPET_FILE" << SNIPPET_EOF
# cotizAR - Armador de Cotizaciones
# Generado automaticamente - $(date)
# Rollback: rm $SNIPPET_FILE && nginx -s reload

location /cotizar/api/ {
    proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;
}

location /cotizar/config/ {
    proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar/config/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
}

location /cotizar {
    proxy_pass http://127.0.0.1:${COTIZAR_PORT}/cotizar;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
SNIPPET_EOF

    log "  Snippet creado: $SNIPPET_FILE"

    # Intentar incluir el snippet en el server block
    if grep -q "include.*snippets" "$NGINX_CONF" 2>/dev/null; then
        log "  nginx ya usa snippets - agregando include..."
    fi

    # Insertar "include /etc/nginx/snippets/cotizar.conf;" antes de la primera "location /"
    if grep -q "location.*/" "$NGINX_CONF"; then
        # Insertar antes del primer location /
        sed -i "0,/location.*\//s||    include /etc/nginx/snippets/cotizar.conf;\n\n    location /|" "$NGINX_CONF"
        log "  Include agregado a $NGINX_CONF"
    else
        warn "  No se encontro location block. Agregar manualmente:"
        warn "  include /etc/nginx/snippets/cotizar.conf;"
    fi
fi

# Test nginx config
log "  Testeando configuracion nginx..."
if nginx -t 2>&1; then
    log "  nginx -t: OK"
else
    err "nginx config invalido! Restaurando backup..."
    cp "$BACKUP" "$NGINX_CONF"
    nginx -t
    err "Restaurado a backup. Revisar manualmente el snippet."
fi

# Reload nginx (sin downtime)
nginx -s reload
log "  nginx recargado (sin downtime)"

# ============================================================
# PASO 6: Verificacion final
# ============================================================
log "[6/6] Verificacion final..."

sleep 2

echo ""
echo "  Testeando endpoints..."

PASS=0
FAIL=0

test_endpoint() {
    local url=$1
    local desc=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        echo -e "    ${GREEN}PASS${NC} $desc ($url)"
        PASS=$((PASS + 1))
    else
        echo -e "    ${RED}FAIL${NC} $desc ($url)"
        FAIL=$((FAIL + 1))
    fi
}

test_endpoint "http://127.0.0.1:$COTIZAR_PORT/health" "Health check directo"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/" "UI directo"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/api/tenders" "API tenders directo"
test_endpoint "http://127.0.0.1:$COTIZAR_PORT/cotizar/config/base-path" "Config directo"
test_endpoint "http://localhost/cotizar/" "UI via nginx"
test_endpoint "http://localhost/cotizar/api/tenders" "API tenders via nginx"

echo ""

if [ $FAIL -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================"
    echo "  DEPLOY EXITOSO"
    echo "========================================${NC}"
    echo ""
    echo "  cotizAR esta corriendo en:"
    echo "    - Interno:  http://127.0.0.1:$COTIZAR_PORT/cotizar"
    echo "    - Nginx:    http://localhost/cotizar"
    echo "    - Publico:  https://www.licitometro.ar/cotizar"
    echo ""
    echo "  Comandos utiles:"
    echo "    - Logs:       journalctl -u cotizar -f"
    echo "    - Restart:    systemctl restart cotizar"
    echo "    - Status:     systemctl status cotizar"
    echo "    - Stop:       systemctl stop cotizar"
    echo ""
    echo "  Rollback (si algo sale mal):"
    echo "    cp $BACKUP $NGINX_CONF"
    echo "    nginx -s reload"
    echo "    systemctl stop cotizar"
    echo ""
else
    echo ""
    echo -e "${YELLOW}========================================"
    echo "  DEPLOY PARCIAL ($PASS pass / $FAIL fail)"
    echo "========================================${NC}"
    echo ""
    echo "  El servicio esta corriendo pero algunos tests fallaron."
    echo "  Revisar:"
    echo "    journalctl -u cotizar -n 50"
    echo "    nginx -t"
    echo "    cat $NGINX_CONF"
    echo ""
fi

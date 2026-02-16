#!/bin/bash
# =============================================================
# cotizAR - Script de setup para servidor de licitometro.ar
# Ejecutar en el servidor: bash setup.sh
# =============================================================

set -e

INSTALL_DIR="/opt/cotizar"
REPO_URL="https://github.com/martinsantos/cotiza.git"

echo "======================================"
echo "  cotizAR - Setup para LICITOMETRO.AR"
echo "  Deploy en: www.licitometro.ar/cotizar"
echo "======================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker no esta instalado. Instalar Docker primero."
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "ERROR: docker-compose no esta instalado."
    exit 1
fi

# Create install directory
echo "[1/5] Creando directorio de instalacion..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Clone or pull repo
echo "[2/5] Obteniendo codigo fuente..."
if [ -d ".git" ]; then
    git pull origin master
else
    git clone "$REPO_URL" .
fi

# Create .env if not exists
echo "[3/5] Configurando variables de entorno..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo "IMPORTANTE: Editar .env con los datos reales:"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
    echo "Variables criticas a configurar:"
    echo "  - LICITOMETRO_API_KEY"
    echo "  - COMPANY_NAME"
    echo "  - COMPANY_TAX_ID"
    echo ""
fi

# Build and start
echo "[4/5] Construyendo y levantando servicios..."
docker build -t cotizar-api:latest .

cd deploy
docker-compose -f docker-compose.prod.yml up -d

echo "[5/5] Verificando salud del servicio..."
sleep 5
for i in $(seq 1 12); do
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo ""
        echo "======================================"
        echo "  DEPLOY EXITOSO"
        echo "======================================"
        echo ""
        echo "  cotizAR esta corriendo en:"
        echo "    - Local:  http://localhost:3000/cotizar"
        echo "    - Web:    https://www.licitometro.ar/cotizar"
        echo ""
        echo "  Healthcheck: http://localhost:3000/health"
        echo "  Logs:        docker logs cotizar-api -f"
        echo ""
        echo "  Para configurar nginx en licitometro.ar:"
        echo "    Copiar el bloque 'location /cotizar' de nginx.conf"
        echo "    al nginx principal de licitometro.ar"
        echo ""
        exit 0
    fi
    echo "  Esperando... ($i/12)"
    sleep 5
done

echo "ERROR: El servicio no responde. Revisar logs:"
echo "  docker logs cotizar-api"
exit 1

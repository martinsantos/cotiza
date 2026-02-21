#!/usr/bin/env bash
# Instala el GitHub Actions self-hosted runner en el VPS
# Uso: bash /opt/cotizar/scripts/setup-runner.sh <TOKEN>
#
# El TOKEN se obtiene en:
#   GitHub → repo → Settings → Actions → Runners → New self-hosted runner
#   (Linux x64, copiar el token del paso ./config.sh)

set -euo pipefail

REPO="martinsantos/cotiza"
RUNNER_DIR="/opt/actions-runner"
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
  echo ""
  echo "Uso: bash setup-runner.sh <TOKEN>"
  echo ""
  echo "Obtené el token en:"
  echo "  https://github.com/$REPO/settings/actions/runners/new"
  echo ""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GitHub Actions Self-Hosted Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Directorio
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# 2. Descargar runner (versión más reciente)
echo "[1/4] Descargando runner..."
LATEST=$(curl -s https://api.github.com/repos/actions/runner/releases/latest \
  | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//')
echo "      Versión: $LATEST"
curl -fsSL -o runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${LATEST}/actions-runner-linux-x64-${LATEST}.tar.gz"
tar xzf runner.tar.gz
rm runner.tar.gz

# 3. Configurar (sin interacción)
echo "[2/4] Configurando runner..."
./config.sh \
  --url "https://github.com/$REPO" \
  --token "$TOKEN" \
  --name "$(hostname)-vps" \
  --labels "self-hosted,linux,x64" \
  --work "_work" \
  --unattended \
  --replace

# 4. Instalar y arrancar como servicio
echo "[3/4] Instalando servicio..."
./svc.sh install
./svc.sh start

echo "[4/4] Verificando..."
./svc.sh status

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LISTO"
echo "  Runner activo en: $RUNNER_DIR"
echo "  Verificá en GitHub → Settings → Actions → Runners"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/usr/bin/env bash
# Instala el GitHub Actions self-hosted runner en el VPS
#
# Uso: bash setup-runner.sh <GITHUB_PAT>
#
# GITHUB_PAT = Personal Access Token con scope "repo"
# Crearlo en: https://github.com/settings/tokens  (o tokens/fine-grained)
# El script busca el token de registro via API — no hace falta entrar a Settings

set -euo pipefail

REPO="martinsantos/cotiza"
RUNNER_DIR="/opt/actions-runner"
PAT="${1:-}"

if [ -z "$PAT" ]; then
  echo ""
  echo "Uso: bash setup-runner.sh <GITHUB_PAT>"
  echo ""
  echo "Generá un PAT en: https://github.com/settings/tokens"
  echo "Scope necesario: repo  (o 'Actions: read/write' en fine-grained)"
  echo ""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GitHub Actions Self-Hosted Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Obtener token de registro via API (no requiere UI)
echo "[1/5] Obteniendo token de registro via API..."
REG_TOKEN=$(curl -fsSL \
  -X POST \
  -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/actions/runners/registration-token" \
  | grep '"token"' | cut -d'"' -f4)

if [ -z "$REG_TOKEN" ]; then
  echo "ERROR: no se pudo obtener el token de registro."
  echo "  Verificá que el PAT tenga scope 'repo' y acceso al repo."
  exit 1
fi
echo "      Token obtenido OK"

# 2. Directorio
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# 3. Descargar runner
echo "[2/5] Descargando runner (última versión)..."
LATEST=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//')
echo "      Versión: $LATEST"
curl -fsSL -o runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${LATEST}/actions-runner-linux-x64-${LATEST}.tar.gz"
tar xzf runner.tar.gz
rm runner.tar.gz

# 4. Configurar
echo "[3/5] Configurando runner..."
./config.sh \
  --url "https://github.com/$REPO" \
  --token "$REG_TOKEN" \
  --name "$(hostname)-vps" \
  --labels "self-hosted,linux,x64" \
  --work "_work" \
  --unattended \
  --replace

# 5. Instalar como servicio y arrancar
echo "[4/5] Instalando servicio systemd..."
./svc.sh install
./svc.sh start

echo "[5/5] Estado:"
./svc.sh status

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LISTO — runner activo en $RUNNER_DIR"
echo "  Próximo push al repo activa el deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

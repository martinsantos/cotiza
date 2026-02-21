#!/usr/bin/env bash
# Autentica git contra el repo privado de GitHub usando device flow.
# No necesita PAT ni navegar Settings — solo un código de 8 caracteres
# que se ingresa en una página simple del teléfono.
#
# Uso: bash /opt/cotizar/scripts/setup-git-auth.sh

set -euo pipefail

REPO="martinsantos/cotiza"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/cotizar}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Autenticación GitHub (device flow)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Instalar gh CLI si no está
if ! command -v gh &>/dev/null; then
  echo "[1/4] Instalando gh CLI..."
  if command -v dnf &>/dev/null; then
    dnf install -y gh 2>/dev/null || \
    { dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo -y 2>/dev/null
      dnf install -y gh; }
  elif command -v yum &>/dev/null; then
    yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo 2>/dev/null || true
    yum install -y gh
  elif command -v apt-get &>/dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
    apt-get update -q && apt-get install -y gh
  else
    echo "ERROR: no se reconoce el gestor de paquetes."
    echo "Instalá gh CLI manualmente: https://github.com/cli/cli/releases"
    exit 1
  fi
else
  echo "[1/4] gh CLI ya instalado: $(gh --version | head -1)"
fi

# 2. Login via device flow (genera código de 8 chars para el teléfono)
echo ""
echo "[2/4] Login — seguí las instrucciones:"
echo ""
gh auth login \
  --hostname github.com \
  --git-protocol https \
  --scopes repo \
  --web 2>&1 || \
gh auth login \
  --hostname github.com \
  --git-protocol https \
  --scopes repo

# 3. Configurar git para usar gh como credential helper
echo ""
echo "[3/4] Configurando git credential helper..."
gh auth setup-git

# 4. Actualizar remote y probar
echo ""
echo "[4/4] Probando acceso al repo..."
git -C "$DEPLOY_DIR" remote set-url origin "https://github.com/$REPO.git"
git -C "$DEPLOY_DIR" fetch origin --quiet && echo "     Acceso OK"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LISTO — git autenticado"
echo ""
echo "  Instalá el watcher de deploy automático:"
echo "  bash $DEPLOY_DIR/scripts/install-watch.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

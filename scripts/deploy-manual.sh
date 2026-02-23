#!/usr/bin/env bash
# cotizAR – deploy manual sin GitHub Actions
#
# Uso en el VPS:
#   curl -fsSL https://raw.githubusercontent.com/martinsantos/cotiza/master/scripts/deploy-manual.sh | bash
#
# O si ya tenés el repo clonado:
#   bash /opt/cotizar/scripts/deploy-manual.sh
#
# Variables opcionales:
#   DEPLOY_DIR  default: /opt/cotizar
#   GIT_BRANCH  default: master

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cotizar}"
GIT_BRANCH="${GIT_BRANCH:-master}"
REPO_URL="https://github.com/martinsantos/cotiza.git"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
sep() { echo "════════════════════════════════════════"; }

sep
log "cotizAR – deploy manual"
log "Dir:    $DEPLOY_DIR"
log "Branch: $GIT_BRANCH"
sep

# ── 1. Clonar o actualizar el repositorio ────────────────────────────────────
if [ -d "$DEPLOY_DIR/.git" ]; then
  log "1/2 · Actualizando repo"
  git -C "$DEPLOY_DIR" fetch origin "$GIT_BRANCH"
  git -C "$DEPLOY_DIR" reset --hard "origin/$GIT_BRANCH"
  git -C "$DEPLOY_DIR" clean -fd
  log "     Commit: $(git -C "$DEPLOY_DIR" log --oneline -1)"
else
  log "1/2 · Clonando repo en $DEPLOY_DIR"
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  git clone --branch "$GIT_BRANCH" --depth 1 "$REPO_URL" "$DEPLOY_DIR"
fi

# ── 2. Ejecutar deploy.sh ─────────────────────────────────────────────────────
log "2/2 · Ejecutando deploy.sh"
bash "$DEPLOY_DIR/scripts/deploy.sh"

#!/usr/bin/env bash
# cotizAR – watcher de deploy automático
# Detecta nuevos commits en origin y despliega si hay cambios.
# Diseñado para correr via cron cada minuto.
#
# Instalación de una sola línea:
#   bash /opt/cotizar/scripts/install-watch.sh

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cotizar}"
DEPLOY_PORT="${DEPLOY_PORT:-3001}"
IMAGE="${IMAGE:-ghcr.io/martinsantos/cotiza:latest}"
BRANCH="${BRANCH:-main}"
LOG="/var/log/cotizar-watch.log"
LOCK="/tmp/cotizar-deploy.lock"

# Evitar deploys simultáneos
if [ -f "$LOCK" ]; then
  PID=$(cat "$LOCK" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    exit 0   # ya hay un deploy corriendo
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$DEPLOY_DIR"

# Obtener estado actual y remoto sin output
git fetch origin "$BRANCH" --quiet 2>/dev/null || exit 0

LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "none")
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [ -z "$REMOTE" ] || [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # sin cambios
fi

# Hay commit nuevo — loguear y desplegar
TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "" >> "$LOG"
echo "[$TS] Nuevo commit detectado" >> "$LOG"
echo "  local:  $LOCAL" >> "$LOG"
echo "  remoto: $REMOTE" >> "$LOG"

git reset --hard "origin/$BRANCH" >> "$LOG" 2>&1

DEPLOY_DIR="$DEPLOY_DIR" DEPLOY_PORT="$DEPLOY_PORT" IMAGE="$IMAGE" \
  bash "$DEPLOY_DIR/scripts/deploy.sh" >> "$LOG" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy finalizado" >> "$LOG"

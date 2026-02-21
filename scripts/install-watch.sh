#!/usr/bin/env bash
# Instala el watcher de deploy automático como cron job
# Un solo comando: bash /opt/cotizar/scripts/install-watch.sh

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cotizar}"
WATCH="$DEPLOY_DIR/scripts/watch.sh"
LOG="/var/log/cotizar-watch.log"

chmod +x "$WATCH"
touch "$LOG"

# Agregar al crontab (evita duplicados)
CRON_LINE="* * * * * bash $WATCH"
crontab -l 2>/dev/null | grep -v "cotizar/scripts/watch" | { cat; echo "$CRON_LINE"; } | crontab -

echo "Watcher instalado. Revisa el log con:"
echo "  tail -f $LOG"

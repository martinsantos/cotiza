#!/bin/bash
# deploy.sh - Deploy cotizAR to VPS
# Usage: bash deploy.sh
# Requires: docker, docker compose (or docker-compose)

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="cotizar-api"

echo "=== cotizAR Deploy ==="
echo "Dir: $REPO_DIR"
echo "Target: http://$(hostname -I | awk '{print $1}'):3001/cotizar/"
echo ""

cd "$REPO_DIR"

# Pull latest code
echo "[1/4] Pulling latest code..."
git pull origin claude/fix-quotation-blank-results-MyGoz 2>/dev/null || git pull origin master 2>/dev/null || true

# Stop existing container
echo "[2/4] Stopping existing container..."
docker stop $CONTAINER 2>/dev/null || true
docker rm $CONTAINER 2>/dev/null || true

# Build and start
echo "[3/4] Building and starting..."
if command -v docker-compose &>/dev/null; then
  docker-compose up -d --build cotizar-api
else
  docker compose up -d --build cotizar-api
fi

# Wait and health check
echo "[4/4] Waiting for health check..."
sleep 8
if curl -sf "http://localhost:3001/cotizar/health" >/dev/null 2>&1; then
  echo ""
  echo "✓ cotizAR corriendo en http://localhost:3001/cotizar/"
else
  echo "⚠ Health check falló - revisando logs:"
  docker logs $CONTAINER --tail 30
fi

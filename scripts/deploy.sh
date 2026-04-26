#!/bin/bash
set -e

APP_DIR="/var/www/ai-code-studio"
BACKEND_DIR="$APP_DIR/apps/backend"

echo "=== Deploying bartlew code Backend ==="

cd "$APP_DIR"

# Pull latest code
echo "→ Pulling latest code..."
git pull origin main

# Install & build backend
echo "→ Installing dependencies..."
cd "$BACKEND_DIR"
npm install

echo "→ Building..."
npm run build

# Reload PM2 (zero-downtime if already running)
echo "→ Reloading PM2..."
pm2 reload ecosystem.config.js --env production

echo "=== Deploy complete ==="

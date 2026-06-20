#!/usr/bin/env bash
# Build the web app and publish to the nginx static root (/var/www/shopiq).
# Use this when nginx serves shopiq.me from disk (root /var/www/shopiq),
# NOT when it proxy_passes to port 4173.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/shopiq}"

cd "$ROOT"

echo "=== Building web ==="
npm run build:web

if [[ ! -d apps/web/dist ]]; then
  echo "ERROR: apps/web/dist missing after build"
  exit 1
fi

echo "=== Publishing to ${WEB_ROOT} ==="
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}/"*
sudo cp -a apps/web/dist/. "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT" 2>/dev/null || true

echo "=== Done ==="
ls -lt "$WEB_ROOT/assets/"*.js 2>/dev/null | head -3 || true
echo "Open https://shopiq.me/?v=$(date +%s) to bypass browser cache"

#!/usr/bin/env bash
# Build the web app and publish to the nginx static root (/var/www/shopiq).
# Use this when nginx serves shopiq.me from disk (root /var/www/shopiq),
# NOT when it proxy_passes to port 4173.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/shopiq}"

cd "$ROOT"

# Vite bakes VITE_* at build time — without this, fetch() hits shopiq.me and POST /api/* returns 405.
if [[ -z "${VITE_API_URL:-}" && -f "$ROOT/.env" ]]; then
  VITE_API_URL="$(grep -E '^VITE_API_URL=' "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'' ]//;s/["'\'' ]$//')"
  export VITE_API_URL
fi

if [[ -z "${VITE_API_URL:-}" ]]; then
  echo "ERROR: VITE_API_URL is not set. Example:"
  echo "  VITE_API_URL=https://api.shopiq.me npm run build:web"
  exit 1
fi

echo "=== Building web (VITE_API_URL=${VITE_API_URL}) ==="
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

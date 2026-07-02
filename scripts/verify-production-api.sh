#!/usr/bin/env bash
# Quick production checks for api.shopiq.me (run on VPS or locally).
set -euo pipefail

API_BASE="${API_BASE:-https://api.shopiq.me}"
ORIGIN="${ORIGIN:-https://shopiq.me}"

echo "== GET $API_BASE/api/health =="
curl -fsS -i "$API_BASE/api/health" | head -n 20
echo

echo "== OPTIONS preflight (CORS) =="
curl -fsS -i -X OPTIONS "$API_BASE/api/health" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type" | head -n 25
echo

echo "== Local PM2 (if on VPS) =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 status shopiq-api || true
  pm2 logs shopiq-api --lines 5 --nostream || true
fi

echo "Done."

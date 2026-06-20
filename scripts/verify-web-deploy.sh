#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Git (latest commit) ==="
git log -1 --oneline

echo ""
echo "=== PM2 status ==="
pm2 status || true

echo ""
echo "=== Built assets contain option-label fix? ==="
if ls apps/web/dist/assets/*.js >/dev/null 2>&1; then
  if grep -l "owner-dashboard__option-label" apps/web/dist/assets/*.js | head -1; then
    echo "OK: new dashboard CSS class is in dist bundle"
  else
    echo "MISSING: dist JS does not include owner-dashboard__option-label"
    echo "Run: npm run build:web"
  fi
  ls -lt apps/web/dist/assets/*.js | head -3
else
  echo "MISSING: apps/web/dist not built — run: npm run build:web"
fi

echo ""
echo "=== Local web process (port 4173) ==="
if curl -fsS -o /dev/null http://127.0.0.1:4173/ 2>/dev/null; then
  echo "OK: something responds on :4173"
  curl -fsS http://127.0.0.1:4173/ | head -c 200
  echo ""
else
  echo "FAIL: nothing on :4173 — pm2 restart shopiq-web (or pm2 start ecosystem.config.cjs)"
fi

echo ""
echo "=== Nginx proxy for shopiq.me ==="
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -T 2>/dev/null | grep -n "server_name.*shopiq.me\|proxy_pass.*4173\|root /var/www" | head -20 || true
else
  echo "(nginx not in PATH — skip)"
fi

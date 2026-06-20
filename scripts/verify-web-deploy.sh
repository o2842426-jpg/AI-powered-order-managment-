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
echo "=== How does the PUBLIC site get files? ==="
NGINX_USES_STATIC_ROOT=0
NGINX_USES_4173=0
if command -v nginx >/dev/null 2>&1; then
  if sudo nginx -T 2>/dev/null | grep -q "server_name shopiq.me\|server_name www.shopiq.me"; then
    if sudo nginx -T 2>/dev/null | grep -A30 "server_name shopiq.me" | grep -q "root /var/www"; then
      NGINX_USES_STATIC_ROOT=1
      echo "WARNING: nginx serves shopiq.me from STATIC FILES (root /var/www/...)"
      echo "         pm2 restart shopiq-web does NOT update what users see!"
      echo "         Run: bash scripts/deploy-web-static.sh"
    fi
    if sudo nginx -T 2>/dev/null | grep "proxy_pass.*4173" >/dev/null; then
      NGINX_USES_4173=1
      echo "OK: nginx proxies to port 4173 (shopiq-web)"
    fi
  fi
  sudo nginx -T 2>/dev/null | grep -n "server_name.*shopiq.me\|proxy_pass.*4173\|root /var/www" | head -20 || true
else
  echo "(nginx not in PATH — skip)"
fi

echo ""
echo "=== Compare dist vs /var/www/shopiq (if static nginx) ==="
if [[ -d /var/www/shopiq/assets && -d apps/web/dist/assets ]]; then
  DIST_JS="$(ls -t apps/web/dist/assets/*.js 2>/dev/null | head -1 || true)"
  LIVE_JS="$(ls -t /var/www/shopiq/assets/*.js 2>/dev/null | head -1 || true)"
  echo "dist:  ${DIST_JS:-missing}"
  echo "live:  ${LIVE_JS:-missing}"
  if [[ -n "$DIST_JS" && -n "$LIVE_JS" && "$(basename "$DIST_JS")" != "$(basename "$LIVE_JS")" ]]; then
    echo "MISMATCH: public site is serving OLD files — run: bash scripts/deploy-web-static.sh"
  elif [[ -n "$DIST_JS" && -n "$LIVE_JS" ]]; then
    echo "OK: same JS bundle name on disk and in dist"
  fi
elif [[ "$NGINX_USES_STATIC_ROOT" -eq 1 ]]; then
  echo "WARN: /var/www/shopiq may be empty or missing — run deploy-web-static.sh"
fi

if [[ "$NGINX_USES_STATIC_ROOT" -eq 0 && "$NGINX_USES_4173" -eq 0 ]]; then
  echo ""
  echo "Could not detect shopiq.me routing. Check nginx manually."
fi

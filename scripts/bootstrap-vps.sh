#!/usr/bin/env bash
# Fresh VPS bootstrap for ShopIQ (Ubuntu 22/24). Run as root after git clone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== ShopIQ VPS bootstrap ==="

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/bootstrap-vps.sh"
  exit 1
fi

echo "=== System packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y curl git nginx certbot python3-certbot-nginx build-essential

if ! command -v node >/dev/null || [[ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null; then
  npm install -g pm2
fi

echo "=== Node $(node -v) npm $(npm -v) ==="

if [[ ! -f "$ROOT/.env" ]]; then
  AUTH_SECRET="$(openssl rand -hex 32)"
  ADMIN_KEY="$(openssl rand -hex 16)"
  CHANNEL_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat >"$ROOT/.env" <<EOF
PORT=4000
NODE_ENV=production

AUTH_SECRET=${AUTH_SECRET}
ADMIN_API_KEY=${ADMIN_KEY}

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

API_PUBLIC_URL=https://api.shopiq.me
FRONTEND_URL=https://shopiq.me
VITE_API_URL=https://api.shopiq.me

MANUAL_BILLING_ENFORCED=true

META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_OAUTH_REDIRECT_URI=https://api.shopiq.me/api/auth/facebook/callback
META_GRAPH_API_VERSION=v21.0

CHANNEL_TOKEN_ENCRYPTION_KEY=${CHANNEL_KEY}
EOF
  echo "Created .env — EDIT OPENAI_API_KEY and Meta keys: nano $ROOT/.env"
fi

echo "=== npm install ==="
npm install

echo "=== Build & publish web ==="
npm run build:web
bash scripts/deploy-web-static.sh

echo "=== PM2 API ==="
pm2 delete shopiq-api 2>/dev/null || true
pm2 start ecosystem.config.cjs --only shopiq-api
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "=== Nginx ==="
cat >/etc/nginx/sites-available/shopiq <<'NGINX'
server {
    listen 80;
    server_name shopiq.me www.shopiq.me;

    root /var/www/shopiq;
    index index.html;

    # Fallback when the web build has no VITE_API_URL — POST /api/* must reach Node, not static files
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name api.shopiq.me;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/shopiq /etc/nginx/sites-enabled/shopiq
nginx -t
systemctl reload nginx

echo ""
echo "=== Health check ==="
sleep 2
curl -fsS http://127.0.0.1:4000/api/health && echo ""

echo ""
echo "=== DONE ==="
echo "1. nano $ROOT/.env  (OPENAI_API_KEY, Meta keys)"
echo "2. pm2 restart shopiq-api --update-env"
echo "3. GoDaddy DNS: shopiq.me, www, api -> $(curl -fsS ifconfig.me 2>/dev/null || echo YOUR_VPS_IP)"
echo "4. certbot --nginx -d shopiq.me -d www.shopiq.me -d api.shopiq.me"
echo "ADMIN_API_KEY is in .env — save it for super-admin login"

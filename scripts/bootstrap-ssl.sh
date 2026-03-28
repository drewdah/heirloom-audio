#!/bin/bash
# bootstrap-ssl.sh — Obtain a Let's Encrypt certificate for the first time
# Usage: sudo bash scripts/bootstrap-ssl.sh
# Run this once on a fresh server before the first deploy.

set -euo pipefail

APP_DIR="/opt/heirloom-audio"
DOMAIN="heirloomaudioapp.com"

cd "$APP_DIR"

echo "==> Writing temporary HTTP-only nginx config..."
cat > "$APP_DIR/nginx/conf.d/default.conf" << 'NGINXEOF'
server {
    listen 80;
    server_name heirloomaudioapp.com www.heirloomaudioapp.com;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'ready';
        add_header Content-Type text/plain;
    }
}
NGINXEOF

echo "==> Starting nginx..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
sleep 3

echo "==> Obtaining SSL certificate..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "admin@$DOMAIN" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "==> Restoring full nginx config..."
git checkout -- nginx/conf.d/default.conf

echo "==> Starting all services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "==> Done. Certificate obtained and services started."

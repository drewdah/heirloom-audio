#!/bin/bash
# server-setup.sh — One-time setup for a fresh Ubuntu LTS server
# Usage: sudo bash scripts/server-setup.sh
#
# What this does:
#   1. Installs Docker and the Compose plugin
#   2. Creates required data directories with correct ownership
#   3. Clones the repo to /opt/heirloom-audio
#   4. Opens ports 80 and 443 in ufw
#   5. Obtains a Let's Encrypt SSL certificate (first run only)
#   6. Installs a daily cron job to reload nginx after cert renewal
#   7. Prompts you to create the .env file
#
# After running this script:
#   - Fill in /opt/heirloom-audio/.env with your production values
#   - Push a release tag to trigger the first deploy

set -euo pipefail

REPO_URL="https://github.com/drewdah/heirloom-audio.git"
APP_DIR="/opt/heirloom-audio"
APP_UID=1001
DOMAIN="heirloomaudioapp.com"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

echo "==> Checking for root..."
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash scripts/server-setup.sh)"
  exit 1
fi

echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
  apt-get update -qq
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker already installed, skipping."
fi

echo "==> Installing docker-compose-plugin..."
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
else
  echo "    docker-compose-plugin already installed, skipping."
fi

echo "==> Creating data directories..."
mkdir -p "$APP_DIR/data/db"
mkdir -p "$APP_DIR/data/uploads"
mkdir -p "$APP_DIR/data/covers"
mkdir -p "$APP_DIR/public/takes"
mkdir -p "$APP_DIR/public/exports"
chown -R "$APP_UID" "$APP_DIR/data"
chown -R "$APP_UID" "$APP_DIR/public"

echo "==> Cloning repo..."
if [ -d "$APP_DIR/.git" ]; then
  echo "    Repo already cloned, pulling latest."
  git -C "$APP_DIR" pull
else
  # Preserve .env if it exists from a previous partial setup
  if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" /tmp/heirloom.env
  fi
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  if [ -f /tmp/heirloom.env ]; then
    mv /tmp/heirloom.env "$APP_DIR/.env"
  fi
fi

echo "==> Opening ports 80 and 443 in ufw..."
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  echo "    Ports 80 and 443 opened."
else
  echo "    ufw not found, skipping. Make sure ports 80 and 443 are open in your firewall."
fi

echo "==> Checking SSL certificate..."
if [ -d "$CERT_DIR" ]; then
  echo "    Certificate already exists, skipping issuance."
else
  echo "    No certificate found. Obtaining Let's Encrypt cert for $DOMAIN..."

  cd "$APP_DIR"

  # Step 1: Write a temporary HTTP-only nginx config so nginx can start
  # without referencing cert files that don't exist yet
  cat > "$APP_DIR/nginx/conf.d/default.conf" << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'ready';
        add_header Content-Type text/plain;
    }
}
NGINXEOF

  # Step 2: Start nginx only (app isn't running yet so we skip depends_on)
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

  # Give nginx a moment to start
  sleep 3

  # Step 3: Obtain the certificate
  docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "admin@$DOMAIN" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

  # Step 4: Restore the full nginx config from the repo
  git -C "$APP_DIR" checkout -- nginx/conf.d/default.conf

  # Step 5: Reload nginx with the full HTTPS config
  docker exec heirloom-nginx nginx -s reload

  echo "    SSL certificate obtained successfully."
fi

echo "==> Installing nginx reload cron job..."
( crontab -l 2>/dev/null | grep -v 'nginx -s reload'; echo "0 3 * * * docker exec heirloom-nginx nginx -s reload >> /var/log/nginx-reload.log 2>&1" ) | crontab -
echo "    Cron job installed."

echo ""
if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Creating .env from template..."
  cat > "$APP_DIR/.env" << 'EOF'
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://heirloomaudioapp.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REDIS_URL=redis://redis:6379
APP_URL=http://app:3000
WHISPER_MODEL=tiny
ALLOWED_EMAILS=
EOF
  echo ""
  echo "  .env created at $APP_DIR/.env"
  echo "  Fill in the values before deploying."
else
  echo "  Existing .env preserved at $APP_DIR/.env"
fi

echo ""
echo "✓ Server setup complete."
echo ""
echo "Next steps:"
echo "  1. Create a Google OAuth client for this deployment:"
echo "     - Go to https://console.cloud.google.com > APIs & Services > Credentials"
echo "     - Create an OAuth 2.0 Client ID (Web application)"
echo "     - Add authorized redirect URI: https://$DOMAIN/api/auth/callback/google"
echo "     - Copy the client ID and secret"
echo "  2. Fill in $APP_DIR/.env with your production values"
echo "     (NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS)"
echo "  3. Add your server's public SSH key to GitHub secrets (DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER)"
echo "  4. Push a release tag to trigger the first deploy"

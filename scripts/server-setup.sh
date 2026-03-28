#!/bin/bash
# server-setup.sh — Idempotent setup run on every deploy by the CI pipeline.
# Also safe to run manually on a fresh server.
# Usage: sudo bash scripts/server-setup.sh
#
# What this does:
#   1. Installs Docker and the Compose plugin
#   2. Creates required data directories with correct ownership
#   3. Clones/updates the repo to /opt/heirloom-audio
#   4. Opens ports 80 and 443 in ufw
#   5. Installs a daily cron job to reload nginx after cert renewal
#   6. Creates .env from template if missing
#
# SSL certificate setup is a separate one-time step:
#   sudo bash scripts/cert-bootstrap.sh
#
# After running this script:
#   - Run cert-bootstrap.sh if this is a fresh server
#   - Fill in /opt/heirloom-audio/.env with your production values
#   - Push a release tag to trigger the first deploy

set -euo pipefail

REPO_URL="https://github.com/drewdah/heirloom-audio.git"
APP_DIR="/opt/heirloom-audio"
APP_UID=1001
DOMAIN="heirloomaudioapp.com"

echo "==> Checking for root..."
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash scripts/server-setup.sh)"
  exit 1
fi

echo "==> Stopping any running containers..."
if [ -f "$APP_DIR/docker-compose.yml" ]; then
  docker compose -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.prod.yml" down 2>/dev/null || true
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
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
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
CERT_VOLUME="$(basename "$APP_DIR")_certbot-certs"
CERT_MOUNTPOINT=$(docker volume inspect "${CERT_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || true)
if [ -n "$CERT_MOUNTPOINT" ] && [ -d "${CERT_MOUNTPOINT}/live/${DOMAIN}" ]; then
  echo "    Certificate found."
else
  echo "    WARNING: No SSL certificate found in volume ${CERT_VOLUME}."
  echo "    nginx will not start until a certificate is provisioned."
  echo "    Run: sudo bash $APP_DIR/scripts/cert-bootstrap.sh"
fi

echo "==> Installing nginx reload cron job..."
( crontab -l 2>/dev/null | grep -v 'nginx -s reload' || true; echo "0 3 * * * docker exec heirloom-nginx nginx -s reload >> /var/log/nginx-reload.log 2>&1" ) | crontab -
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
echo "Next steps (fresh server only):"
echo "  1. Fill in $APP_DIR/.env with your production values"
echo "     (NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS)"
echo "  2. Obtain SSL certificate:"
echo "     sudo bash $APP_DIR/scripts/cert-bootstrap.sh"
echo "  3. Push a release tag to trigger the first deploy"

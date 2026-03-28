#!/bin/bash
# server-setup.sh — One-time setup for a fresh Ubuntu LTS server
# Usage: sudo bash scripts/server-setup.sh
#
# What this does:
#   1. Installs Docker and the Compose plugin
#   2. Creates required data directories with correct ownership
#   3. Clones the repo to /opt/heirloom-audio
#   4. Opens port 80 in ufw
#   5. Prompts you to create the .env file
#
# After running this script:
#   - Fill in /opt/heirloom-audio/.env with your production values
#   - Push a release tag to trigger the first deploy

set -euo pipefail

REPO_URL="https://github.com/drewdah/heirloom-audio.git"
APP_DIR="/opt/heirloom-audio"
APP_UID=1001

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

echo "==> Opening port 80 in ufw..."
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp
  echo "    Port 80 opened."
else
  echo "    ufw not found, skipping. Make sure port 80 is open in your firewall."
fi

echo ""
if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Creating .env from template..."
  cat > "$APP_DIR/.env" << 'EOF'
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://yourdomain.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REDIS_URL=redis://redis:6379
APP_URL=http://yourdomain.com
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
echo "  1. Fill in $APP_DIR/.env with your production values"
echo "  2. Add your server's public SSH key to GitHub secrets (DEPLOY_SSH_KEY)"
echo "  3. Push a release tag to trigger the first deploy"

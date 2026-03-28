#!/bin/bash
# cert-bootstrap.sh — One-time SSL certificate issuance via Let's Encrypt
# Usage: sudo bash scripts/cert-bootstrap.sh
#
# Run this ONCE on a fresh server after server-setup.sh, before the first deploy.
# All containers must be stopped before running this script (port 80 must be free).

set -euo pipefail

APP_DIR="/opt/heirloom-audio"
DOMAIN="heirloomaudioapp.com"
CERT_VOLUME="$(basename "$APP_DIR")_certbot-certs"

echo "==> Checking for root..."
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash scripts/cert-bootstrap.sh)"
  exit 1
fi

CERT_MOUNTPOINT=$(docker volume inspect "${CERT_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || true)
if [ -n "$CERT_MOUNTPOINT" ] && [ -d "${CERT_MOUNTPOINT}/live/${DOMAIN}" ]; then
  echo "Certificate already exists at ${CERT_MOUNTPOINT}/live/${DOMAIN} — nothing to do."
  echo "To force renewal, run: docker run --rm --net=host -v ${CERT_VOLUME}:/etc/letsencrypt certbot/certbot renew --force-renewal"
  exit 0
fi

echo "==> Stopping all containers so port 80 is free..."
if [ -f "$APP_DIR/docker-compose.yml" ]; then
  docker compose -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.prod.yml" down 2>/dev/null || true
fi

echo "==> Obtaining Let's Encrypt certificate for $DOMAIN..."
# --net=host bypasses docker-proxy so Docker's port tracking cannot block the bind.
docker run --rm \
  --net=host \
  -v "${CERT_VOLUME}:/etc/letsencrypt" \
  certbot/certbot certonly \
  --standalone \
  --email "admin@$DOMAIN" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo ""
echo "✓ Certificate obtained. Push a release tag to trigger the first deploy."

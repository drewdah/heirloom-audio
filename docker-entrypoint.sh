#!/bin/sh
set -e

echo "🎙 HeirloomAudio starting..."

# Run DB migrations
echo "Running database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting server..."
exec node server.js

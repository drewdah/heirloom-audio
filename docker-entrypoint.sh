#!/bin/sh
set -e

echo "🎙 HeirloomAudio starting..."

# Run DB migrations
echo "Running database migrations..."
node /app/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting server..."
exec node server.js

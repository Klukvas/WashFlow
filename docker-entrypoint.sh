#!/bin/sh
set -e

echo "Running prisma db push..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "Warning: prisma db push failed, continuing..."

echo "Starting application..."
exec node dist/src/main.js

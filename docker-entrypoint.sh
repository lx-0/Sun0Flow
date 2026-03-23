#!/bin/sh
set -e

echo "Resolving any failed migrations..."
node node_modules/prisma/build/index.js migrate resolve --rolled-back 20260322200000_add_missing_schema_objects --schema=./prisma/schema.prisma 2>/dev/null || true

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
echo "Migrations complete."

echo "Starting server..."
exec node server.js

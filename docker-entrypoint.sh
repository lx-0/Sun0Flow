#!/bin/sh
set -e

echo "=== SunoFlow entrypoint ==="
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"

# Railway injects DATABASE_URL automatically for linked Postgres.
# Prisma schema expects SUNOFLOW_DATABASE_URL — bridge the gap.
if [ -z "$SUNOFLOW_DATABASE_URL" ] && [ -n "$DATABASE_URL" ]; then
  echo "SUNOFLOW_DATABASE_URL not set — falling back to DATABASE_URL"
  export SUNOFLOW_DATABASE_URL="$DATABASE_URL"
fi

# Diagnostic: confirm required env vars are present (values redacted)
for var in SUNOFLOW_DATABASE_URL DATABASE_URL AUTH_SECRET; do
  eval val=\$$var
  if [ -n "$val" ]; then
    echo "  $var = [set]"
  else
    echo "  $var = [MISSING]"
  fi
done

echo "Running database migrations..."
if node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma; then
  echo "Migrations complete."
else
  echo "WARNING: migrations failed (exit $?) — starting server anyway"
  echo "The server may fail on first DB query. Check DATABASE_URL and migration state."
fi

if [ -n "$AUDIO_CACHE_DIR" ]; then
  mkdir -p "$AUDIO_CACHE_DIR" 2>/dev/null || true
  echo "Audio cache dir: $AUDIO_CACHE_DIR"
fi

if [ -n "$IMAGE_CACHE_DIR" ]; then
  mkdir -p "$IMAGE_CACHE_DIR" 2>/dev/null || true
  echo "Image cache dir: $IMAGE_CACHE_DIR"
fi

echo "Starting server..."
exec node server.js

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

# Railway mounts persistent volumes owned by root. The Next.js server runs as
# the nextjs user (uid 1001), so we need to create + chown each cache dir
# before dropping privileges. Without this, file-cache writes fail with EACCES.
prepare_cache_dir() {
  dir="$1"
  label="$2"
  [ -z "$dir" ] && return 0
  if mkdir -p "$dir" 2>/dev/null; then
    chown -R nextjs:nodejs "$dir" 2>/dev/null || echo "  warn: chown $dir failed"
    echo "  $label = $dir (ready)"
  else
    echo "  warn: mkdir $dir failed"
  fi
}

prepare_cache_dir "$AUDIO_CACHE_DIR" "Audio cache dir"
prepare_cache_dir "$IMAGE_CACHE_DIR" "Image cache dir"

echo "Running database migrations..."
if su-exec nextjs:nodejs node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma; then
  echo "Migrations complete."
else
  echo "WARNING: migrations failed (exit $?) — starting server anyway"
  echo "The server may fail on first DB query. Check DATABASE_URL and migration state."
fi

echo "Starting server as nextjs user..."
exec su-exec nextjs:nodejs node server.js

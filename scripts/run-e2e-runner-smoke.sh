#!/usr/bin/env bash
set -euo pipefail

# Runner-safe E2E wrapper:
# 1) Uses system Chromium when available.
# 2) Falls back to playwright-managed Chromium in a local cache path.
# 3) Reserves a free localhost port for isolated app startup.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]]; then
  CHROMIUM_PATH="$PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
else
  CHROMIUM_PATH=""
  for bin in chromium chromium-browser google-chrome-stable google-chrome; do
    if command -v "$bin" >/dev/null 2>&1; then
      CHROMIUM_PATH="$(command -v "$bin")"
      break
    fi
  done
fi

if [[ -n "$CHROMIUM_PATH" ]]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROMIUM_PATH"
  echo "Using system Chromium: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
else
  TARGET_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT_DIR/.cache/ms-playwright}"
  if ! mkdir -p "$TARGET_BROWSERS_PATH" 2>/dev/null; then
    TARGET_BROWSERS_PATH="$ROOT_DIR/.cache/ms-playwright"
    mkdir -p "$TARGET_BROWSERS_PATH"
  fi
  if [[ ! -w "$TARGET_BROWSERS_PATH" ]]; then
    TARGET_BROWSERS_PATH="$ROOT_DIR/.cache/ms-playwright"
    mkdir -p "$TARGET_BROWSERS_PATH"
  fi
  export PLAYWRIGHT_BROWSERS_PATH="$TARGET_BROWSERS_PATH"
  echo "System Chromium not found; installing playwright Chromium into $PLAYWRIGHT_BROWSERS_PATH"
  if ! timeout 300 pnpm exec playwright install chromium; then
    echo "Playwright Chromium installation failed or timed out in runner environment."
    echo "Unblock options: pre-provision system chromium, or pre-warm $PLAYWRIGHT_BROWSERS_PATH in the runner image."
    exit 1
  fi
fi

if [[ -z "${PLAYWRIGHT_PORT:-}" ]]; then
  PLAYWRIGHT_PORT="$(
    node -e "const n=require('node:net');const s=n.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;console.log(String(p));s.close();});"
  )"
fi

export PLAYWRIGHT_PORT
export BASE_URL="${BASE_URL:-http://localhost:$PLAYWRIGHT_PORT}"
export AUTH_URL="${AUTH_URL:-$BASE_URL}"
export PLAYWRIGHT_TEST="true"

echo "Running Playwright on BASE_URL=$BASE_URL (PLAYWRIGHT_PORT=$PLAYWRIGHT_PORT)"
exec pnpm test:e2e "$@"

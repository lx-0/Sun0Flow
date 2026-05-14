#!/usr/bin/env bash
set -euo pipefail

SCHEMA_PATH="${1:-prisma/schema.prisma}"
MIGRATIONS_DIR="${2:-prisma/migrations}"

if [ ! -f "$SCHEMA_PATH" ]; then
  echo "ERROR: schema file not found: $SCHEMA_PATH" >&2
  exit 1
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "== Migration Safety Check =="
echo "Schema: $SCHEMA_PATH"
echo "Migrations: $MIGRATIONS_DIR"

# 1) Validate Prisma schema syntax + semantics.
pnpm exec prisma validate --schema "$SCHEMA_PATH" >/tmp/prisma-validate.out 2>/tmp/prisma-validate.err || {
  echo "FAIL: prisma validate failed" >&2
  sed -n '1,120p' /tmp/prisma-validate.err >&2 || true
  exit 1
}
echo "PASS: prisma schema validates"

# 2) Basic migration structure checks.
missing=0
while IFS= read -r -d '' dir; do
  if [ ! -f "$dir/migration.sql" ]; then
    echo "FAIL: missing migration.sql in $dir" >&2
    missing=1
  fi
done < <(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -print0)

if [ "$missing" -ne 0 ]; then
  exit 1
fi
echo "PASS: all migration directories contain migration.sql"

# 3) Heuristic guardrail for destructive SQL ops.
# Allow explicit opt-in by placing '-- approved-destructive' in the migration file.
destructive_pattern='\\b(DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|TRUNCATE[[:space:]]+TABLE|DELETE[[:space:]]+FROM)\\b'
found=0
while IFS= read -r -d '' file; do
  if grep -Eiq "$destructive_pattern" "$file"; then
    if grep -Eiq -- '--[[:space:]]*approved-destructive' "$file"; then
      echo "WARN: destructive SQL with explicit approval marker in $file"
    else
      echo "FAIL: potential destructive SQL without approval marker in $file" >&2
      grep -Ein "$destructive_pattern" "$file" >&2 || true
      found=1
    fi
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name 'migration.sql' -print0)

if [ "$found" -ne 0 ]; then
  echo "Hint: add '-- approved-destructive' with justification comment, or redesign migration." >&2
  exit 1
fi

echo "PASS: no unapproved destructive SQL patterns detected"
echo "Migration safety checks passed."

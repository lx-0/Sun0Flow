#!/usr/bin/env bash
set -euo pipefail

# Verifies the target SHA has a successful CI run (including QA Checks build).
# This avoids flaky local `pnpm build` failures on constrained agent hosts.

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI is required."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required."
  exit 1
fi

TARGET_SHA="${1:-$(git rev-parse HEAD)}"
REMOTE_URL="${GITHUB_REPOSITORY_URL:-$(git config --get remote.origin.url || true)}"
REPO="${GITHUB_REPOSITORY:-}"

if [ -z "$REPO" ]; then
  REPO="$(printf '%s' "$REMOTE_URL" | sed -E 's#^.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#')"
fi

if [ -z "$REPO" ] || ! printf '%s' "$REPO" | grep -Eq '^[^/]+/[^/]+$'; then
  echo "ERROR: could not determine repository owner/name."
  exit 1
fi

echo "== CI Build Gate =="
echo "Repository: $REPO"
echo "SHA: $TARGET_SHA"

gh api "repos/$REPO/commits/$TARGET_SHA" >/dev/null

runs_json="$(gh api "repos/$REPO/actions/runs?head_sha=$TARGET_SHA&status=completed&per_page=20")"

run_id="$(
  printf '%s' "$runs_json" | jq -r '
    .workflow_runs
    | map(select(.name == "CI" and .path == ".github/workflows/ci.yml"))
    | sort_by(.created_at)
    | last
    | .id // empty
  '
)"

if [ -z "$run_id" ]; then
  echo "ERROR: no completed CI run found for $TARGET_SHA."
  exit 1
fi

run_conclusion="$(
  printf '%s' "$runs_json" | jq -r --argjson run_id "$run_id" '
    .workflow_runs[] | select(.id == $run_id) | .conclusion
  '
)"
run_url="$(
  printf '%s' "$runs_json" | jq -r --argjson run_id "$run_id" '
    .workflow_runs[] | select(.id == $run_id) | .html_url
  '
)"

if [ "$run_conclusion" != "success" ]; then
  echo "ERROR: CI workflow did not succeed (conclusion=$run_conclusion)."
  echo "Run: $run_url"
  exit 1
fi

jobs_json="$(gh api "repos/$REPO/actions/runs/$run_id/jobs?per_page=100")"
qa_conclusion="$(
  printf '%s' "$jobs_json" | jq -r '
    .jobs
    | map(select(.name == "QA Checks"))
    | sort_by(.started_at // .created_at)
    | last
    | .conclusion // empty
  '
)"
qa_url="$(
  printf '%s' "$jobs_json" | jq -r '
    .jobs
    | map(select(.name == "QA Checks"))
    | sort_by(.started_at // .created_at)
    | last
    | .html_url // empty
  '
)"

if [ -z "$qa_conclusion" ]; then
  echo "ERROR: QA Checks job not found in CI run $run_id."
  echo "Run: $run_url"
  exit 1
fi

if [ "$qa_conclusion" != "success" ]; then
  echo "ERROR: QA Checks failed (conclusion=$qa_conclusion)."
  echo "Job: $qa_url"
  exit 1
fi

echo "CI build gate passed."
echo "Run: $run_url"
echo "QA: $qa_url"

#!/usr/bin/env bash
# Daily digests on an always-on Mac (launchd / cron).
# Buyers every day; sellers only Monday (America/Toronto) via the deployed app.
#
# The Mac must not render mail from this checkout. A stale tree is what sent
# the November 24, 2026 digests without the assigned agent's email and title.
# POST the production cron route, which runs the deployed resolver.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/digests.log"

# launchd has a minimal PATH — pin nvm node/pnpm when present.
export PATH="/Users/ali/.nvm/versions/node/v22.17.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

read_env_value() {
  local key="$1"
  local file="$2"
  local line=""
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

{
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') digests start ====="
  URL="${DIGEST_CRON_URL:-$(read_env_value DIGEST_CRON_URL .env.local)}"
  SECRET="${DIGEST_CRON_SECRET:-${CRON_SECRET:-}}"
  if [[ -z "$SECRET" ]]; then
    SECRET="$(read_env_value DIGEST_CRON_SECRET .env.local)"
  fi
  if [[ -z "$SECRET" ]]; then
    SECRET="$(read_env_value CRON_SECRET .env.local)"
  fi
  if [[ -z "$URL" ]]; then
    URL="https://houzzat.com/api/cron/digests"
  fi

  if [[ "$URL" == "local" ]]; then
    echo "DIGEST_CRON_URL=local; rendering from this checkout"
    pnpm digests:run
  elif [[ -z "$SECRET" ]]; then
    echo "Missing DIGEST_CRON_SECRET; refusing to render digests from this checkout."
    exit 1
  else
    echo "POST deployed digest cron"
    curl -fsS -X POST "$URL" \
      -H "Authorization: Bearer ${SECRET}" \
      -H "Content-Type: application/json" \
      -d '{}'
    echo
  fi
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') digests done ====="
} >>"$LOG_FILE" 2>&1

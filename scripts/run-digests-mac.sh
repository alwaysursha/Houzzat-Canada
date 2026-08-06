#!/usr/bin/env bash
# Daily digests on a always-on Mac (launchd / cron).
# Buyers every day; sellers only Monday (America/Toronto) via the runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/digests.log"

# launchd has a minimal PATH — pin nvm node/pnpm when present.
export PATH="/Users/ali/.nvm/versions/node/v22.17.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

{
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') digests start ====="
  pnpm digests:run
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') digests done ====="
} >>"$LOG_FILE" 2>&1

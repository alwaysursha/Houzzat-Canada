#!/usr/bin/env bash
# Watch monitors on an always-on Mac (launchd).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/monitors.log"

export PATH="/Users/ali/.nvm/versions/node/v22.17.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

{
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') monitors start ====="
  pnpm monitors:run
  pnpm verify-email-nudge:run
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') monitors done ====="
} >>"$LOG_FILE" 2>&1

#!/usr/bin/env bash
# 14-day inactive Lead SMS automations on an always-on Mac (launchd).
# Overlapping ticks skip; they must not start a second send pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sms-automations.log"
LOCK_DIR="${TMPDIR:-/tmp}/houzzat-sms-automations.lock"

export PATH="/Users/ali/.nvm/versions/node/v22.17.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

{
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') sms-automations start ====="
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "SKIP: another sms-automations run is already running"
  else
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
    pnpm sms-automations:run
  fi
  echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') sms-automations done ====="
} >>"$LOG_FILE" 2>&1

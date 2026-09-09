#!/usr/bin/env bash
# Houzzat MLS Fast Sync for a dedicated Mac (launchd / manual).
# Every 5–10 minutes: just-listed + recent mods → Neon → gated Typesense.
# Does not advance MlsSyncCursor. May overlap the slow hourly job.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${HOZZAT_SYNC_LOG_DIR:-$HOME/Library/Logs/houzzat}"
LOCK_DIR="${TMPDIR:-/tmp}/houzzat-mls-fast-sync.lock"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/mls-fast-sync-$(date +%Y%m%d).log"
exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-fast-sync start ========"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "ERROR: missing $ROOT/.env.local"
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "SKIP: another mls-fast-sync is already running"
  exit 0
fi
trap 'ec=$?; rmdir "$LOCK_DIR" 2>/dev/null || true; if [[ $ec -ne 0 ]]; then echo "======== $(date "+%Y-%m-%d %H:%M:%S %Z") mls-fast-sync FAILED exit=${ec} ========"; fi' EXIT

export GOOGLE_MAPS_BILLING_ENABLED="${GOOGLE_MAPS_BILLING_ENABLED:-0}"
export GEOCODE_SKIP_GOOGLE="${GEOCODE_SKIP_GOOGLE:-1}"
export GOOGLE_PLACES_AUTOCOMPLETE="${GOOGLE_PLACES_AUTOCOMPLETE:-0}"
export TYPESENSE_SYNC="${TYPESENSE_SYNC:-1}"
export MLS_SYNC_MODE=fast
export PATH="/usr/local/bin:/usr/local/Homebrew/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$PATH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found on PATH=$PATH"
  exit 1
fi

echo "Running: pnpm mls:sync --fast"
echo "Lock: ${LOCK_DIR} (distinct from houzzat-mls-sync.lock)"
pnpm mls:sync --fast
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-fast-sync done ========"

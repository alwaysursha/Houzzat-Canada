#!/usr/bin/env bash
# Houzzat MLS Fast Sync for a dedicated Mac (launchd / manual).
# Every 5–10 minutes: just-listed + recent mods → Neon → gated Typesense.
# Does not advance MlsSyncCursor. Skips entirely while Full sync holds its lock.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${HOZZAT_SYNC_LOG_DIR:-$HOME/Library/Logs/houzzat}"
# shellcheck source=mac-mls-lock.sh
source "$ROOT/scripts/mac-mls-lock.sh"
FULL_LOCK="${TMPDIR:-/tmp}/houzzat-mls-sync.lock"
FAST_LOCK="${TMPDIR:-/tmp}/houzzat-mls-fast-sync.lock"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/mls-fast-sync-$(date +%Y%m%d).log"
exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-fast-sync start ========"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "ERROR: missing $ROOT/.env.local"
  exit 1
fi

if ! mls_fast_prepare "$FULL_LOCK" "$FAST_LOCK"; then
  exit 0
fi
trap 'ec=$?; mls_lock_release "$FAST_LOCK"; if [[ $ec -ne 0 ]]; then echo "======== $(date "+%Y-%m-%d %H:%M:%S %Z") mls-fast-sync FAILED exit=${ec} ========"; fi' EXIT

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
echo "Lock: ${FAST_LOCK} (yields to ${FULL_LOCK})"
pnpm mls:sync --fast
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-fast-sync done ========"

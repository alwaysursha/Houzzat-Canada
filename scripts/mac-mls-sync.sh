#!/usr/bin/env bash
# Houzzat MLS sync for a dedicated Mac (launchd / manual).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${HOZZAT_SYNC_LOG_DIR:-$HOME/Library/Logs/houzzat}"
LOCK_DIR="${TMPDIR:-/tmp}/houzzat-mls-sync.lock"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/mls-sync-$(date +%Y%m%d).log"
exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-sync start ========"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "ERROR: missing $ROOT/.env.local"
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "SKIP: another mls-sync is already running"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

export GOOGLE_MAPS_BILLING_ENABLED="${GOOGLE_MAPS_BILLING_ENABLED:-0}"
export GEOCODE_SKIP_GOOGLE="${GEOCODE_SKIP_GOOGLE:-1}"
export GOOGLE_PLACES_AUTOCOMPLETE="${GOOGLE_PLACES_AUTOCOMPLETE:-0}"
export PATH="/usr/local/bin:/usr/local/Homebrew/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$PATH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found on PATH=$PATH"
  exit 1
fi

MAX_PAGES="${MLS_SYNC_MAX_PAGES:-20}"
BACKFILL_DAYS="${MLS_SYNC_BACKFILL_DAYS:-3}"
RESOURCES="${MLS_SYNC_RESOURCES:-property,openHouse}"

echo "Running: pnpm mls:sync ${MAX_PAGES} ${BACKFILL_DAYS} ${RESOURCES}"
pnpm mls:sync "$MAX_PAGES" "$BACKFILL_DAYS" "$RESOURCES"
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-sync done ========"

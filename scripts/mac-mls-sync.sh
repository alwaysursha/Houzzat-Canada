#!/usr/bin/env bash
# Houzzat MLS sync for a dedicated Mac (launchd / manual).
# Hourly: pull just-listed + recent mods first, then advance history/cursor.
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
# Keep Typesense index fresh when .env.local has TYPESENSE_* (admin) keys.
export TYPESENSE_SYNC="${TYPESENSE_SYNC:-1}"
export PATH="/usr/local/bin:/usr/local/Homebrew/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$PATH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found on PATH=$PATH"
  exit 1
fi

# Mac hourly tick: larger pulls; just-listed / recent first, then history.
MAX_PAGES="${MLS_SYNC_MAX_PAGES:-30}"
BACKFILL_DAYS="${MLS_SYNC_BACKFILL_DAYS:-7}"
RESOURCES="${MLS_SYNC_RESOURCES:-property,openHouse}"

export MLS_SYNC_JUST_LISTED_DAYS="${MLS_SYNC_JUST_LISTED_DAYS:-7}"
export MLS_SYNC_JUST_LISTED_PAGES="${MLS_SYNC_JUST_LISTED_PAGES:-30}"
export MLS_SYNC_RECENT_DAYS="${MLS_SYNC_RECENT_DAYS:-7}"
export MLS_SYNC_RECENT_PAGES="${MLS_SYNC_RECENT_PAGES:-25}"
export MLS_SYNC_BACKLOG_PAGES="${MLS_SYNC_BACKLOG_PAGES:-30}"
export MLS_SYNC_MEDIA_CAP="${MLS_SYNC_MEDIA_CAP:-80}"
export MLS_SYNC_SOLD_CAP="${MLS_SYNC_SOLD_CAP:-200}"

echo "Running: pnpm mls:sync ${MAX_PAGES} ${BACKFILL_DAYS} ${RESOURCES}"
echo "Budgets: justListed=${MLS_SYNC_JUST_LISTED_PAGES}p/${MLS_SYNC_JUST_LISTED_DAYS}d recent=${MLS_SYNC_RECENT_PAGES}p/${MLS_SYNC_RECENT_DAYS}d backlog=${MLS_SYNC_BACKLOG_PAGES}p media=${MLS_SYNC_MEDIA_CAP} sold=${MLS_SYNC_SOLD_CAP}"
pnpm mls:sync "$MAX_PAGES" "$BACKFILL_DAYS" "$RESOURCES"
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-sync done ========"

#!/usr/bin/env bash
# Houzzat MLS photo backfill for dedicated Mac (nightly launchd / manual).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${HOZZAT_SYNC_LOG_DIR:-$HOME/Library/Logs/houzzat}"
LOCK_DIR="${TMPDIR:-/tmp}/houzzat-mls-media.lock"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/mls-media-$(date +%Y%m%d).log"
exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-media start ========"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "ERROR: missing $ROOT/.env.local"
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "SKIP: another mls-media is already running"
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

# ~50 listings per page; 20 ≈ 1000 listings with missing photos.
MAX_PAGES="${MLS_MEDIA_MAX_PAGES:-20}"

echo "Running: pnpm mls:media ${MAX_PAGES}"
pnpm mls:media "$MAX_PAGES"
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-media done ========"

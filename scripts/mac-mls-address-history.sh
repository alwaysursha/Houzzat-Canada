#!/usr/bin/env bash
# Nightly PropTx address-history enrich (sibling MLS cycles) for Sync Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${HOZZAT_SYNC_LOG_DIR:-$HOME/Library/Logs/houzzat}"
LOCK_DIR="${TMPDIR:-/tmp}/houzzat-mls-address-history.lock"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/mls-address-history-$(date +%Y%m%d).log"
exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-address-history start ========"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "ERROR: missing $ROOT/.env.local"
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "SKIP: another address-history job is already running"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

export GOOGLE_MAPS_BILLING_ENABLED="${GOOGLE_MAPS_BILLING_ENABLED:-0}"
export GEOCODE_SKIP_GOOGLE="${GEOCODE_SKIP_GOOGLE:-1}"
export PATH="/usr/local/bin:/usr/local/Homebrew/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$HOME/.nvm/versions/node/v22.17.0/bin:$PATH"

LIMIT="${MLS_ADDRESS_HISTORY_LIMIT:-300}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found on PATH=$PATH"
  exit 1
fi

echo "Running: pnpm mls:address-history ${LIMIT}"
pnpm mls:address-history "$LIMIT"
echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') mls-address-history done ========"

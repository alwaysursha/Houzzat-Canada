#!/usr/bin/env bash
# Merge Typesense env from this repo's .env.local into the sync Mac checkout.
# Run on the dedicated sync Mac (or any machine that owns the MLS launchd jobs):
#   bash scripts/mac-apply-typesense-env.sh
#   bash scripts/mac-apply-typesense-env.sh /Users/Ali/Houzzat-Canada
set -euo pipefail

SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_ROOT="${1:-/Users/Ali/Houzzat-Canada}"
SRC_ENV="$SRC_ROOT/.env.local"
DEST_ENV="$DEST_ROOT/.env.local"

if [[ ! -f "$SRC_ENV" ]]; then
  echo "ERROR: missing $SRC_ENV"
  exit 1
fi

if [[ ! -d "$DEST_ROOT" ]]; then
  echo "ERROR: sync checkout not found: $DEST_ROOT"
  echo "Clone/pull the Houzzat repo there first, then re-run."
  exit 1
fi

if [[ ! -f "$DEST_ENV" ]]; then
  echo "ERROR: missing $DEST_ENV (sync Mac needs its own .env.local)"
  exit 1
fi

KEYS=(
  TYPESENSE_HOST
  TYPESENSE_PORT
  TYPESENSE_PROTOCOL
  TYPESENSE_ADMIN_API_KEY
  TYPESENSE_SEARCH_API_KEY
  TYPESENSE_COLLECTION
  TYPESENSE_SYNC
)

tmp="$(mktemp)"
# Drop any existing Typesense lines, then append fresh ones from source.
grep -v -E '^TYPESENSE_' "$DEST_ENV" >"$tmp" || true

{
  echo ""
  echo "# Typesense — applied $(date '+%Y-%m-%d %H:%M:%S')"
  for key in "${KEYS[@]}"; do
    line="$(grep -E "^${key}=" "$SRC_ENV" || true)"
    if [[ -n "$line" ]]; then
      echo "$line"
    fi
  done
  # Sync Mac should upsert; search flags optional there.
  if ! grep -q '^TYPESENSE_SYNC=' "$SRC_ENV" 2>/dev/null; then
    echo 'TYPESENSE_SYNC="1"'
  fi
} >>"$tmp"

mv "$tmp" "$DEST_ENV"
chmod 600 "$DEST_ENV"

echo "OK: Typesense keys merged into $DEST_ENV"
echo "Present:"
grep -E '^TYPESENSE_[A-Z_]+=' "$DEST_ENV" | sed 's/=.*/=✓/'

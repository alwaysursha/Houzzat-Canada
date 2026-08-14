#!/usr/bin/env bash
# Run Capacitor CLI against either the Houzzat or HouzzatPro native target.
#
# Usage:
#   scripts/cap-target.sh houzzat  sync|copy|update|open|add|doctor  [ios|android] …
#   scripts/cap-target.sh pro      sync|copy|update|open|add|doctor  [ios|android] …
#
# Safety (Phase 3):
# - Does NOT rewrite capacitor.config.ts on disk.
# - Selects identity via HOUZZAT_CAP_TARGET=houzzat|pro (see capacitor.config.ts).
# - Default / missing env → consumer. Bare `npx cap sync` cannot produce Pro.
# - Parallel CI jobs are safe: each process only reads config + writes its own
#   native tree (ios/android vs ios-pro/android-pro).
# - Heals leftover swap artifacts from the old Phase 2 lock/restore approach.
# - Asserts appId + UA marker after sync/copy/update/add for BOTH trees so a
#   cross-write would fail the job.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
shift || true

if [[ -z "${TARGET}" || $# -lt 1 ]]; then
  echo "Usage: $0 <houzzat|pro> <cap-command> [args…]" >&2
  exit 2
fi

ACTIVE_BAK="$ROOT/.capacitor.config.ts.consumer.bak"
STALE_LOCK="$ROOT/.capacitor-target.lock"

# Heal Phase 2 swap leftovers (interrupted builds).
if [[ -f "$ACTIVE_BAK" ]]; then
  echo "WARN: found leftover .capacitor.config.ts.consumer.bak — removing (config is env-selected now)" >&2
  rm -f "$ACTIVE_BAK"
fi
rm -f "$STALE_LOCK"

CONSUMER_APP_ID="com.houzzat.app"
PRO_APP_ID="com.houzzat.pro"

case "$TARGET" in
  houzzat|consumer)
    export HOUZZAT_CAP_TARGET="houzzat"
    EXPECT_ID="$CONSUMER_APP_ID"
    ASSERT_TARGET="houzzat"
    OTHER_TARGET="pro"
    ;;
  pro|houzzatpro)
    export HOUZZAT_CAP_TARGET="pro"
    EXPECT_ID="$PRO_APP_ID"
    ASSERT_TARGET="pro"
    OTHER_TARGET="houzzat"
    ;;
  *)
    echo "ERROR: unknown target '$TARGET' (use houzzat|pro)" >&2
    exit 2
    ;;
esac

# Prove the Cap TS config resolves to the expected appId for this env.
RESOLVED_ID="$(
  HOUZZAT_CAP_TARGET="$HOUZZAT_CAP_TARGET" node --import tsx -e \
    'import mod from "./capacitor.config.ts"; const c = mod?.default ?? mod; process.stdout.write(String(c.appId ?? ""));'
)"
if [[ "$RESOLVED_ID" != "$EXPECT_ID" ]]; then
  echo "ERROR: capacitor.config.ts resolved appId='$RESOLVED_ID' with HOUZZAT_CAP_TARGET=$HOUZZAT_CAP_TARGET (expected $EXPECT_ID)" >&2
  exit 1
fi

echo "→ Capacitor target: $ASSERT_TARGET (appId=$EXPECT_ID, HOUZZAT_CAP_TARGET=$HOUZZAT_CAP_TARGET)"

CMD="${1:-}"
npx --yes cap "$@"

case "$CMD" in
  sync|copy|update|add)
    bash "$ROOT/scripts/assert-cap-identity.sh" "$ASSERT_TARGET"
    # Sibling tree must still match its own identity (detect cross-writes).
    bash "$ROOT/scripts/assert-cap-identity.sh" "$OTHER_TARGET"
    ;;
esac

echo "→ done ($ASSERT_TARGET)"

#!/usr/bin/env bash
# Open / prepare the iOS target for internal device or simulator builds.
#
# Usage:
#   scripts/ios-prepare.sh houzzat
#   scripts/ios-prepare.sh pro
#
# Syncs Capacitor, asserts identity, then opens Xcode when available.
# Does NOT archive or upload to TestFlight.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <houzzat|pro>" >&2
  exit 2
fi

case "$TARGET" in
  houzzat|consumer)
    ASSERT="houzzat"
    WORKSPACE="$ROOT/ios/App/App.xcodeproj"
    EXPECT_ID="com.houzzat.app"
    ;;
  pro|houzzatpro)
    ASSERT="pro"
    WORKSPACE="$ROOT/ios-pro/App/App.xcodeproj"
    EXPECT_ID="com.houzzat.pro"
    ;;
  *)
    echo "ERROR: unknown target '$TARGET'" >&2
    exit 2
    ;;
esac

bash "$ROOT/scripts/cap-target.sh" "$ASSERT" sync
bash "$ROOT/scripts/assert-cap-identity.sh" "$ASSERT" --require-both

if ! rg -F -q "PRODUCT_BUNDLE_IDENTIFIER = $EXPECT_ID" "$WORKSPACE/project.pbxproj"; then
  echo "ERROR: $WORKSPACE bundle id is not $EXPECT_ID" >&2
  exit 1
fi
echo "OK    Xcode bundle id $EXPECT_ID"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "WARN: full Xcode is not available on this machine (xcodebuild missing)."
  echo "      Project is prepared at: $WORKSPACE"
  if [[ "$ASSERT" == "pro" ]]; then
    echo "      Install Xcode, then run: pnpm cap:ios:pro"
  else
    echo "      Install Xcode, then run: pnpm cap:ios"
  fi
  exit 0
fi

bash "$ROOT/scripts/cap-target.sh" "$ASSERT" open ios

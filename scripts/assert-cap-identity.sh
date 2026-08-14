#!/usr/bin/env bash
# Assert Capacitor native identity for Houzzat or HouzzatPro.
#
# Usage:
#   scripts/assert-cap-identity.sh houzzat
#   scripts/assert-cap-identity.sh pro
#   scripts/assert-cap-identity.sh houzzat --require-both

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
REQUIRE_BOTH=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --require-both) REQUIRE_BOTH=1 ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <houzzat|pro> [--require-both]" >&2
  exit 2
fi

case "$TARGET" in
  houzzat|consumer)
    EXPECT_ID="com.houzzat.app"
    EXPECT_UA="HouzzatNative/1 (com.houzzat.app)"
    FORBIDDEN_ID="com.houzzat.pro"
    FILES=(
      "$ROOT/ios/App/App/capacitor.config.json"
      "$ROOT/android/app/src/main/assets/capacitor.config.json"
    )
    ;;
  pro|houzzatpro)
    EXPECT_ID="com.houzzat.pro"
    EXPECT_UA="HouzzatNative/1 (com.houzzat.pro)"
    FORBIDDEN_ID="com.houzzat.app"
    FILES=(
      "$ROOT/ios-pro/App/App/capacitor.config.json"
      "$ROOT/android-pro/app/src/main/assets/capacitor.config.json"
    )
    ;;
  *)
    echo "ERROR: unknown target '$TARGET'" >&2
    exit 2
    ;;
esac

failures=0
checked=0

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    if [[ "$REQUIRE_BOTH" -eq 1 ]]; then
      echo "ERROR: missing required config: $file" >&2
      failures=$((failures + 1))
    else
      echo "SKIP  (missing) $file"
    fi
    continue
  fi
  checked=$((checked + 1))

  got_id="$(rg -o '"appId": "[^"]+"' "$file" | head -1 | sed 's/"appId": "//;s/"$//')"
  if [[ "$got_id" != "$EXPECT_ID" ]]; then
    echo "ERROR: $file appId='$got_id' (expected $EXPECT_ID)" >&2
    failures=$((failures + 1))
    continue
  fi
  if ! rg -F -q "$EXPECT_UA" "$file"; then
    echo "ERROR: $file missing UA marker: $EXPECT_UA" >&2
    failures=$((failures + 1))
    continue
  fi
  if rg -F -q "\"appId\": \"$FORBIDDEN_ID\"" "$file"; then
    echo "ERROR: $file contains forbidden appId $FORBIDDEN_ID" >&2
    failures=$((failures + 1))
    continue
  fi
  echo "OK    $file (appId=$got_id)"
done

if [[ "$REQUIRE_BOTH" -eq 1 && "$checked" -lt 2 ]]; then
  echo "ERROR: expected both iOS and Android configs for $TARGET (checked $checked)" >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "assert-cap-identity ($TARGET): $failures failure(s)" >&2
  exit 1
fi

if [[ "$checked" -eq 0 ]]; then
  echo "assert-cap-identity ($TARGET): no files present yet"
  exit 0
fi

echo "assert-cap-identity ($TARGET): pass (checked $checked file(s))"

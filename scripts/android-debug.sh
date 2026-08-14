#!/usr/bin/env bash
# Build a debug APK for Houzzat or HouzzatPro (internal device testing).
#
# Usage:
#   scripts/android-debug.sh houzzat
#   scripts/android-debug.sh pro
#
# Requires JDK 17–21 (Android Studio JBR 21 recommended) and a local SDK.
# Does NOT sign for Play Store. Does NOT submit anything.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <houzzat|pro>" >&2
  exit 2
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in \
    "$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  do
    if [[ -x "$candidate/bin/java" ]]; then
      # Prefer 21 over 25 — Gradle 8.14 rejects class file major 69 (Java 25).
      ver="$("$candidate/bin/java" -version 2>&1 | head -1 || true)"
      if [[ "$ver" == *"21."* || "$ver" == *"17."* ]]; then
        export JAVA_HOME="$candidate"
        break
      fi
      if [[ -z "${JAVA_HOME:-}" ]]; then
        export JAVA_HOME="$candidate"
      fi
    fi
  done
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "ERROR: set JAVA_HOME to JDK 17 or 21 (not 25)." >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

case "$TARGET" in
  houzzat|consumer)
    DIR="$ROOT/android"
    EXPECT_ID="com.houzzat.app"
    EXPECT_UA="HouzzatNative/1 (com.houzzat.app)"
    ASSERT="houzzat"
    ;;
  pro|houzzatpro)
    DIR="$ROOT/android-pro"
    EXPECT_ID="com.houzzat.pro"
    EXPECT_UA="HouzzatNative/1 (com.houzzat.pro)"
    ASSERT="pro"
    ;;
  *)
    echo "ERROR: unknown target '$TARGET'" >&2
    exit 2
    ;;
esac

echo "→ syncing Capacitor ($ASSERT) before Android debug build"
bash "$ROOT/scripts/cap-target.sh" "$ASSERT" sync

echo "→ ./gradlew assembleDebug in $DIR (JAVA_HOME=$JAVA_HOME)"
(
  cd "$DIR"
  ./gradlew assembleDebug --no-daemon
)

APK="$DIR/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "ERROR: missing $APK" >&2
  exit 1
fi

AAPT="$(ls "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$AAPT" ]]; then
  pkg="$("$AAPT" dump badging "$APK" | sed -n "s/.*name='\([^']*\)'.*/\1/p" | head -1)"
  if [[ "$pkg" != "$EXPECT_ID" ]]; then
    echo "ERROR: APK package='$pkg' (expected $EXPECT_ID)" >&2
    exit 1
  fi
  echo "OK    APK package $pkg"
fi

tmpdir="$(mktemp -d)"
unzip -qo "$APK" assets/capacitor.config.json -d "$tmpdir"
if ! rg -F -q "\"appId\": \"$EXPECT_ID\"" "$tmpdir/assets/capacitor.config.json"; then
  echo "ERROR: APK embedded appId mismatch" >&2
  exit 1
fi
if ! rg -F -q "$EXPECT_UA" "$tmpdir/assets/capacitor.config.json"; then
  echo "ERROR: APK missing UA marker $EXPECT_UA" >&2
  exit 1
fi
rm -rf "$tmpdir"

echo "→ debug APK ready: $APK"
echo "  install: adb install -r \"$APK\""

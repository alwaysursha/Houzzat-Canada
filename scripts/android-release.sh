#!/usr/bin/env bash
# Build a Play Store–signed release for Houzzat or HouzzatPro.
#
# Usage:
#   scripts/android-release.sh houzzat          # AAB (Play default)
#   scripts/android-release.sh houzzat aab
#   scripts/android-release.sh houzzat apk      # also signed APK
#   scripts/android-release.sh houzzat both
#
# Requires:
#   - JDK 17–21
#   - android/keystore.properties + storeFile (gitignored)
# Does NOT upload to Play Console.
#
# Play Store prefers the .aab from bundleRelease.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
ARTIFACT="${2:-aab}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <houzzat|pro> [aab|apk|both]" >&2
  exit 2
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in \
    "$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  do
    if [[ -x "$candidate/bin/java" ]]; then
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

PROPS="$DIR/keystore.properties"
if [[ ! -f "$PROPS" ]]; then
  echo "ERROR: missing $PROPS (gitignored). Create it with storeFile/storePassword/keyAlias/keyPassword." >&2
  exit 1
fi

STORE_FILE_REL="$(
  # shellcheck disable=SC1090
  grep -E '^storeFile=' "$PROPS" | head -1 | cut -d= -f2-
)"
if [[ -z "$STORE_FILE_REL" ]]; then
  echo "ERROR: storeFile missing in $PROPS" >&2
  exit 1
fi
STORE_FILE="$DIR/$STORE_FILE_REL"
if [[ ! -f "$STORE_FILE" ]]; then
  echo "ERROR: keystore not found at $STORE_FILE" >&2
  exit 1
fi

case "$ARTIFACT" in
  aab|apk|both) ;;
  *)
    echo "ERROR: artifact must be aab|apk|both (got '$ARTIFACT')" >&2
    exit 2
    ;;
esac

echo "→ syncing Capacitor ($ASSERT) before Android release build"
if [[ "$ASSERT" == "pro" && -n "${HOUZZAT_CAP_PRO_SERVER_URL:-}" ]]; then
  echo "→ HOUZZAT_CAP_PRO_SERVER_URL=$HOUZZAT_CAP_PRO_SERVER_URL"
fi
bash "$ROOT/scripts/cap-target.sh" "$ASSERT" sync

if [[ "$ASSERT" == "pro" ]]; then
  PRO_CAP_CONFIG="$DIR/app/src/main/assets/capacitor.config.json"
  if [[ -f "$PRO_CAP_CONFIG" ]]; then
    EMBEDDED_URL="$(
      python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("server",{}).get("url",""))' \
        "$PRO_CAP_CONFIG"
    )"
    echo "→ embedded pro server.url: $EMBEDDED_URL"
    if [[ -n "${HOUZZAT_CAP_PRO_SERVER_URL:-}" && "$EMBEDDED_URL" != "$HOUZZAT_CAP_PRO_SERVER_URL" ]]; then
      echo "ERROR: embedded server.url='$EMBEDDED_URL' != HOUZZAT_CAP_PRO_SERVER_URL='$HOUZZAT_CAP_PRO_SERVER_URL'" >&2
      echo "ERROR: cap sync did not embed the requested cold-start origin — aborting release build." >&2
      exit 1
    fi
    if [[ -z "${HOUZZAT_CAP_PRO_SERVER_URL:-}" && "$EMBEDDED_URL" != "https://app.houzzatpro.com/pro" ]]; then
      echo "ERROR: production pro release requires server.url=https://app.houzzatpro.com/pro (got '$EMBEDDED_URL')" >&2
      echo "ERROR: set HOUZZAT_CAP_PRO_SERVER_URL only for explicit dev/QA overrides." >&2
      echo "ERROR: do not embed tenant hosts (houzzat.com, tenant-canary.*, etc.)." >&2
      exit 1
    fi
    # Fail-fast: never ship a production AAB that cold-starts on a tenant host.
    if [[ "$EMBEDDED_URL" == *"tenant-canary"* ]] || [[ "$EMBEDDED_URL" == "https://houzzat.com/pro" ]] || [[ "$EMBEDDED_URL" == "https://houzzat.com/pro/" ]]; then
      echo "ERROR: embedded server.url='$EMBEDDED_URL' is a tenant host — refuse release" >&2
      exit 1
    fi
    if [[ "$EMBEDDED_URL" == "https://houzzatpro.com/pro" ]] || [[ "$EMBEDDED_URL" == "https://www.houzzatpro.com/pro" ]]; then
      echo "ERROR: embedded server.url='$EMBEDDED_URL' is sales apex — use https://app.houzzatpro.com/pro" >&2
      exit 1
    fi
  fi
fi

GRADLE_TASKS=()
if [[ "$ARTIFACT" == "aab" || "$ARTIFACT" == "both" ]]; then
  GRADLE_TASKS+=(bundleRelease)
fi
if [[ "$ARTIFACT" == "apk" || "$ARTIFACT" == "both" ]]; then
  GRADLE_TASKS+=(assembleRelease)
fi

echo "→ ./gradlew ${GRADLE_TASKS[*]} in $DIR (JAVA_HOME=$JAVA_HOME)"
(
  cd "$DIR"
  ./gradlew "${GRADLE_TASKS[@]}" --no-daemon
)

AAPT="$(ls "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort | tail -1 || true)"
APKSIGNER="$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort | tail -1 || true)"

verify_apk() {
  local apk="$1"
  if [[ ! -f "$apk" ]]; then
    echo "ERROR: missing $apk" >&2
    exit 1
  fi
  if [[ -n "$AAPT" ]]; then
    local pkg
    pkg="$("$AAPT" dump badging "$apk" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)"
    if [[ "$pkg" != "$EXPECT_ID" ]]; then
      echo "ERROR: APK package='$pkg' (expected $EXPECT_ID)" >&2
      exit 1
    fi
    echo "OK    APK package $pkg"
  fi
  if [[ -n "$APKSIGNER" ]]; then
    "$APKSIGNER" verify --verbose "$apk" >/dev/null
    echo "OK    APK signature verified"
  fi
  local tmpdir
  tmpdir="$(mktemp -d)"
  unzip -qo "$apk" assets/capacitor.config.json -d "$tmpdir"
  if ! grep -F -q "\"appId\": \"$EXPECT_ID\"" "$tmpdir/assets/capacitor.config.json"; then
    echo "ERROR: APK embedded appId mismatch" >&2
    exit 1
  fi
  if ! grep -F -q "$EXPECT_UA" "$tmpdir/assets/capacitor.config.json"; then
    echo "ERROR: APK missing UA marker $EXPECT_UA" >&2
    exit 1
  fi
  rm -rf "$tmpdir"
}

if [[ "$ARTIFACT" == "aab" || "$ARTIFACT" == "both" ]]; then
  AAB="$DIR/app/build/outputs/bundle/release/app-release.aab"
  if [[ ! -f "$AAB" ]]; then
    echo "ERROR: missing $AAB" >&2
    exit 1
  fi
  echo "→ Play Store AAB ready: $AAB"
  echo "  Upload this file in Play Console → Production / Testing → Create release"
fi

if [[ "$ARTIFACT" == "apk" || "$ARTIFACT" == "both" ]]; then
  APK="$DIR/app/build/outputs/apk/release/app-release.apk"
  verify_apk "$APK"
  echo "→ signed release APK ready: $APK"
fi

VERSION_LINE="$(grep -E 'version(Code|Name)' "$DIR/app/build.gradle" | tr -s ' ')"
echo "→ version:"
echo "$VERSION_LINE"

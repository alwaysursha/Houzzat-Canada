#!/usr/bin/env bash
# Build a DEBUG APK for the PRIVATE HouzzatPRO prototype
# (com.houzzat.pro.private). Does NOT touch android-pro / production.
#
# Usage:
#   bash scripts/android-debug-pro-private.sh
#
# Uses local-APFS buildDir redirect to avoid T7 AppleDouble AAPT failures.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DIR="$ROOT/android-pro-private"
EXPECT_ID="com.houzzat.pro.private"
EXPECT_UA="HouzzatNative/1 (com.houzzat.pro) HouzzatProPrivateUI/1"
EXPECT_URL="https://app.houzzatpro.com/pro/sign-in"

if [[ ! -d "$DIR" ]]; then
  echo "ERROR: missing $DIR" >&2
  exit 1
fi

# Refuse to mutate production PRO tree.
if grep -q 'applicationId "com.houzzat.pro.private"' "$ROOT/android-pro/app/build.gradle"; then
  echo "ERROR: production android-pro was altered — abort" >&2
  exit 1
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

export COPYFILE_DISABLE=1
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Refresh embedded Capacitor identity (no cap sync into production trees).
python3 - <<'PY'
import json
from pathlib import Path
p = Path("android-pro-private/app/src/main/assets/capacitor.config.json")
cfg = json.loads(p.read_text())
assert cfg["appId"] == "com.houzzat.pro.private"
assert cfg["appendUserAgent"] == "HouzzatNative/1 (com.houzzat.pro) HouzzatProPrivateUI/1", cfg.get("appendUserAgent")
assert cfg["server"]["url"] == "https://app.houzzatpro.com/pro/sign-in"
print("OK capacitor.config.json", cfg["appId"], cfg["appendUserAgent"], cfg["server"]["url"])
PY

LOCAL_BUILD="${TMPDIR:-/tmp}/houzzat-pro-private-debug-build"
INIT_SCRIPT="${TMPDIR:-/tmp}/houzzat-redirect-builddir.gradle"
rm -rf "$LOCAL_BUILD"
mkdir -p "$LOCAL_BUILD"

cat > "$INIT_SCRIPT" <<'EOF'
gradle.projectsLoaded {
  def root = System.getenv("HOUZZAT_LOCAL_BUILD_ROOT")
  if (root == null || root.isEmpty()) {
    throw new GradleException("HOUZZAT_LOCAL_BUILD_ROOT is required")
  }
  rootProject.allprojects { project ->
    def safe = project.path.replaceAll(':', '_')
    if (safe == '_') safe = 'root'
    project.buildDir = new File(root, safe)
  }
}
EOF

# Clean regenerable poisoned builds on T7 for this private tree only
rm -rf "$DIR/app/build" "$DIR/build" "$DIR/capacitor-cordova-android-plugins/build"

export HOUZZAT_LOCAL_BUILD_ROOT="$LOCAL_BUILD"
echo "→ ./gradlew assembleDebug in $DIR (local buildDir)"
(
  cd "$DIR"
  ./gradlew assembleDebug --no-daemon --init-script "$INIT_SCRIPT"
)

APK_LOCAL="$(find "$LOCAL_BUILD" -path '*/outputs/apk/debug/*.apk' | head -1)"
if [[ -z "$APK_LOCAL" || ! -f "$APK_LOCAL" ]]; then
  echo "ERROR: debug APK not found under $LOCAL_BUILD" >&2
  exit 1
fi

mkdir -p "$DIR/app/build/outputs/apk/debug"
cp -f "$APK_LOCAL" "$DIR/app/build/outputs/apk/debug/app-debug.apk"
APK="$DIR/app/build/outputs/apk/debug/app-debug.apk"

AAPT="$(ls "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$AAPT" ]]; then
  pkg="$("$AAPT" dump badging "$APK" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)"
  if [[ "$pkg" != "$EXPECT_ID" ]]; then
    echo "ERROR: APK package='$pkg' (expected $EXPECT_ID)" >&2
    exit 1
  fi
  echo "OK    APK package $pkg"
fi

tmpdir="$(mktemp -d)"
unzip -qo "$APK" assets/capacitor.config.json -d "$tmpdir"
python3 - <<PY
import json,sys
c=json.load(open("$tmpdir/assets/capacitor.config.json"))
assert c.get("appId")=="$EXPECT_ID", c.get("appId")
assert c.get("appendUserAgent")=="$EXPECT_UA", c.get("appendUserAgent")
assert c.get("server",{}).get("url")=="$EXPECT_URL", c.get("server")
print("OK    embedded", c["appId"], c["appendUserAgent"], c["server"]["url"])
PY
rm -rf "$tmpdir"

echo "→ private debug APK ready: $APK"
echo "  install: adb install -r \"$APK\""
echo "  (production com.houzzat.pro is untouched)"

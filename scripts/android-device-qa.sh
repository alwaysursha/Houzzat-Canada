#!/usr/bin/env bash
# Android device QA for Houzzat + HouzzatPro — single long-lived session.
set -u
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
SERIAL="${ANDROID_SERIAL:-emulator-5554}"
OUT="${DEVICE_QA_OUT:-/tmp/device-qa}"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.txt"
: > "$REPORT"
log() { echo "$@" | tee -a "$REPORT"; }
ashell() { adb -s "$SERIAL" "$@"; }

pkill -9 -f 'qemu-system' 2>/dev/null || true
pkill -9 -f 'emulator -avd' 2>/dev/null || true
sleep 2

log "=== START EMULATOR ==="
"$ANDROID_HOME/emulator/emulator" -avd Pixel_7 \
  -netdelay none -netspeed full -no-snapshot-load -no-snapshot-save \
  -gpu swiftshader_indirect -no-audio -no-boot-anim \
  > /tmp/emu-pixel7.log 2>&1 &
EMUPID=$!
log "EMUPID=$EMUPID"
echo "$EMUPID" > /tmp/emu.pid
adb wait-for-device
READY=0
for i in $(seq 1 120); do
  state=$(adb get-state 2>/dev/null || echo none)
  boot=$(ashell shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  [[ "$state" == "device" && "$boot" == "1" ]] && { READY=1; log "READY i=$i"; break; }
  kill -0 "$EMUPID" 2>/dev/null || { log EMU_DIED; exit 1; }
  sleep 3
done
[[ "$READY" == "1" ]] || { log BOOT_TIMEOUT; exit 1; }

log "=== INSTALL ==="
ashell install -r /Users/ali/Projects/teamalisyedrealestate/android/app/build/outputs/apk/debug/app-debug.apk | tee -a "$REPORT"
ashell install -r /Users/ali/Projects/teamalisyedrealestate/android-pro/app/build/outputs/apk/debug/app-debug.apk | tee -a "$REPORT"
ashell shell pm list packages | rg houzzat | tee -a "$REPORT"

AAPT=$(ls "$ANDROID_HOME"/build-tools/*/aapt | sort | tail -1)
CAPP=$(ashell shell pm path com.houzzat.app | tr -d '\r' | sed 's/package://')
PAPP=$(ashell shell pm path com.houzzat.pro | tr -d '\r' | sed 's/package://')
ashell pull "$CAPP" "$OUT/houzzat.apk" >/dev/null
ashell pull "$PAPP" "$OUT/houzzatpro.apk" >/dev/null
log "=== IDENTITIES ==="
"$AAPT" dump badging "$OUT/houzzat.apk" | rg "package:|application-label:" | tee -a "$REPORT"
"$AAPT" dump badging "$OUT/houzzatpro.apk" | rg "package:|application-label:" | tee -a "$REPORT"
rm -rf "$OUT/cfg-c" "$OUT/cfg-p"; mkdir -p "$OUT/cfg-c" "$OUT/cfg-p"
unzip -qo "$OUT/houzzat.apk" assets/capacitor.config.json -d "$OUT/cfg-c"
unzip -qo "$OUT/houzzatpro.apk" assets/capacitor.config.json -d "$OUT/cfg-p"
python3 - <<PY | tee -a "$REPORT"
import json
for n,p in [("consumer","$OUT/cfg-c/assets/capacitor.config.json"),("pro","$OUT/cfg-p/assets/capacitor.config.json")]:
  c=json.load(open(p)); print(n, c["appId"], c["appendUserAgent"], c["server"]["url"])
PY

# Permissions before launch
for pkg in com.houzzat.app com.houzzat.pro; do
  ashell shell pm grant "$pkg" android.permission.ACCESS_FINE_LOCATION || true
  ashell shell pm grant "$pkg" android.permission.ACCESS_COARSE_LOCATION || true
done
ashell shell settings put global window_animation_scale 0
ashell shell settings put global transition_animation_scale 0
ashell shell settings put global animator_duration_scale 0
ashell shell input keyevent KEYCODE_WAKEUP
ashell shell wm dismiss-keyguard || true
python3 -m pip install --quiet websockets >/dev/null 2>&1 || true

forward_cdp() {
  local pkg="$1" port="$2"
  local pid=""
  for _ in $(seq 1 40); do
    pid=$(ashell shell pidof "$pkg" | tr -d '\r' | awk '{print $1}')
    [[ -n "${pid:-}" ]] && break
    sleep 1
  done
  [[ -z "${pid:-}" ]] && { echo "NO_PID $pkg"; return 1; }
  echo "pid=$pid"
  adb forward --remove "tcp:$port" >/dev/null 2>&1 || true
  adb forward "tcp:$port" "localabstract:webview_devtools_remote_$pid"
  # wait for CDP tabs
  for _ in $(seq 1 30); do
    if python3 - "$port" <<'PY' 2>/dev/null
import json,sys,urllib.request
tabs=json.load(urllib.request.urlopen(f"http://127.0.0.1:{sys.argv[1]}/json", timeout=2))
raise SystemExit(0 if tabs else 1)
PY
    then return 0; fi
    sleep 1
  done
  echo "NO_TABS_YET"
  return 1
}

cdp_eval() {
  local port="$1" expr="$2"
  python3 - "$port" "$expr" <<'PY'
import json,sys,urllib.request,asyncio,websockets
port,expr=sys.argv[1],sys.argv[2]
tabs=json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=10))
ws=tabs[0]["webSocketDebuggerUrl"]
async def main():
  async with websockets.connect(ws, open_timeout=10) as s:
    await s.send(json.dumps({"id":1,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True,"awaitPromise":True}}))
    while True:
      msg=json.loads(await asyncio.wait_for(s.recv(), timeout=25))
      if msg.get("id")==1:
        val=msg.get("result",{}).get("result",{}).get("value")
        print(val if val is not None else msg)
        break
asyncio.run(main())
PY
}

cdp_nav() {
  local port="$1" url="$2"
  python3 - "$port" "$url" <<'PY'
import json,sys,urllib.request,asyncio,websockets
port,url=sys.argv[1],sys.argv[2]
tabs=json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=10))
ws=tabs[0]["webSocketDebuggerUrl"]
async def main():
  async with websockets.connect(ws, open_timeout=10) as s:
    await s.send(json.dumps({"id":1,"method":"Page.enable"}))
    await s.send(json.dumps({"id":2,"method":"Page.navigate","params":{"url":url}}))
    await asyncio.sleep(5)
    await s.send(json.dumps({"id":3,"method":"Runtime.evaluate","params":{"expression":"location.href","returnByValue":True}}))
    while True:
      msg=json.loads(await asyncio.wait_for(s.recv(), timeout=25))
      if msg.get("id")==3:
        print(msg.get("result",{}).get("result",{}).get("value"))
        break
asyncio.run(main())
PY
}

log "=== CONSUMER COLD ==="
ashell shell am force-stop com.houzzat.app || true
ashell shell am force-stop com.houzzat.pro || true
sleep 1
T0=$(python3 -c 'import time;print(time.time())')
ashell shell am start -W -n com.houzzat.app/.MainActivity | tee -a "$REPORT"
sleep 8
T1=$(python3 -c 'import time;print(time.time())')
log "consumer_cold_s=$(python3 -c "print(round($T1-$T0,2))")"
ashell exec-out screencap -p > "$OUT/01-houzzat-cold.png"
forward_cdp com.houzzat.app 9222
UA=$(cdp_eval 9222 'navigator.userAgent' || true)
log "consumer_ua=$UA"
echo "$UA" > "$OUT/consumer-ua.txt"
if echo "$UA" | rg -q 'HouzzatNative/1 \(com.houzzat.app\)'; then log CONSUMER_UA_OK; else log CONSUMER_UA_FAIL; fi

log "=== CONSUMER NAV ==="
for path in / /search /account; do
  T0=$(python3 -c 'import time;print(time.time())')
  href=$(cdp_nav 9222 "https://houzzat.com$path" || true)
  T1=$(python3 -c 'import time;print(time.time())')
  dims=$(cdp_eval 9222 'document.documentElement.scrollWidth+"x"+document.documentElement.clientWidth' || true)
  bottom=$(cdp_eval 9222 'document.documentElement.dataset.mobileBottomNav||""' || true)
  log "consumer_nav path=$path href=$href dims=$dims bottomNav=$bottom s=$(python3 -c "print(round($T1-$T0,2))")"
  ashell exec-out screencap -p > "$OUT/consumer-${path//\//_}.png"
done
# overflow
ov=$(cdp_eval 9222 'document.documentElement.scrollWidth > document.documentElement.clientWidth + 1' || true)
log "consumer_overflow=$ov"
# Back from account
ashell shell input keyevent KEYCODE_BACK; sleep 2
log "consumer_after_back=$(cdp_eval 9222 'location.href' || true)"
ashell exec-out screencap -p > "$OUT/consumer-after-back.png"
# Home/resume
ashell shell input keyevent KEYCODE_HOME; sleep 2
ashell shell am start -n com.houzzat.app/.MainActivity; sleep 4
ashell exec-out screencap -p > "$OUT/consumer-resume.png"
forward_cdp com.houzzat.app 9222
log "consumer_resume_ua=$(cdp_eval 9222 'navigator.userAgent' || true)"
# Separate cookie marker
cdp_eval 9222 'document.cookie="qa_shell=consumer; path=/"' >/dev/null || true
log "consumer_cookie=$(cdp_eval 9222 'document.cookie' || true)"

log "=== PRO COLD ==="
ashell shell am force-stop com.houzzat.app || true
ashell shell am force-stop com.houzzat.pro || true
sleep 1
T0=$(python3 -c 'import time;print(time.time())')
ashell shell am start -W -n com.houzzat.pro/.MainActivity | tee -a "$REPORT"
sleep 8
T1=$(python3 -c 'import time;print(time.time())')
log "pro_cold_s=$(python3 -c "print(round($T1-$T0,2))")"
ashell exec-out screencap -p > "$OUT/06-pro-cold.png"
forward_cdp com.houzzat.pro 9223
UA=$(cdp_eval 9223 'navigator.userAgent' || true)
log "pro_ua=$UA"
echo "$UA" > "$OUT/pro-ua.txt"
if echo "$UA" | rg -q 'HouzzatNative/1 \(com.houzzat.pro\)'; then log PRO_UA_OK; else log PRO_UA_FAIL; fi
log "pro_href=$(cdp_eval 9223 'location.href' || true)"
log "pro_bottomNav=$(cdp_eval 9223 'document.documentElement.dataset.mobileBottomNav||\"\"' || true)"
log "pro_has_consumer_cookie=$(cdp_eval 9223 'document.cookie.includes(\"qa_shell=consumer\")' || true)"

# Startup: signed-out /pro should go sign-in (middleware) once page requests with UA
cdp_nav 9223 "https://houzzat.com/pro" | tee -a "$REPORT" || true
sleep 2
log "pro_startup_href=$(cdp_eval 9223 'location.href' || true)"
ashell exec-out screencap -p > "$OUT/pro-signedout.png"

# Guest staff routes
for path in /admin /agent /pro/for-staff; do
  href=$(cdp_nav 9223 "https://houzzat.com$path" || true)
  log "pro_guest path=$path href=$href"
  ashell exec-out screencap -p > "$OUT/pro-guest-${path//\//_}.png"
done
text=$(cdp_eval 9223 'document.body.innerText.slice(0,300)' || true)
log "pro_for_staff_text=$text"

# Admin/Agent switch timings as guest (redirect only)
T0=$(python3 -c 'import time;print(time.time())')
cdp_nav 9223 "https://houzzat.com/admin" >/dev/null || true
T1=$(python3 -c 'import time;print(time.time())')
log "pro_guest_admin_redirect_s=$(python3 -c "print(round($T1-$T0,2))")"

# Resume
ashell shell input keyevent KEYCODE_HOME; sleep 2
ashell shell am start -n com.houzzat.pro/.MainActivity; sleep 4
ashell exec-out screencap -p > "$OUT/pro-resume.png"
forward_cdp com.houzzat.pro 9223
log "pro_resume_href=$(cdp_eval 9223 'location.href' || true)"

# Back spam — app should remain
ashell shell input keyevent KEYCODE_BACK; sleep 1
ashell shell input keyevent KEYCODE_BACK; sleep 1
ashell shell input keyevent KEYCODE_BACK; sleep 1
log "pro_alive_after_backs=$(ashell shell pidof com.houzzat.pro | tr -d '\r')"
ashell exec-out screencap -p > "$OUT/pro-back-spam.png"

# Biometrics availability probe (no enrolled prints expected on emu)
log "=== BIOMETRIC PROBE ==="
ashell shell dumpsys biometric | rg -i 'BiometricStatus|finger|face|Error' | head -20 | tee -a "$REPORT" || true
# Preferences key read via CDP is not available; logcat already showed Preferences get

log "=== FINAL COEXIST ==="
ashell shell pm list packages | rg houzzat | tee -a "$REPORT"
ls -lah "$OUT"/*.png | tee -a "$REPORT"
log "ALL_DEVICE_STEPS_DONE"
log "NOTE_AUTH_STAFF: production seed credentials unavailable; ADMIN/AGENT signed-in dashboard matrix NOT VERIFIED on device"
log "NOTE_IOS: NOT VERIFIED — full Xcode unavailable"
log "NOTE_BIOMETRIC_UNLOCK: emulator has no enrolled biometrics — unlock flow NOT VERIFIED"
log "NOTE_OVERLAY_BACK: CRM drawer/modal/listing sheet Back priority NOT VERIFIED without signed-in staff session"

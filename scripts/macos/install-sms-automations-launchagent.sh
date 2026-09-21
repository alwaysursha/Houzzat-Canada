#!/usr/bin/env bash
# Install (or reinstall) the Houzzat SMS automations LaunchAgent on this Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$ROOT/scripts/macos/com.houzzat.sms-automations.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.houzzat.sms-automations.plist"
LABEL="com.houzzat.sms-automations"
RUN_SH="$ROOT/scripts/run-sms-automations-mac.sh"

NODE_BIN="$(command -v node || true)"
if [[ -x "$HOME/.nvm/versions/node/v22.17.0/bin/node" ]]; then
  NODE_BIN="$HOME/.nvm/versions/node/v22.17.0/bin/node"
fi
NODE_DIR="$(dirname "${NODE_BIN:-/usr/bin}")"

chmod +x "$RUN_SH" "$ROOT/scripts/macos/install-sms-automations-launchagent.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

cat >"$RUN_SH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ROOT="\$(cd "\$(dirname "\$0")/.." && pwd)"
cd "\$ROOT"

LOG_DIR="\$ROOT/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/sms-automations.log"
LOCK_DIR="\${TMPDIR:-/tmp}/houzzat-sms-automations.lock"

export PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

{
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') sms-automations start ====="
  if ! mkdir "\$LOCK_DIR" 2>/dev/null; then
    echo "SKIP: another sms-automations run is already running"
  else
    trap 'rmdir "\$LOCK_DIR" 2>/dev/null || true' EXIT
    pnpm sms-automations:run
  fi
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') sms-automations done ====="
} >>"\$LOG_FILE" 2>&1
EOF
chmod +x "$RUN_SH"

sed "s|__HOZZAT_ROOT__|$ROOT|g" "$PLIST_SRC" >"$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST_DST" 2>/dev/null || true
if launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null; then
  echo "Loaded via launchctl bootstrap: $LABEL"
else
  launchctl load "$PLIST_DST"
  echo "Loaded via launchctl load: $LABEL"
fi

echo
echo "Project:  $ROOT"
echo "Schedule: daily 07:00 (this Mac's timezone)"
echo "Set timezone to America/Toronto in System Settings → Date & Time."
echo
echo "This agent is installed but does not run at load."
echo "The next fire is 07:00 local. Do not kickstart unless you intend to"
echo "run the 14-day inactivity SMS job against production."
echo
echo "Logs:"
echo "  $ROOT/logs/sms-automations.log"

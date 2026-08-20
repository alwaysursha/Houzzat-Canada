#!/usr/bin/env bash
# Install (or reinstall) the Houzzat monitors LaunchAgent on this Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$ROOT/scripts/macos/com.houzzat.monitors.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.houzzat.monitors.plist"
LABEL="com.houzzat.monitors"
RUN_SH="$ROOT/scripts/run-monitors-mac.sh"

NODE_BIN="$(command -v node || true)"
if [[ -x "$HOME/.nvm/versions/node/v22.17.0/bin/node" ]]; then
  NODE_BIN="$HOME/.nvm/versions/node/v22.17.0/bin/node"
fi
NODE_DIR="$(dirname "${NODE_BIN:-/usr/bin}")"

chmod +x "$RUN_SH" "$ROOT/scripts/macos/install-monitors-launchagent.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

cat >"$RUN_SH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ROOT="\$(cd "\$(dirname "\$0")/.." && pwd)"
cd "\$ROOT"

LOG_DIR="\$ROOT/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/monitors.log"

export PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

{
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') monitors start ====="
  pnpm monitors:run
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') monitors done ====="
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
echo "Schedule: every 10 minutes"
echo "Test now:"
echo "  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Or:"
echo "  $RUN_SH"
echo "Logs:"
echo "  $ROOT/logs/monitors.log"

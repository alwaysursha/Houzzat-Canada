#!/usr/bin/env bash
# Install (or reinstall) the Houzzat digests LaunchAgent on this Mac.
# Works from any clone path (e.g. ~/Houzzat-Canada or ~/Projects/teamalisyedrealestate).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$ROOT/scripts/macos/com.houzzat.digests.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.houzzat.digests.plist"
LABEL="com.houzzat.digests"
RUN_SH="$ROOT/scripts/run-digests-mac.sh"

# Prefer this machine's nvm node if present; otherwise keep whatever is on PATH.
NODE_BIN="$(command -v node || true)"
if [[ -x "$HOME/.nvm/versions/node/v22.17.0/bin/node" ]]; then
  NODE_BIN="$HOME/.nvm/versions/node/v22.17.0/bin/node"
fi
NODE_DIR="$(dirname "${NODE_BIN:-/usr/bin}")"

chmod +x "$RUN_SH" "$ROOT/scripts/macos/install-digests-launchagent.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

# Ensure the runner uses a PATH that works under launchd.
if ! grep -q 'HOZZAT_NODE_DIR' "$RUN_SH" 2>/dev/null; then
  :
fi

# Rewrite runner PATH line to include detected node dir (idempotent-ish).
# Keep script simple: export PATH with NODE_DIR first.
cat >"$RUN_SH" <<EOF
#!/usr/bin/env bash
# Daily digests on an always-on Mac (launchd / cron).
set -euo pipefail

ROOT="$(cd "\$(dirname "\$0")/.." && pwd)"
cd "\$ROOT"

LOG_DIR="\$ROOT/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/digests.log"

export PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

{
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') digests start ====="
  pnpm digests:run
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') digests done ====="
} >>"\$LOG_FILE" 2>&1
EOF
chmod +x "$RUN_SH"

# Fill project path into the plist for this Mac.
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
echo "Schedule: daily 06:00 (this Mac's timezone)"
echo "Set timezone to America/Toronto in System Settings → Date & Time."
echo
echo "Test now:"
echo "  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Or:"
echo "  $RUN_SH"
echo "Logs:"
echo "  $ROOT/logs/digests.log"

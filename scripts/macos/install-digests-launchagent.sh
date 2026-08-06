#!/usr/bin/env bash
# Install (or reinstall) the Houzzat digests LaunchAgent on this Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$ROOT/scripts/macos/com.houzzat.digests.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.houzzat.digests.plist"
LABEL="com.houzzat.digests"

chmod +x "$ROOT/scripts/run-digests-mac.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

cp "$PLIST_SRC" "$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST_DST" 2>/dev/null || true
if launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null; then
  echo "Loaded via launchctl bootstrap: $LABEL"
else
  launchctl load "$PLIST_DST"
  echo "Loaded via launchctl load: $LABEL"
fi

echo
echo "Scheduled daily at 06:00 (Mac local timezone)."
echo "Ensure Date & Time zone is America/Toronto."
echo "Test now:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Or:        $ROOT/scripts/run-digests-mac.sh"
echo "Logs:      $ROOT/logs/digests.log"

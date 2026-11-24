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

# The installed runner POSTs the deployed cron. It does not render from the
# checkout unless DIGEST_CRON_URL=local. A stale tree omitted agent email
# and designation on the November 24, 2026 production digests.
cat >"$RUN_SH" <<EOF
#!/usr/bin/env bash
# Daily digests on an always-on Mac (launchd / cron).
set -euo pipefail

ROOT="\$(cd "\$(dirname "\$0")/.." && pwd)"
cd "\$ROOT"

LOG_DIR="\$ROOT/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/digests.log"

export PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"

read_env_value() {
  local key="\$1"
  local file="\$2"
  local line=""
  [[ -f "\$file" ]] || return 0
  line="\$(grep -E "^\${key}=" "\$file" | tail -n 1 || true)"
  line="\${line#*=}"
  line="\${line%\"}"
  line="\${line#\"}"
  line="\${line%\'}"
  line="\${line#\'}"
  printf '%s' "\$line"
}

{
  echo "===== \$(date -u '+%Y-%m-%dT%H:%M:%SZ') digests start ====="
  URL="\${DIGEST_CRON_URL:-\$(read_env_value DIGEST_CRON_URL .env.local)}"
  SECRET="\${DIGEST_CRON_SECRET:-\${CRON_SECRET:-}}"
  if [[ -z "\$SECRET" ]]; then
    SECRET="\$(read_env_value DIGEST_CRON_SECRET .env.local)"
  fi
  if [[ -z "\$SECRET" ]]; then
    SECRET="\$(read_env_value CRON_SECRET .env.local)"
  fi
  if [[ -z "\$URL" ]]; then
    URL="https://houzzat.com/api/cron/digests"
  fi

  if [[ "\$URL" == "local" ]]; then
    echo "DIGEST_CRON_URL=local; rendering from this checkout"
    pnpm digests:run
  elif [[ -z "\$SECRET" ]]; then
    echo "Missing DIGEST_CRON_SECRET; refusing to render digests from this checkout."
    exit 1
  else
    echo "POST deployed digest cron"
    curl -fsS -X POST "\$URL" \\
      -H "Authorization: Bearer \${SECRET}" \\
      -H "Content-Type: application/json" \\
      -d '{}'
    echo
  fi
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

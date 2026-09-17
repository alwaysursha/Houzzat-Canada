#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# macOS / exFAT (T7) writes AppleDouble sidecars (`._page.js`, `._route.js`).
# OpenNext treats those as routes because it matches `endsWith("page.js")`.
export COPYFILE_DISABLE=1

strip_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  find "$dir" \( -name '._*' -o -name '.DS_Store' \) -exec rm -rf {} + 2>/dev/null || true
}

strip_dir src
strip_dir prisma
strip_dir scripts
strip_dir public
strip_dir .next
strip_dir .open-next

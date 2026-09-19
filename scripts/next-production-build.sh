#!/usr/bin/env bash
# Production Next compile.
# Vercel default machines are 8 GB; webpack workers SIGKILL there.
# Cloudflare/OpenNext still needs `next build --webpack`.
set -euo pipefail
cd "$(dirname "$0")/.."

export COPYFILE_DISABLE=1

if [[ -n "${VERCEL:-}" ]]; then
  exec pnpm exec next build
fi

exec pnpm exec next build --webpack

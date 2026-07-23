#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true

ulimit -n 10240 2>/dev/null || true

for p in 3000 3001 3002 3003; do
  lsof -ti :"$p" | xargs kill -9 2>/dev/null || true
done
sleep 1

rm -rf .next

echo "→ Starting local database..."
if ! pnpm exec prisma dev start houzzat -d 2>/dev/null; then
  echo "  Prisma dev unavailable — using local PostgreSQL on :5432"
  psql -h localhost -p 5432 -d postgres -c "CREATE DATABASE houzzat;" 2>/dev/null || true
fi
sleep 1

if [[ ! -f .env.local && ! -f .env ]]; then
  echo "⚠ No .env.local found. Copy .env.example → .env.local and set DATABASE_URL + AUTH_SECRET."
fi

echo "→ Syncing schema..."
if pnpm db:push; then
  echo "  Schema synced."
  pnpm db:seed || true
else
  echo "⚠ Database not reachable. Set DATABASE_URL then run: pnpm db:push && pnpm db:seed"
fi

echo ""
echo "→ Starting Next.js at http://127.0.0.1:3000"
echo "  Seed passwords: password123"
echo "  admin@houzzat.ca | agent@houzzat.ca | customer@houzzat.ca"
echo ""

export WATCHPACK_POLLING=true
exec pnpm exec next dev --hostname 127.0.0.1 --webpack

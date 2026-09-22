/**
 * Fast/Full filesystem lock overlap tests. Spawns bash against
 * scripts/mac-mls-lock.sh only. Does not run MLS sync.
 * Run: pnpm mls:sync-lock:selftest
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "scripts/mac-mls-lock.sh");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function runBash(script: string, label: string) {
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, LIB: lib },
    timeout: 20_000,
  });
  if (result.status !== 0) {
    console.error(`\n--- ${label} stdout ---\n${result.stdout}`);
    console.error(`--- ${label} stderr ---\n${result.stderr}`);
  }
  assert.equal(result.status, 0, label);
  return result.stdout;
}

const prelude = `
set -euo pipefail
base="$(mktemp -d)"
FAST="$base/houzzat-mls-fast-sync.lock"
FULL="$base/houzzat-mls-sync.lock"
cleanup() {
  if [[ -f "$base/holder.pid" ]]; then
    kill "$(cat "$base/holder.pid")" 2>/dev/null || true
  fi
  rm -rf "$base"
}
trap cleanup EXIT
source "$LIB"
sh -c 'echo $PPID' >"$base/self.pid"
SELF="$(tr -d '[:space:]' <"$base/self.pid")"
`;

function main() {
  console.log("\n=== MLS SYNC LOCK SELFTEST ===\n");

  runBash(
    `${prelude}
mls_lock_acquire "$FAST" mls-fast-sync
set +e
out="$(bash -c 'source "$1"; if mls_lock_acquire "$2" mls-fast-sync; then exit 0; else exit 1; fi' _ "$LIB" "$FAST" 2>&1)"
rc=$?
set -e
[[ "$rc" -ne 0 ]]
echo "$out" | grep -q "SKIP: another mls-fast-sync is already running"
[[ -d "$FAST" ]]
echo PASS
`,
    "fast+fast",
  );
  console.log("[1] Fast + Fast same-job skip... PASS");

  runBash(
    `${prelude}
mls_lock_acquire "$FULL" mls-sync
set +e
out="$(bash -c 'source "$1"; if mls_lock_acquire "$2" mls-sync; then exit 0; else exit 1; fi' _ "$LIB" "$FULL" 2>&1)"
rc=$?
set -e
[[ "$rc" -ne 0 ]]
echo "$out" | grep -q "SKIP: another mls-sync is already running"
[[ -d "$FULL" ]]
echo PASS
`,
    "full+full",
  );
  console.log("[2] Full + Full same-job skip... PASS");

  runBash(
    `${prelude}
mls_lock_acquire "$FULL" mls-sync
set +e
out="$(bash -c 'source "$1"; mls_fast_prepare "$2" "$3"; echo rc=$?' _ "$LIB" "$FULL" "$FAST" 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 0 ]]
echo "$out" | grep -q "SKIP: full mls-sync is running"
echo "$out" | grep -q "rc=10"
[[ ! -d "$FAST" ]]
[[ -d "$FULL" ]]
echo PASS
`,
    "full-then-fast",
  );
  console.log("[3] Full running → Fast skips... PASS");

  const waited = runBash(
    `${prelude}
(
  source "$LIB"
  mls_lock_acquire "$FAST" mls-fast-sync
  sleep 2
  mls_lock_release "$FAST"
) &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -f "$FAST/pid" ]] && break
  sleep 0.1
done
[[ -f "$FAST/pid" ]]
export MLS_FULL_WAIT_FOR_FAST_SECONDS=8
export MLS_LOCK_POLL_SECONDS=1
set +e
out="$(mls_full_prepare "$FULL" "$FAST" 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 0 ]]
echo "$out" | grep -q "DEFER: waiting for mls-fast-sync"
[[ -d "$FULL" ]]
[[ ! -d "$FAST" ]]
echo "$out"
`,
    "fast-then-full-waits",
  );
  assert.match(waited, /DEFER: waiting for mls-fast-sync/);
  console.log("[4] Fast running → Full waits, then acquires... PASS");

  runBash(
    `${prelude}
(
  source "$LIB"
  mls_lock_acquire "$FAST" mls-fast-sync
  sh -c 'echo $PPID' >"$base/holder.pid"
  sleep 8
  mls_lock_release "$FAST"
) &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -f "$base/holder.pid" ]] && break
  sleep 0.1
done
holder="$(cat "$base/holder.pid")"
kill -0 "$holder"
export MLS_FULL_WAIT_FOR_FAST_SECONDS=1
export MLS_LOCK_POLL_SECONDS=1
set +e
out="$(mls_full_prepare "$FULL" "$FAST" 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 12 ]]
echo "$out" | grep -q "DEFER: waiting for mls-fast-sync"
echo "$out" | grep -q "SKIP: mls-fast-sync still running"
[[ ! -d "$FULL" ]]
[[ -d "$FAST" ]]
kill -0 "$holder"
echo PASS
`,
    "fast-then-full-defers",
  );
  console.log("[5] Fast still running after wait → Full defers without killing Fast... PASS");

  runBash(
    `${prelude}
mkdir "$FAST"
echo 99999999 >"$FAST/pid"
out="$(mls_lock_acquire "$FAST" mls-fast-sync 2>&1)"
echo "$out" | grep -q "STALE: mls-fast-sync lock"
echo "$out" | grep -q "RECOVERED: mls-fast-sync lock"
[[ "$(cat "$FAST/pid")" == "$SELF" ]]
echo PASS
`,
    "stale-pid",
  );
  console.log("[6] Dead pid lock is recovered... PASS");

  runBash(
    `${prelude}
mkdir "$FULL"
export MLS_LOCK_STALE_SECONDS=10800
if mls_lock_is_held "$FULL"; then
  :
else
  echo "fresh legacy lock should be held" >&2
  exit 1
fi
set +e
out="$(mls_fast_prepare "$FULL" "$FAST" 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 10 ]]
echo "$out" | grep -q "SKIP: full mls-sync is running (pid=missing)"
touch -t 202001010000 "$FULL"
export MLS_LOCK_STALE_SECONDS=60
if mls_lock_is_held "$FULL"; then
  echo "aged legacy lock should not be held" >&2
  exit 1
fi
out="$(mls_lock_acquire "$FULL" mls-sync 2>&1)"
echo "$out" | grep -q "RECOVERED: mls-sync lock"
[[ "$(cat "$FULL/pid")" == "$SELF" ]]
echo PASS
`,
    "legacy-stale",
  );
  console.log("[7] Pid-less lock is held while fresh and recovered when stale... PASS");

  runBash(
    `${prelude}
bash -c '
set -euo pipefail
source "$1"
dir="$2"
mls_lock_acquire "$dir" mls-fast-sync
trap "mls_lock_release \\"$dir\\"" EXIT
exit 0
' _ "$LIB" "$FAST"
[[ ! -d "$FAST" ]]
echo PASS
`,
    "normal-exit",
  );
  console.log("[8] Normal exit releases the lock... PASS");

  runBash(
    `${prelude}
set +e
bash -c '
set -euo pipefail
source "$1"
dir="$2"
mls_lock_acquire "$dir" mls-sync
trap "mls_lock_release \\"$dir\\"" EXIT
false
' _ "$LIB" "$FULL"
set -e
[[ ! -d "$FULL" ]]
echo PASS
`,
    "error-exit",
  );
  console.log("[9] Error exit releases the lock... PASS");

  runBash(
    `${prelude}
mls_lock_acquire "$FAST" mls-fast-sync
bash -c 'source "$1"; mls_lock_release "$2"' _ "$LIB" "$FAST"
[[ -d "$FAST" ]]
[[ "$(cat "$FAST/pid")" == "$SELF" ]]
echo PASS
`,
    "foreign-release",
  );
  console.log("[10] Another process cannot release a live lock... PASS");

  const fastSh = read("scripts/mac-mls-fast-sync.sh");
  const fullSh = read("scripts/mac-mls-sync.sh");
  const syncTs = read("src/lib/proptx/sync.ts");
  const fastPlist = read("scripts/mac/com.houzzat.mls-fast-sync.plist");
  const fullPlist = read("scripts/mac/com.houzzat.mls-sync.plist");

  assert.ok(fastSh.includes("export MLS_SYNC_MODE=fast"));
  assert.ok(!fastSh.includes("setCursor"));
  assert.ok(!fastSh.includes("getCursor"));
  assert.ok(!fullSh.includes("MLS_SYNC_MODE=fast"));
  assert.ok(fastSh.includes('mls_lock_release "$FAST_LOCK"'));
  assert.ok(fullSh.includes('mls_lock_release "$FULL_LOCK"'));
  assert.ok(fastSh.indexOf("mls_fast_prepare") < fastSh.indexOf("pnpm mls:sync --fast"));
  assert.ok(fullSh.indexOf("mls_full_prepare") < fullSh.indexOf("pnpm mls:sync "));
  assert.ok(
    syncTs.includes(
      'assertMlsSyncCursorAccess(activeMlsSyncMode, resource, "set")',
    ),
  );
  assert.ok(fastPlist.includes("<integer>600</integer>"));
  assert.ok(fullPlist.includes("<integer>3600</integer>"));
  assert.ok(!fastPlist.includes("<integer>3600</integer>"));
  console.log("[11] Property cursor and launchd cadence unchanged... PASS");

  console.log("\nMLS sync lock selftest: PASS\n");
}

main();

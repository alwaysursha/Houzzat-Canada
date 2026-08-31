/**
 * Stage 3K.5.33 — Selftest for Shell drawer route-change-only closure.
 * Run: pnpm shell-drawer-stability:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testAdminShellRouteChangeOnly() {
  const src = read("src/components/admin/AdminShell.tsx");
  assert.ok(src.includes("prevPathnameRef = useRef(pathname)"));
  assert.ok(src.includes("if (prevPathnameRef.current !== pathname)"));
  assert.ok(src.includes("prevPathnameRef.current = pathname;"));
  assert.ok(src.includes("setMobileOpen(false);"));
  // Ensure un-guarded useEffect(() => { setMobileOpen(false); }, [pathname]) is removed
  assert.ok(!src.includes(`useEffect(() => {\n    setMobileOpen(false);\n  }, [pathname]);`));
}

function testAgentShellRouteChangeOnly() {
  const src = read("src/components/agent/AgentShell.tsx");
  assert.ok(src.includes("prevPathnameRef = useRef(pathname)"));
  assert.ok(src.includes("if (prevPathnameRef.current !== pathname)"));
  assert.ok(src.includes("prevPathnameRef.current = pathname;"));
  assert.ok(src.includes("setMobileOpen(false);"));
  assert.ok(src.includes("setActivityOpen(false);"));
  // Ensure un-guarded useEffect is removed
  assert.ok(!src.includes(`useEffect(() => {\n    setMobileOpen(false);\n    setActivityOpen(false);\n  }, [pathname]);`));
}

function runAll() {
  testAdminShellRouteChangeOnly();
  testAgentShellRouteChangeOnly();
  console.log("shell-drawer-stability:selftest OK");
}

runAll();

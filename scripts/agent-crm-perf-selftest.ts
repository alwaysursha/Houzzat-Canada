/**
 * Focused CRM perceived-performance wiring checks.
 * Run: pnpm exec tsx scripts/agent-crm-perf-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testFullCrmIdlePrefetch() {
  const shell = read("src/components/agent/AgentShell.tsx");
  assert.ok(shell.includes("shouldUseProNativeInstantShell"));
  // Must not early-return before prefetch (full CRM path needs it).
  const effectStart = shell.indexOf(
    "const useInstantShell = shouldUseProNativeInstantShell",
  );
  assert.ok(effectStart >= 0);
  const effectSlice = shell.slice(effectStart, effectStart + 900);
  assert.ok(effectSlice.includes("router.prefetch(route)"));
  assert.ok(effectSlice.includes("useInstantShell ? 1200 : 400"));
  assert.equal(
    effectSlice.includes("if (!useInstantShell) return"),
    false,
    "full CRM must not skip idle prefetch",
  );
  // InstantShell behavior preserved
  assert.ok(shell.includes("if (isProNative && !isChatsPage)"));
  assert.ok(shell.includes("<AgentMobileInstantShell"));
}

function testSlimLoadingChrome() {
  const loading = read("src/app/(agent)/agent/loading.tsx");
  assert.ok(loading.includes('aria-label="Loading Agent CRM"'));
  // Heavy launchpad-shaped skeleton removed
  assert.equal(loading.includes("grid-cols-2"), false);
  assert.equal(loading.includes("Array.from({ length: 4 })"), false);
  assert.equal(loading.includes("Array.from({ length: 3 })"), false);
  assert.ok(loading.includes("animate-pulse"));
}

function testWorkspaceGateMemo() {
  const gate = read("src/components/agent/ActiveWorkspaceGate.tsx");
  assert.ok(gate.includes("workspaceGateCleared"));
  assert.ok(gate.includes("if (workspaceGateCleared) return"));
  assert.ok(gate.includes('pathname === "/agent/workspace"'));
  assert.ok(gate.includes("workspaceGateCleared = false"));
  assert.ok(gate.includes("workspaceGateCleared = true"));
  assert.ok(gate.includes('fetch("/api/agent/workspace"'));
}

function main() {
  testFullCrmIdlePrefetch();
  testSlimLoadingChrome();
  testWorkspaceGateMemo();
  console.log("agent-crm-perf-selftest: ok");
}

main();

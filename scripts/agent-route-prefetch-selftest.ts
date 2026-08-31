/**
 * Stage 3K.5.42 — Selftest for Native Agent Route Prefetch Optimization.
 * Run: pnpm agent-route-prefetch:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testNativeRoutePrefetchWiring() {
  const agentShellSrc = read("src/components/agent/AgentShell.tsx");

  // Verify Pro native check
  assert.ok(agentShellSrc.includes("navigator.userAgent.includes(\"com.houzzat.pro\")"));

  // Verify router.prefetch usage
  assert.ok(agentShellSrc.includes("router.prefetch(route)"));

  // Verify prefetch route allowlist
  assert.ok(agentShellSrc.includes("\"/agent\""));
  assert.ok(agentShellSrc.includes("\"/agent/leads\""));
  assert.ok(agentShellSrc.includes("\"/agent/tasks\""));

  // Verify duplicate suppression set
  assert.ok(agentShellSrc.includes("prefetchedRoutesRef.current.has(route)"));

  // Verify delay/idle stabilization timer
  assert.ok(agentShellSrc.includes("setTimeout("));
}

function testDrawerAndTenancyNonInterference() {
  const agentShellSrc = read("src/components/agent/AgentShell.tsx");

  // Verify drawer state overlay remains active and unaffected
  assert.ok(agentShellSrc.includes("useStaffOverlay"));
  assert.ok(agentShellSrc.includes("STAFF_OVERLAY_PRIORITY.shellDrawer"));

  // Verify no cross-tenant hardcoded hosts in prefetch
  assert.ok(!agentShellSrc.includes("https://"));
}

function runAll() {
  testNativeRoutePrefetchWiring();
  testDrawerAndTenancyNonInterference();
  console.log("agent-route-prefetch:selftest OK");
}

runAll();

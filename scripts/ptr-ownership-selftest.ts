/**
 * Stage 3K.5.36 — Selftest for Pull-to-Refresh Wrapper Ownership Isolation.
 * Run: pnpm ptr-ownership:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPtrOwnershipExclusivity() {
  const providersSrc = read("src/components/Providers.tsx");
  const houzzatPtrSrc = read("src/components/mobile/HouzzatPullToRefresh.tsx");
  const staffPtrSrc = read("src/components/mobile/StaffPullToRefresh.tsx");
  const adminShellSrc = read("src/components/admin/AdminShell.tsx");
  const agentShellSrc = read("src/components/agent/AgentShell.tsx");

  // 1. Providers wraps children with HouzzatPullToRefresh
  assert.ok(providersSrc.includes("<HouzzatPullToRefresh>{children}</HouzzatPullToRefresh>"));

  // 2. HouzzatPullToRefresh is disabled for Pro native and strictly restricted to consumer home ("/")
  assert.ok(houzzatPtrSrc.includes("isHouzzatProNative()"));
  assert.ok(houzzatPtrSrc.includes("isConsumerHome(pathname)"));
  assert.ok(houzzatPtrSrc.includes("if (!enabled) return children;"));

  // 3. AdminShell and AgentShell mount StaffPullToRefresh only around their content areas
  assert.ok(adminShellSrc.includes("<StaffPullToRefresh>{children}</StaffPullToRefresh>"));
  assert.ok(agentShellSrc.includes("<StaffPullToRefresh>{children}</StaffPullToRefresh>"));

  // 4. StaffPullToRefresh uses deterministic gesture classifier
  assert.ok(staffPtrSrc.includes("evaluatePullMove"));
  assert.ok(staffPtrSrc.includes("shouldCommitRefresh"));
}

function runAll() {
  testPtrOwnershipExclusivity();
  console.log("ptr-ownership:selftest OK");
}

runAll();

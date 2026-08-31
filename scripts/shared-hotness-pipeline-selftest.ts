/**
 * Stage 3K.5.39 — Selftest for Request-Scoped Hotness Pipeline Consolidation.
 * Run: pnpm shared-hotness-pipeline:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accumulateViewGroups,
  HOT_VIEW_WINDOW_MS,
  ONLINE_MS,
} from "../src/lib/agent/hotness";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testHotnessConstants() {
  assert.equal(ONLINE_MS, 3 * 60 * 1000);
  assert.equal(HOT_VIEW_WINDOW_MS, 24 * 60 * 60 * 1000);
}

function testAccumulateViewGroupsEquivalence() {
  const groups = [
    { userId: "c1", mlsNumber: "W12345", _count: { _all: 2 } },
    { userId: "c1", mlsNumber: "W12345", _count: { _all: 1 } },
    { userId: "c1", mlsNumber: "E98765", _count: { _all: 3 } },
    { userId: "c2", mlsNumber: "N55555", _count: { _all: 4 } },
  ];

  const res = accumulateViewGroups(groups);
  const c1 = res.get("c1");
  assert.ok(c1);
  assert.equal(c1.count, 6);
  assert.equal(c1.mls.size, 2);

  const c2 = res.get("c2");
  assert.ok(c2);
  assert.equal(c2.count, 4);
  assert.equal(c2.mls.size, 1);
}

function testHotnessCacheWiringAndDeduplication() {
  const hotnessSrc = read("src/lib/agent/hotness.ts");

  // Verify loadRequestScopedCustomerSignals is wrapped in React cache
  assert.ok(
    hotnessSrc.includes("export const loadRequestScopedCustomerSignals = cache("),
  );

  // Verify normalized cache key generation
  assert.ok(hotnessSrc.includes("sortedUniqueCustomerIds"));
  assert.ok(hotnessSrc.includes("cacheKey = sortedUniqueCustomerIds.join(\",\")"));

  // Verify computeHotnessMap uses the request-scoped signals loader
  assert.ok(hotnessSrc.includes("loadRequestScopedCustomerSignals(cacheKey)"));
}

function testNoGlobalOrCrossWorkspaceLeaks() {
  const hotnessSrc = read("src/lib/agent/hotness.ts");

  // Verify no global Maps / mutable global state outside functions
  assert.ok(!hotnessSrc.includes("globalThis.hotness"));
  assert.ok(!hotnessSrc.includes("const globalCache ="));
  assert.ok(!hotnessSrc.includes("let globalCache ="));
}

function runAll() {
  testHotnessConstants();
  testAccumulateViewGroupsEquivalence();
  testHotnessCacheWiringAndDeduplication();
  testNoGlobalOrCrossWorkspaceLeaks();
  console.log("shared-hotness-pipeline:selftest OK");
}

runAll();

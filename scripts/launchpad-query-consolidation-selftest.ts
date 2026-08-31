/**
 * Stage 3K.5.35 — Selftest for Agent Launchpad Query Consolidation & Hotness optimization.
 * Run: pnpm launchpad-query-consolidation:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accumulateViewGroups } from "../src/lib/agent/hotness";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testAccumulateViewGroupsMath() {
  const mockGroups = [
    { userId: "u1", mlsNumber: "MLS100", _count: { _all: 3 } },
    { userId: "u1", mlsNumber: "MLS101", _count: { _all: 2 } },
    { userId: "u2", mlsNumber: "MLS200", _count: { _all: 5 } },
  ];

  const map = accumulateViewGroups(mockGroups);

  assert.equal(map.size, 2);
  const u1 = map.get("u1");
  assert.ok(u1);
  assert.equal(u1.count, 5);
  assert.equal(u1.mls.size, 2);
  assert.ok(u1.mls.has("MLS100"));
  assert.ok(u1.mls.has("MLS101"));

  const u2 = map.get("u2");
  assert.ok(u2);
  assert.equal(u2.count, 5);
  assert.equal(u2.mls.size, 1);
  assert.ok(u2.mls.has("MLS200"));
}

function testStaticWiringAndSafety() {
  const pageSrc = read("src/app/(agent)/agent/page.tsx");
  const deferredSrc = read("src/lib/agent/launchpad-deferred.ts");
  const hotnessSrc = read("src/lib/agent/hotness.ts");

  // Verify page critical path uses Promise.all
  assert.ok(pageSrc.includes("Promise.all(["));
  // Verify deferred sections use React cache
  assert.ok(deferredSrc.includes("cache("));
  // Verify hotness map batches queries
  assert.ok(hotnessSrc.includes("accumulateViewGroups"));
  assert.ok(hotnessSrc.includes("HOT_VIEW_GROUP_TAKE"));
}

function runAll() {
  testAccumulateViewGroupsMath();
  testStaticWiringAndSafety();
  console.log("launchpad-query-consolidation:selftest OK");
}

runAll();

import assert from "node:assert/strict";
import {
  HOT_VIEW_GROUP_TAKE,
  HOT_VIEW_WINDOW_MS,
  accumulateViewGroups,
} from "../src/lib/agent/hotness";

function testWindowAndCap() {
  assert.equal(HOT_VIEW_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(HOT_VIEW_GROUP_TAKE, 2_500);
  assert.ok(HOT_VIEW_GROUP_TAKE < 10_000);
}

function testAccumulateEmpty() {
  const map = accumulateViewGroups([]);
  assert.equal(map.size, 0);
}

function testAccumulateSmall() {
  const map = accumulateViewGroups([
    { userId: "u1", mlsNumber: "A1", _count: { _all: 2 } },
    { userId: "u1", mlsNumber: "A2", _count: { _all: 1 } },
    { userId: "u2", mlsNumber: "B1", _count: { _all: 5 } },
    { userId: null, mlsNumber: "X", _count: { _all: 99 } },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get("u1")?.count, 3);
  assert.equal(map.get("u1")?.mls.size, 2);
  assert.equal(map.get("u2")?.count, 5);
  assert.equal(map.get("u2")?.mls.size, 1);
}

/**
 * Score saturates at ~14 views (+40) and ~4 distinct (+30). Re-views on the
 * same MLS must inflate count but not distinct — groupBy input shape.
 */
function testReViewsSameMls() {
  const map = accumulateViewGroups([
    { userId: "u1", mlsNumber: "W1", _count: { _all: 40 } },
    { userId: "u1", mlsNumber: "W2", _count: { _all: 3 } },
    { userId: "u1", mlsNumber: "W3", _count: { _all: 1 } },
  ]);
  const u1 = map.get("u1")!;
  assert.equal(u1.count, 44);
  assert.equal(u1.mls.size, 3);
  // binge threshold preserved
  assert.ok(u1.mls.size >= 3);
}

function testLargeGroupCapSemantics() {
  // Simulates take: HOT_VIEW_GROUP_TAKE truncating — aggregation still stable.
  const groups = Array.from({ length: 100 }, (_, i) => ({
    userId: i % 10 === 0 ? "power" : `u${i % 10}`,
    mlsNumber: `M${i}`,
    _count: { _all: 2 },
  }));
  const map = accumulateViewGroups(groups);
  assert.ok(map.size <= 10);
  assert.ok((map.get("power")?.count ?? 0) >= 2);
}

testWindowAndCap();
testAccumulateEmpty();
testAccumulateSmall();
testReViewsSameMls();
testLargeGroupCapSemantics();
console.log("leads-hotness-selftest: ok");

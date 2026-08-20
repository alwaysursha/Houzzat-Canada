/**
 * Focused Issue #8 monitor/watch reliability checks (no DB).
 * Run: pnpm monitors:selftest
 */

import assert from "node:assert/strict";

async function main() {
  const sync = await import("../src/lib/account/watch-sync");
  assert.equal(
    sync.isPropertyWatchesChangedMessage({
      type: "houzzat:property-watches-changed",
    }),
    true,
  );
  assert.equal(
    sync.isAreaWatchesChangedMessage({ type: "houzzat:area-watches-changed" }),
    true,
  );
  assert.equal(sync.isPropertyWatchesChangedMessage({ type: "other" }), false);
  assert.equal(sync.isPropertyWatchesRevStorageKey("houzzat:property-watches-rev"), true);
  assert.equal(sync.isAreaWatchesRevStorageKey("houzzat:area-watches-rev"), true);

  const cache = await import("../src/components/account/area-monitors-cache");
  cache.invalidateAreaMonitorsCache();
  assert.equal(cache.peekAreaMonitorsCache("u1"), null);

  cache.patchAreaMonitorsCache("u1", () => [
    {
      id: "a1",
      city: "Toronto",
      community: "C01",
      transactionType: "SALE",
      segment: "RESIDENTIAL",
    },
  ]);
  assert.equal(cache.peekAreaMonitorsCache("u1")?.length, 1);
  cache.patchAreaMonitorsCache("u1", (items) =>
    items.filter((item) => item.id !== "a1"),
  );
  assert.equal(cache.peekAreaMonitorsCache("u1")?.length, 0);

  // Area cursor algorithm (documented contract): never advance to wall-clock now;
  // advance only to last walked event time; page with (time, mls) tie-break.
  function nextCursor(
    cursorTime: number,
    cursorMls: string,
    batch: Array<{ t: number; mls: string }>,
  ) {
    let time = cursorTime;
    let mls = cursorMls;
    for (const row of batch) {
      time = row.t;
      mls = row.mls;
    }
    return { time, mls };
  }

  const first = nextCursor(100, "", [
    { t: 110, mls: "N1" },
    { t: 110, mls: "N2" },
    { t: 120, mls: "N3" },
  ]);
  assert.deepEqual(first, { time: 120, mls: "N3" });

  // Same-timestamp leftovers continue via mls > cursorMls at same t.
  const sameTsRemaining = [
    { t: 110, mls: "N3" },
    { t: 110, mls: "N4" },
  ].filter(
    (row) => row.t > 110 || (row.t === 110 && row.mls > "N2"),
  );
  assert.deepEqual(
    sameTsRemaining.map((r) => r.mls),
    ["N3", "N4"],
  );

  console.log("monitors-reliability-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

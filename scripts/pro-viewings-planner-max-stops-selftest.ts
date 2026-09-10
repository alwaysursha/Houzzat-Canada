/**
 * PRO Viewings Planner final-total stop cap selftest.
 * Run: node --import tsx scripts/pro-viewings-planner-max-stops-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTE_PLANNER_MAX_STOPS } from "../src/lib/route-planner/optimize";
import { planProStopMerge } from "../src/lib/mobile/v2/viewings-planner";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function mls(n: number) {
  return `MLS${String(n).padStart(6, "0")}`;
}

function range(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => mls(start + i));
}

function testCanonicalMax() {
  assert.equal(ROUTE_PLANNER_MAX_STOPS, 10);
  const lib = read("src/lib/mobile/v2/viewings-planner.ts");
  assert.ok(lib.includes("maxStops: ROUTE_PLANNER_MAX_STOPS"));
  assert.ok(lib.includes("currentCount >= ROUTE_PLANNER_MAX_STOPS"));
}

function testZeroExistingTenNew() {
  const planned = planProStopMerge({
    existingMls: [],
    requestedMls: range(1, 10),
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, range(1, 10));
  assert.equal(planned.nextOrder, 0);
  assert.equal(planned.toAdd.length, 10);
}

function testEightExistingTenUniqueNew() {
  const existing = range(1, 8);
  const requested = range(9, 10);
  const planned = planProStopMerge({
    existingMls: existing,
    requestedMls: requested,
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, [mls(9), mls(10)]);
  assert.equal(existing.length + planned.toAdd.length, 10);
  assert.equal(planned.nextOrder, 8);
}

function testTenExistingAddsNone() {
  const existing = range(1, 10);
  const planned = planProStopMerge({
    existingMls: existing,
    requestedMls: range(11, 5),
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, []);
  assert.equal(planned.nextOrder, 10);
}

function testDuplicatesDoNotConsumeCapacity() {
  const existing = range(1, 5);
  const requested = [
    mls(1),
    mls(1),
    mls(6),
    mls(2),
    mls(7),
    mls(8),
    mls(9),
    mls(10),
    mls(11),
    mls(12),
    mls(13),
  ];
  const planned = planProStopMerge({
    existingMls: existing,
    requestedMls: requested,
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, [mls(6), mls(7), mls(8), mls(9), mls(10)]);
  assert.equal(existing.length + planned.toAdd.length, 10);
}

function testOrderingPreserved() {
  const planned = planProStopMerge({
    existingMls: [mls(1), mls(2)],
    requestedMls: [mls(9), mls(2), mls(8), mls(9), mls(7), "  ", mls(6)],
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, [mls(9), mls(8), mls(7), mls(6)]);
  assert.equal(planned.nextOrder, 2);
}

function testExistingNeverDeletedIncludingOverMax() {
  const existing = range(1, 12);
  const planned = planProStopMerge({
    existingMls: existing,
    requestedMls: range(20, 5),
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  assert.deepEqual(planned.toAdd, []);
  assert.deepEqual(existing, range(1, 12));
}

function simulateMerge(existingMls: string[], requestedMls: string[]) {
  const stops = existingMls.map((m, i) => ({ mlsNumber: m, sortOrder: i }));
  const planned = planProStopMerge({
    existingMls: stops.map((s) => s.mlsNumber),
    requestedMls: requestedMls,
    maxStops: ROUTE_PLANNER_MAX_STOPS,
  });
  const have = new Set(stops.map((s) => s.mlsNumber));
  let nextOrder = planned.nextOrder;
  for (const mlsNumber of planned.toAdd) {
    if (stops.length >= ROUTE_PLANNER_MAX_STOPS) break;
    if (have.has(mlsNumber)) continue;
    stops.push({ mlsNumber, sortOrder: nextOrder });
    have.add(mlsNumber);
    nextOrder += 1;
  }
  return stops;
}

function testSimulatedWriterDoesNotDelete() {
  const before = range(1, 8);
  const after = simulateMerge(before, range(9, 10));
  assert.deepEqual(
    after.map((s) => s.mlsNumber),
    [...before, mls(9), mls(10)],
  );
  assert.deepEqual(
    after.map((s) => s.sortOrder),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(after.length, 10);
}

function testAuthorizationUnchanged() {
  const route = read(
    "src/app/api/mobile/v2/leads/[leadId]/viewings-planner/route.ts",
  );
  assert.ok(route.includes("authorizeMobileLeadAccess"));
  assert.ok(route.includes("getOrCreateProDraftTour"));
  const lib = read("src/lib/mobile/v2/viewings-planner.ts");
  const merge =
    lib.split("async function mergeStopsOntoTour")[1]?.split(
      "export async function loadProViewingsTourById",
    )[0] ?? "";
  assert.equal(merge.includes("authorizeMobileLeadAccess"), false);
  assert.equal(merge.includes("canAccessLead"), false);
}

function testNeonSafeWrites() {
  const lib = read("src/lib/mobile/v2/viewings-planner.ts");
  const merge =
    lib.split("async function mergeStopsOntoTour")[1]?.split(
      "export async function loadProViewingsTourById",
    )[0] ?? "";
  assert.equal(merge.includes("$transaction"), false);
  assert.equal(merge.includes("updateMany"), false);
  assert.equal(merge.includes("deleteMany"), false);
  assert.equal(merge.includes("delete("), false);
  assert.ok(merge.includes("prisma.viewingTourStop.create"));
  assert.ok(merge.includes("prisma.viewingTourStop.count"));
}

function main() {
  testCanonicalMax();
  testZeroExistingTenNew();
  testEightExistingTenUniqueNew();
  testTenExistingAddsNone();
  testDuplicatesDoNotConsumeCapacity();
  testOrderingPreserved();
  testExistingNeverDeletedIncludingOverMax();
  testSimulatedWriterDoesNotDelete();
  testAuthorizationUnchanged();
  testNeonSafeWrites();
  console.log("pro-viewings-planner-max-stops-selftest: ok");
}

main();

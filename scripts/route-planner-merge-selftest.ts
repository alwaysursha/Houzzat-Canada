/**
 * Guest Route Planner merge.
 * Run: pnpm route-planner-merge:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LocalRoutePlanner } from "../src/lib/route-planner/local";
import {
  guestRoutePlannerMergeBody,
  mergeGuestRoutePlanner,
} from "../src/lib/route-planner/merge-guest";
import {
  appendGuestStopsInOrder,
  type GuestStopMergeDb,
  type GuestTourStop,
} from "../src/lib/route-planner/merge-guest-stops";

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function local(
  overrides: Partial<LocalRoutePlanner> = {},
): LocalRoutePlanner {
  return { mlsNumbers: ["W1", "W2"], ...overrides };
}

function harness(options: {
  patch: () => Promise<{ ok: boolean }> | { ok: boolean };
  local?: LocalRoutePlanner;
}) {
  let stored = options.local ?? local();
  const calls: string[] = [];
  return {
    calls,
    stored: () => stored,
    run: () =>
      mergeGuestRoutePlanner({
        load: () => stored,
        patch: async (body) => {
          calls.push(`patch:${JSON.stringify(body)}`);
          const result = await options.patch();
          return result;
        },
        refresh: async () => {
          calls.push("refresh");
        },
        clear: () => {
          calls.push("clear");
          stored = { mlsNumbers: [] };
        },
      }),
  };
}

async function testSuccessClearsOnlyAfterRefresh() {
  const box = harness({ patch: async () => ({ ok: true }) });
  const result = await box.run();
  assert.equal(result, "merged");
  assert.deepEqual(box.calls, [
    `patch:${JSON.stringify({ mergeMlsNumbers: ["W1", "W2"] })}`,
    "refresh",
    "clear",
  ]);
  assert.deepEqual(box.stored().mlsNumbers, []);
}

async function testFailureKeepsGuestState(
  label: string,
  patch: () => Promise<{ ok: boolean }>,
) {
  const box = harness({ patch });
  const result = await box.run();
  assert.equal(result, "failed", label);
  assert.equal(box.calls.includes("clear"), false, label);
  assert.equal(box.calls.includes("refresh"), false, label);
  assert.deepEqual(box.stored().mlsNumbers, ["W1", "W2"], label);
}

async function testRetryAfterFailure() {
  let attempt = 0;
  const box = harness({
    patch: async () => {
      attempt += 1;
      if (attempt === 1) return { ok: false };
      return { ok: true };
    },
  });
  assert.equal(await box.run(), "failed");
  assert.deepEqual(box.stored().mlsNumbers, ["W1", "W2"]);
  assert.equal(await box.run(), "merged");
  assert.deepEqual(box.stored().mlsNumbers, []);
  assert.equal(await box.run(), "skipped");
  assert.equal(attempt, 2);
}

function testEmptyStartFieldsDoNotOverwrite() {
  const body = guestRoutePlannerMergeBody({
    mlsNumbers: ["W9"],
    startAddress: null,
    startLat: null,
    startLng: null,
    startAt: "  ",
    defaultDwellMinutes: undefined,
    bufferMinutes: undefined,
  });
  assert.deepEqual(body, { mergeMlsNumbers: ["W9"] });
  assert.equal(
    guestRoutePlannerMergeBody({
      mlsNumbers: [],
      startAddress: "",
      startAt: null,
    }),
    null,
  );
  assert.deepEqual(
    guestRoutePlannerMergeBody({
      mlsNumbers: [],
      startAddress: " 12 King St ",
      startLat: 43.6,
      startLng: -79.4,
      startAt: "2026-09-28T15:00:00.000Z",
      defaultDwellMinutes: 30,
      bufferMinutes: 5,
    }),
    {
      startAddress: "12 King St",
      startLat: 43.6,
      startLng: -79.4,
      startAt: "2026-09-28T15:00:00.000Z",
      defaultDwellMinutes: 30,
      bufferMinutes: 5,
    },
  );
}

function memoryDb(options: {
  active: string[];
  stops?: GuestTourStop[];
  onCreate?: (mls: string, stops: GuestTourStop[]) => void;
}) {
  const stops = [...(options.stops ?? [])];
  const created: string[] = [];
  const db: GuestStopMergeDb = {
    async listActiveMls() {
      return options.active;
    },
    async listStops() {
      return stops.map((stop) => ({ ...stop }));
    },
    async createStop(input) {
      options.onCreate?.(input.mlsNumber, stops);
      if (stops.some((stop) => stop.mlsNumber === input.mlsNumber)) {
        throw { code: "P2002" };
      }
      stops.push({
        mlsNumber: input.mlsNumber,
        sortOrder: input.sortOrder,
      });
      created.push(input.mlsNumber);
    },
  };
  return { db, stops, created };
}

async function testDuplicateAndOrderAndCap() {
  const existing = memoryDb({
    active: ["W3", "W1", "W2"],
    stops: [
      { mlsNumber: "W1", sortOrder: 0 },
      { mlsNumber: "W3", sortOrder: 1 },
    ],
  });
  const once = await appendGuestStopsInOrder(existing.db, {
    tourId: "tour",
    mergeMlsNumbers: ["W3", "W2", "W1", "SOLD1"],
  });
  assert.deepEqual(existing.created, ["W2"]);
  assert.deepEqual(once.mlsNumbers, ["W1", "W3", "W2"]);
  assert.deepEqual(existing.stops, [
    { mlsNumber: "W1", sortOrder: 0 },
    { mlsNumber: "W3", sortOrder: 1 },
    { mlsNumber: "W2", sortOrder: 2 },
  ]);

  const again = await appendGuestStopsInOrder(existing.db, {
    tourId: "tour",
    mergeMlsNumbers: ["W2", "W1", "W3"],
  });
  assert.deepEqual(again.mlsNumbers, ["W1", "W3", "W2"]);
  assert.deepEqual(existing.created, ["W2"]);

  const fresh = memoryDb({ active: ["A", "M", "Z"] });
  const ordered = await appendGuestStopsInOrder(fresh.db, {
    tourId: "tour",
    mergeMlsNumbers: ["Z", "M", "A"],
  });
  assert.deepEqual(ordered.mlsNumbers, ["Z", "M", "A"]);
  assert.deepEqual(fresh.created, ["Z", "M", "A"]);

  const fullStops = Array.from({ length: 9 }, (_, index) => ({
    mlsNumber: `E${index}`,
    sortOrder: index,
  }));
  const capped = memoryDb({
    active: ["N1", "N2", "N3", "E0"],
    stops: fullStops,
  });
  const cappedResult = await appendGuestStopsInOrder(capped.db, {
    tourId: "tour",
    mergeMlsNumbers: ["E0", "N1", "N2", "N3"],
  });
  assert.deepEqual(capped.created, ["N1"]);
  assert.equal(cappedResult.mlsNumbers.length, 10);
  assert.equal(cappedResult.mlsNumbers[9], "N1");
  assert.deepEqual(cappedResult.mlsNumbers.slice(0, 9), [
    "E0",
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "E6",
    "E7",
    "E8",
  ]);
}

async function testConcurrentDuplicateDoesNotDropTheRest() {
  const stops: GuestTourStop[] = [{ mlsNumber: "A", sortOrder: 0 }];
  let raced = false;
  const created: string[] = [];
  const db: GuestStopMergeDb = {
    async listActiveMls() {
      return ["B", "C"];
    },
    async listStops() {
      return stops.map((stop) => ({ ...stop }));
    },
    async createStop(input) {
      if (input.mlsNumber === "B" && !raced) {
        raced = true;
        stops.push({ mlsNumber: "B", sortOrder: 1 });
        throw { code: "P2002" };
      }
      if (stops.some((stop) => stop.mlsNumber === input.mlsNumber)) {
        throw { code: "P2002" };
      }
      stops.push({ mlsNumber: input.mlsNumber, sortOrder: input.sortOrder });
      created.push(input.mlsNumber);
    },
  };
  const result = await appendGuestStopsInOrder(db, {
    tourId: "tour",
    mergeMlsNumbers: ["B", "C"],
  });
  assert.deepEqual(created, ["C"]);
  assert.deepEqual(result.mlsNumbers, ["A", "B", "C"]);
}

function testBoundariesStay() {
  const request = read("src/app/api/route-planner/request/route.ts");
  assert.ok(request.includes("upsertCustomer: false"));
  assert.ok(request.includes("requireFullCustomerUser"));
  assert.ok(request.includes("publicResolveOrCreateLead"));

  const provider = read("src/components/route-planner/RoutePlannerProvider.tsx");
  assert.ok(provider.includes("mergeGuestRoutePlanner"));
  assert.ok(!provider.includes("capture-intent"));
  assert.ok(!provider.includes("requireAuthForIntent"));

  const wired = read("src/lib/auth/lead-request-intent.ts");
  assert.ok(!wired.includes("ROUTE_PLANNER"));
  const listing = read("src/lib/auth/save-listing-intent.ts");
  const search = read("src/lib/auth/save-search-intent.ts");
  assert.ok(!listing.includes('"ROUTE_PLANNER"'));
  assert.ok(!search.includes('"ROUTE_PLANNER"'));

  const route = read("src/app/api/route-planner/route.ts");
  assert.ok(route.includes("appendGuestStopsInOrder"));
  assert.ok(route.includes('status: "ACTIVE"'));
  assert.ok(!route.includes("publicResolveOrCreateLead"));
}

async function main() {
  await testSuccessClearsOnlyAfterRefresh();
  await testFailureKeepsGuestState("401", async () => ({ ok: false }));
  await testFailureKeepsGuestState("403", async () => ({ ok: false }));
  await testFailureKeepsGuestState("500", async () => ({ ok: false }));
  await testFailureKeepsGuestState("network", async () => {
    throw new Error("network down");
  });
  await testRetryAfterFailure();
  testEmptyStartFieldsDoNotOverwrite();
  await testDuplicateAndOrderAndCap();
  await testConcurrentDuplicateDoesNotDropTheRest();
  testBoundariesStay();
  console.log("route-planner-merge selftest ok");
}

void main();

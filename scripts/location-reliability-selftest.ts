/**
 * Phase 5B location reliability self-tests.
 * Run: pnpm exec tsx scripts/location-reliability-selftest.ts
 */

import assert from "node:assert/strict";
import {
  mayResolveLocationPassively,
  NORMAL_LOCATION_MAX_AGE_MS,
  NORMAL_LOCATION_TIMEOUT_MS,
  shouldRequestLocationPermission,
  shouldUpgradeHomeRailsRegion,
} from "../src/lib/mobile/location-policy";
import {
  __resetHomeGeolocationForTests,
  __setGetCurrentCoordinatesForTests,
  getHomeCoordinates,
  HOME_GEO_STORAGE_KEY,
  NORMAL_LOCATION_MAX_AGE,
  readCachedHomeCoordinates,
} from "../src/lib/mobile/home-geolocation";
import { AppGeolocationError } from "../src/lib/mobile/geolocation";

const memory = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, String(v));
  },
  removeItem: (k) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: () => null,
  get length() {
    return memory.size;
  },
};

async function main() {
  assert.equal(NORMAL_LOCATION_MAX_AGE_MS, 5 * 60 * 1000);
  assert.equal(NORMAL_LOCATION_TIMEOUT_MS, 12_000);
  assert.equal(NORMAL_LOCATION_MAX_AGE, NORMAL_LOCATION_MAX_AGE_MS);

  // A. Passive Home must not request permission when prompt
  assert.equal(
    shouldRequestLocationPermission({
      requestPermission: false,
      permission: "prompt",
    }),
    false,
  );
  assert.equal(mayResolveLocationPassively("prompt"), false);
  assert.equal(mayResolveLocationPassively("unknown"), false);
  assert.equal(mayResolveLocationPassively("denied"), false);

  // B. Explicit Near Me may request when prompt
  assert.equal(
    shouldRequestLocationPermission({
      requestPermission: true,
      permission: "prompt",
    }),
    true,
  );
  assert.equal(mayResolveLocationPassively("granted"), true);

  // H. Denied — never request
  assert.equal(
    shouldRequestLocationPermission({
      requestPermission: true,
      permission: "denied",
    }),
    false,
  );

  // F/G. Home rails geo upgrade dedupe
  const upgraded = new Set<string>();
  assert.equal(
    shouldUpgradeHomeRailsRegion({
      currentRegionId: "default",
      nextRegionId: "peel",
      upgradedRegionIds: upgraded,
    }),
    true,
  );
  upgraded.add("peel");
  assert.equal(
    shouldUpgradeHomeRailsRegion({
      currentRegionId: "default",
      nextRegionId: "peel",
      upgradedRegionIds: upgraded,
    }),
    false,
    "same region second path must not upgrade again",
  );
  assert.equal(
    shouldUpgradeHomeRailsRegion({
      currentRegionId: "peel",
      nextRegionId: "toronto",
      upgradedRegionIds: upgraded,
    }),
    true,
    "genuinely new region still upgrades once",
  );

  // C. Concurrent callers → one GPS operation
  __resetHomeGeolocationForTests();
  memory.clear();
  let gpsCalls = 0;
  __setGetCurrentCoordinatesForTests(async (opts) => {
    gpsCalls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return {
      lat: 43.5,
      lng: -79.6,
      _req: opts?.requestPermission,
    } as { lat: number; lng: number };
  });

  const [a, b] = await Promise.all([
    getHomeCoordinates({ requestPermission: false, emitEvent: false }),
    getHomeCoordinates({ requestPermission: false, emitEvent: false }),
  ]);
  assert.equal(gpsCalls, 1, "single-flight shared GPS");
  assert.deepEqual(a, b);

  // D. Cache within TTL → no GPS
  gpsCalls = 0;
  const cached = await getHomeCoordinates({
    requestPermission: false,
    emitEvent: false,
  });
  assert.equal(gpsCalls, 0, "fresh cache skips GPS");
  assert.equal(cached.lat, 43.5);

  // E. Stale cache → fresh GPS allowed
  __resetHomeGeolocationForTests();
  memory.set(
    HOME_GEO_STORAGE_KEY,
    JSON.stringify({
      lat: 1,
      lng: 2,
      at: Date.now() - NORMAL_LOCATION_MAX_AGE - 5_000,
    }),
  );
  assert.equal(readCachedHomeCoordinates(NORMAL_LOCATION_MAX_AGE), null);

  gpsCalls = 0;
  __setGetCurrentCoordinatesForTests(async () => {
    gpsCalls += 1;
    return { lat: 44, lng: -80 };
  });
  const fresh = await getHomeCoordinates({
    requestPermission: true,
    emitEvent: false,
  });
  assert.equal(gpsCalls, 1);
  assert.deepEqual(fresh, { lat: 44, lng: -80 });

  // A (runtime): passive requestPermission false must pass flag through
  __resetHomeGeolocationForTests();
  memory.clear();
  let seenRequest: boolean | undefined;
  __setGetCurrentCoordinatesForTests(async (opts) => {
    seenRequest = opts?.requestPermission;
    return { lat: 43, lng: -79 };
  });
  await getHomeCoordinates({ requestPermission: false, emitEvent: false });
  assert.equal(seenRequest, false);

  seenRequest = undefined;
  __resetHomeGeolocationForTests();
  memory.clear();
  __setGetCurrentCoordinatesForTests(async (opts) => {
    seenRequest = opts?.requestPermission;
    return { lat: 43, lng: -79 };
  });
  await getHomeCoordinates({ requestPermission: true, emitEvent: false });
  assert.equal(seenRequest, true);

  // I. timeout/unavailable surfaces as AppGeolocationError codes
  const timeoutErr = new AppGeolocationError("timeout", "timed out");
  assert.equal(timeoutErr.code, "timeout");
  const unavailableErr = new AppGeolocationError(
    "unavailable",
    "Location services off",
  );
  assert.equal(unavailableErr.code, "unavailable");

  __resetHomeGeolocationForTests();
  console.log("location-reliability-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

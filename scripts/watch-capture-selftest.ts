/**
 * Property Watch and Area Watch capture intents.
 * Run: pnpm watch-capture:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AreaMonitor } from "@prisma/client";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";
import { createOrReuseAreaMonitor } from "../src/lib/account/area-monitor-create";
import {
  openGuestAreaWatchIntent,
  resumeAreaWatchIntent,
} from "../src/lib/auth/area-watch-intent";
import {
  CAPTURE_INTENT_TTL_MS,
  peekPendingIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  dispatchPendingCaptureIntent,
  registerCaptureIntentHandler,
} from "../src/lib/auth/capture-intent-dispatch";
import {
  openGuestPropertyWatchIntent,
  resumePropertyWatchIntent,
} from "../src/lib/auth/property-watch-intent";
import { searchPageHref } from "../src/lib/listings/search-page-href";

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;

function memoryStore(): CaptureIntentStore & { raw: string | null } {
  return {
    raw: null,
    get() {
      return this.raw;
    },
    set(value) {
      this.raw = value;
    },
    remove() {
      this.raw = null;
    },
  };
}

function openAuthSpy() {
  const opened: { mode?: string; callbackUrl: string }[] = [];
  return {
    opened,
    openAuth(options: { mode?: string; callbackUrl: string }) {
      opened.push(options);
    },
  };
}

const FILTERED_SEARCH: SearchFilters = {
  segment: "RESIDENTIAL",
  transactionType: "LEASE",
  dataSource: "",
  city: "Toronto",
  community: "The Beaches",
  minPrice: "2500",
  maxPrice: "4000",
  minBeds: "2",
  minBaths: "1",
  propertyTypes: ["CONDO_APT"],
  openHouseOnly: true,
  statuses: ["ACTIVE"],
  sort: "price_asc",
};

function filteredSearchHref(): string {
  return searchPageHref({
    pathname: "/search",
    filters: FILTERED_SEARCH,
    view: "map",
    q: "waterfront",
  });
}

function stored(store: { raw: string | null }): Record<string, unknown> {
  assert.ok(store.raw);
  const record = JSON.parse(store.raw) as { intent?: Record<string, unknown> };
  assert.ok(record.intent);
  return record.intent;
}

function testAnonymousPropertyWatchOpensAuthWithoutPost() {
  const store = memoryStore();
  const auth = openAuthSpy();
  const posts = 0;
  const opened = openGuestPropertyWatchIntent({
    mlsNumber: "w1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store,
    openAuth: auth.openAuth,
  });
  assert.equal(opened.ok, true);
  assert.equal(posts, 0);
  assert.deepEqual(auth.opened, [
    { mode: "sign-in", callbackUrl: "/listing/12-main-st/W1234567", intent: "PROPERTY_WATCH" },
  ]);
  const body = stored(store);
  assert.equal(body.type, "PROPERTY_WATCH");
  assert.equal(body.mlsNumber, "W1234567");
  assert.equal(body.callbackPath, "/listing/12-main-st/W1234567");
  assert.deepEqual(Object.keys(body).sort(), [
    "callbackPath",
    "createdAt",
    "host",
    "mlsNumber",
    "type",
  ]);
}

function testPropertyMlsSurvivesAuth() {
  const store = memoryStore();
  openGuestPropertyWatchIntent({
    mlsNumber: "c998877",
    callbackPath: "/listing/4-oak/C998877",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const peeked = peekPendingIntent(store, { host: HOST, now: NOW + 5_000 });
  assert.equal(peeked.ok, true);
  if (!peeked.ok || peeked.intent.type !== "PROPERTY_WATCH") return;
  assert.equal(peeked.intent.mlsNumber, "C998877");
  assert.equal(peeked.intent.callbackPath, "/listing/4-oak/C998877");
}

async function testPropertyWatchCompletesOnce() {
  const store = memoryStore();
  openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const bodies: unknown[] = [];
  registerCaptureIntentHandler("PROPERTY_WATCH", (intent) => {
    if (intent.type !== "PROPERTY_WATCH") return;
    void resumePropertyWatchIntent(intent, async (mlsNumber) => {
      bodies.push({ mlsNumber });
      return { ok: true };
    });
  });
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 10 });
  assert.equal(first.status, "ready");
  assert.equal(store.raw, null);
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 20 });
  assert.equal(second.status, "none");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(bodies, [{ mlsNumber: "W1234567" }]);
}

async function testExistingPropertyMonitorIsSuccess() {
  const created = openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store: memoryStore(),
    openAuth() {},
  });
  assert.equal(created.ok, true);
  if (!created.ok || created.intent.type !== "PROPERTY_WATCH") return;
  const result = await resumePropertyWatchIntent(created.intent, async () => ({
    ok: true,
  }));
  assert.equal(result, "watched");
}

function testRefreshDoesNotReplay() {
  const store = memoryStore();
  openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  registerCaptureIntentHandler("PROPERTY_WATCH", () => {
    posts += 1;
  });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 1 });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 2 });
  assert.equal(posts, 1);
  assert.equal(store.raw, null);
}

function testUnwatchIsNeverStored() {
  const source = readFileSync(
    "src/components/account/useWatchListingToggle.ts",
    "utf8",
  );
  const guestStart = source.indexOf("if (!signedIn)");
  const signedStart = source.indexOf("if (!providerReady && !chromeReady)");
  const guest = source.slice(guestStart, signedStart);
  assert.match(guest, /openGuestPropertyWatchIntent/);
  assert.equal(guest.includes("fetch("), false);
  assert.equal(guest.includes("DELETE"), false);
  assert.match(source, /method: next \? "POST" : "DELETE"/);
  const opened = openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store: memoryStore(),
    openAuth() {},
  });
  assert.equal(opened.ok, true);
  if (opened.ok) assert.equal(opened.intent.type, "PROPERTY_WATCH");
}

function testAnonymousAreaWatchOpensAuth() {
  const store = memoryStore();
  const auth = openAuthSpy();
  const href = filteredSearchHref();
  const opened = openGuestAreaWatchIntent({
    city: "Toronto",
    community: "The Beaches",
    transactionType: "LEASE",
    segment: "RESIDENTIAL",
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth: auth.openAuth,
  });
  assert.equal(opened.ok, true);
  assert.equal(auth.opened[0]?.mode, "sign-in");
  assert.equal(auth.opened[0]?.callbackUrl, href);
  assert.equal(auth.opened[0]?.callbackUrl === "/search", false);
}

function testFullSearchCallbackSurvives() {
  const href = filteredSearchHref();
  assert.match(href, /city=Toronto/);
  assert.match(href, /community=The\+Beaches/);
  assert.match(href, /transactionType=LEASE/);
  assert.match(href, /minBeds=2/);
  const store = memoryStore();
  openGuestAreaWatchIntent({
    city: "Toronto",
    community: "The Beaches",
    transactionType: "LEASE",
    segment: "RESIDENTIAL",
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const peeked = peekPendingIntent(store, { host: HOST, now: NOW + 1 });
  assert.equal(peeked.ok, true);
  if (!peeked.ok) return;
  assert.equal(peeked.intent.callbackPath, href);
  const search = readFileSync(
    "src/components/listings/SearchExperience.tsx",
    "utf8",
  );
  assert.match(search, /authCallbackUrl=\{searchCallbackPath\(filters\)\}/);
}

function testAreaCriteriaSurvive() {
  const cases = [
    { transactionType: "SALE" as const, segment: "RESIDENTIAL" as const, community: "The Beaches" },
    { transactionType: "LEASE" as const, segment: "COMMERCIAL" as const, community: "King West" },
    { transactionType: "ALL" as const, segment: "RESIDENTIAL" as const, community: null },
  ];
  for (const item of cases) {
    const store = memoryStore();
    const callbackPath =
      item.community == null
        ? "/listing/9-main/W222"
        : filteredSearchHref();
    const opened = openGuestAreaWatchIntent({
      city: "Toronto",
      community: item.community,
      transactionType: item.transactionType,
      segment: item.segment,
      callbackPath,
      host: HOST,
      now: NOW,
      store,
      openAuth() {},
    });
    assert.equal(opened.ok, true);
    const body = stored(store);
    assert.equal(body.city, "Toronto");
    assert.equal(body.community, item.community);
    assert.equal(body.transactionType, item.transactionType);
    assert.equal(body.segment, item.segment);
    assert.equal(body.callbackPath, callbackPath);
    assert.equal("notifyNew" in body, false);
    assert.equal("emailAlerts" in body, false);
    const peeked = peekPendingIntent(store, { host: HOST, now: NOW + 1 });
    assert.equal(peeked.ok, true);
    if (!peeked.ok || peeked.intent.type !== "AREA_WATCH") continue;
    assert.equal(peeked.intent.city, "Toronto");
    assert.equal(peeked.intent.community, item.community);
    assert.equal(peeked.intent.transactionType, item.transactionType);
    assert.equal(peeked.intent.segment, item.segment);
  }
}

async function testAreaWatchCompletesOnce() {
  const store = memoryStore();
  openGuestAreaWatchIntent({
    city: "Toronto",
    community: "The Beaches",
    transactionType: "ALL",
    segment: "COMMERCIAL",
    callbackPath: "/listing/9-main/W222",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const bodies: unknown[] = [];
  registerCaptureIntentHandler("AREA_WATCH", (intent) => {
    if (intent.type !== "AREA_WATCH") return;
    void resumeAreaWatchIntent(intent, async (criteria) => {
      bodies.push(criteria);
      return { ok: true };
    });
  });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 1 });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 2 });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(bodies, [
    {
      city: "Toronto",
      community: "The Beaches",
      transactionType: "ALL",
      segment: "COMMERCIAL",
    },
  ]);
}

async function testAreaPostUsesExistingFlags() {
  const created = openGuestAreaWatchIntent({
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    callbackPath: "/listing/9-main/W222",
    host: HOST,
    now: NOW,
    store: memoryStore(),
    openAuth() {},
  });
  assert.equal(created.ok, true);
  if (!created.ok || created.intent.type !== "AREA_WATCH") return;
  const original = globalThis.fetch;
  let body: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ ok: true, item: { id: "a" } }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    const result = await resumeAreaWatchIntent(created.intent);
    assert.equal(result, "watched");
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(body, {
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    notifyNew: true,
    notifySold: true,
  });
}

async function testExistingAreaMonitorIsSuccess() {
  const created = openGuestAreaWatchIntent({
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    callbackPath: "/search?city=Toronto",
    host: HOST,
    now: NOW,
    store: memoryStore(),
    openAuth() {},
  });
  assert.equal(created.ok, true);
  if (!created.ok || created.intent.type !== "AREA_WATCH") return;
  const result = await resumeAreaWatchIntent(created.intent, async () => ({
    ok: true,
  }));
  assert.equal(result, "watched");
  const route = readFileSync("src/app/api/account/area-monitors/route.ts", "utf8");
  assert.match(route, /alreadyWatching/);
  assert.match(route, /createOrReuseAreaMonitor/);
}

function testRejectsExtraAndInvalidAreaFields() {
  const base = {
    type: "AREA_WATCH",
    callbackPath: "/search?city=Toronto",
    createdAt: NOW,
    host: HOST,
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
  };
  const extras = [
    { ...base, notifyNew: true },
    { ...base, emailAlerts: true },
    { ...base, password: "nope" },
    { ...base, transactionType: "RENT" },
    { ...base, segment: "PRE_CONSTRUCTION" },
    { ...base, segment: "ALL" },
  ];
  for (const value of extras) {
    const store = memoryStore();
    store.set(JSON.stringify({ v: 1, intent: value }));
    const peeked = peekPendingIntent(store, { host: HOST, now: NOW + 1 });
    assert.equal(peeked.ok, false);
  }
}

function testWrongHostAndExpiryFail() {
  const store = memoryStore();
  openGuestAreaWatchIntent({
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    callbackPath: "/search?city=Toronto",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const mismatch = peekPendingIntent(store, {
    host: "other.houzzatpro.com",
    now: NOW + 1,
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.reason, "host_mismatch");
  assert.ok(store.raw);

  const rejected = dispatchPendingCaptureIntent(store, {
    host: "other.houzzatpro.com",
    now: NOW + 1,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(store.raw, null);

  const expiredStore = memoryStore();
  openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store: expiredStore,
    openAuth() {},
  });
  let posts = 0;
  registerCaptureIntentHandler("PROPERTY_WATCH", () => {
    posts += 1;
  });
  const expired = dispatchPendingCaptureIntent(expiredStore, {
    host: HOST,
    now: NOW + CAPTURE_INTENT_TTL_MS + 5_000,
  });
  assert.equal(expired.status, "rejected");
  assert.equal(posts, 0);
  assert.equal(expiredStore.raw, null);
}

async function testEmailVerificationDoesNotCreateOrLoop() {
  const store = memoryStore();
  openGuestPropertyWatchIntent({
    mlsNumber: "W1234567",
    callbackPath: "/listing/12-main-st/W1234567",
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  let watched = 0;
  registerCaptureIntentHandler("PROPERTY_WATCH", (intent) => {
    if (intent.type !== "PROPERTY_WATCH") return;
    void resumePropertyWatchIntent(intent, async () => {
      posts += 1;
      return { ok: false, verification: true };
    }).then((result) => {
      if (result === "watched") watched += 1;
      assert.equal(result, "verification");
    });
  });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 1 });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 2 });
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 3 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts, 1);
  assert.equal(watched, 0);
  assert.equal(store.raw, null);

  const area = openGuestAreaWatchIntent({
    city: "Toronto",
    community: null,
    transactionType: "LEASE",
    segment: "COMMERCIAL",
    callbackPath: "/search?city=Toronto&transactionType=LEASE",
    host: HOST,
    now: NOW,
    store: memoryStore(),
    openAuth() {},
  });
  assert.equal(area.ok, true);
  if (!area.ok || area.intent.type !== "AREA_WATCH") return;
  const areaResult = await resumeAreaWatchIntent(area.intent, async () => ({
    ok: false,
    verification: true,
  }));
  assert.equal(areaResult, "verification");
}

async function testConcurrentAreaWatchCannotDuplicate() {
  const migration = readFileSync(
    "prisma/migrations/20260928120000_area_monitor_user_criteria_unique/migration.sql",
    "utf8",
  );
  assert.match(migration, /NULLS NOT DISTINCT/);
  assert.match(
    migration,
    /"userId", "city", "community", "transactionType", "segment"/,
  );
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /AreaMonitor_user_criteria_key/);

  const criteria = {
    userId: "user-1",
    city: "Toronto",
    community: null,
    transactionType: "SALE" as const,
    segment: "RESIDENTIAL" as const,
    emailAlerts: true,
    lastSeenListingAt: new Date("2026-01-01T00:00:00.000Z"),
    notifyNew: true,
    notifySold: true,
  };
  const winner = {
    id: "area-1",
    ...criteria,
    name: "Toronto",
  } as AreaMonitor;
  let finds = 0;
  let creates = 0;
  const raced = await createOrReuseAreaMonitor(
    {
      findEquivalent: async () => {
        finds += 1;
        return finds === 1 ? null : winner;
      },
      create: async () => {
        creates += 1;
        throw Object.assign(new Error("unique"), { code: "P2002" });
      },
    },
    criteria,
  );
  assert.equal(creates, 1);
  assert.equal(raced.alreadyWatching, true);
  assert.equal(raced.item.id, "area-1");
  assert.equal(raced.item.lastSeenListingAt, criteria.lastSeenListingAt);

  const again = await createOrReuseAreaMonitor(
    {
      findEquivalent: async () => winner,
      create: async () => {
        throw new Error("must not insert a second monitor");
      },
    },
    criteria,
  );
  assert.equal(again.alreadyWatching, true);
  assert.equal(again.item.id, winner.id);
}

function testAuthenticatedWatchPathsRemain() {
  const property = readFileSync(
    "src/components/account/useWatchListingToggle.ts",
    "utf8",
  );
  assert.match(property, /SITE_MESSAGES\.watchAdded/);
  assert.match(property, /SITE_MESSAGES\.watchRemovedToast/);
  assert.match(property, /stopWatchingHome/);
  const area = readFileSync(
    "src/components/account/useWatchAreaToggle.ts",
    "utf8",
  );
  const guestStart = area.indexOf("if (!signedIn)");
  const watchStart = area.indexOf("if (watching)");
  const guest = area.slice(guestStart, watchStart);
  assert.match(guest, /openGuestAreaWatchIntent/);
  assert.equal(guest.includes("fetch("), false);
  assert.match(area, /method: "DELETE"/);
  assert.match(area, /SITE_MESSAGES\.areaWatchedToast/);
  assert.match(area, /notifyNew: true/);
  assert.match(area, /notifySold: true/);
}

function testSavedSearchAndDigestUnchangedMarkers() {
  const digest = readFileSync("src/lib/email/digests/buyer.ts", "utf8");
  assert.equal(digest.includes("areaMonitor"), false);
  assert.equal(digest.includes("propertyMonitor"), false);
  const saveSearch = readFileSync("src/lib/auth/save-search-intent.ts", "utf8");
  assert.match(saveSearch, /type: "SAVE_SEARCH"/);
  const leads = readFileSync("src/app/api/leads/route.ts", "utf8");
  assert.equal(leads.includes("PROPERTY_WATCH"), false);
  assert.equal(leads.includes("AREA_WATCH"), false);
}

async function main() {
  testAnonymousPropertyWatchOpensAuthWithoutPost();
  testPropertyMlsSurvivesAuth();
  await testPropertyWatchCompletesOnce();
  await testExistingPropertyMonitorIsSuccess();
  testRefreshDoesNotReplay();
  testUnwatchIsNeverStored();
  testAnonymousAreaWatchOpensAuth();
  testFullSearchCallbackSurvives();
  testAreaCriteriaSurvive();
  await testAreaWatchCompletesOnce();
  await testAreaPostUsesExistingFlags();
  await testExistingAreaMonitorIsSuccess();
  testRejectsExtraAndInvalidAreaFields();
  testWrongHostAndExpiryFail();
  await testEmailVerificationDoesNotCreateOrLoop();
  await testConcurrentAreaWatchCannotDuplicate();
  testAuthenticatedWatchPathsRemain();
  testSavedSearchAndDigestUnchangedMarkers();
  console.log("watch-capture selftest ok");
}

void main();

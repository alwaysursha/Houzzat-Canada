/**
 * Capture intent foundation. No database and no feature side effects.
 * Run: pnpm capture-intent:selftest
 */
import assert from "node:assert/strict";
import { authSuccessReturnPath } from "../src/lib/auth/safe-callback-url";
import {
  CAPTURE_INTENT_TTL_MS,
  consumePendingIntent,
  createCaptureIntent,
  requireAuthForIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  dispatchPendingCaptureIntent,
  registerCaptureIntentHandler,
  subscribeCaptureIntentHandlers,
} from "../src/lib/auth/capture-intent-dispatch";
import {
  openGuestSaveListingIntent,
  resumeSavedListingIntent,
} from "../src/lib/auth/save-listing-intent";
import {
  openGuestSaveSearchIntent,
  resumeSavedSearchIntent,
  savedSearchPayloadFromCallback,
} from "../src/lib/auth/save-search-intent";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";
import { searchPageHref } from "../src/lib/listings/search-page-href";

function memoryStore(initial: string | null = null): CaptureIntentStore & {
  raw: string | null;
} {
  return {
    raw: initial,
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

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;

function testSurvivesAuthAndPreservesCallback() {
  const store = memoryStore();
  let opened: { mode?: string; callbackUrl: string } | null = null;
  const saved = requireAuthForIntent({
    draft: {
      type: "SAVE_LISTING",
      callbackPath: "/listing/12-main-st/W1234567",
      mlsNumber: "w1234567",
    },
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened = options;
    },
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.intent.callbackPath, "/listing/12-main-st/W1234567");
  assert.equal(
    opened?.callbackUrl,
    authSuccessReturnPath("/listing/12-main-st/W1234567"),
  );
  assert.equal(saved.intent.type, "SAVE_LISTING");
  if (saved.intent.type === "SAVE_LISTING") {
    assert.equal(saved.intent.mlsNumber, "W1234567");
  }
  assert.equal(store.raw == null, false);

  const first = consumePendingIntent(store, { host: HOST, now: NOW + 1_000 });
  assert.equal(first.ok, true);
  if (first.ok && first.intent.type === "SAVE_LISTING") {
    assert.equal(first.intent.mlsNumber, "W1234567");
    assert.equal(first.intent.callbackPath, saved.intent.callbackPath);
  }
  const second = consumePendingIntent(store, { host: HOST, now: NOW + 1_000 });
  assert.deepEqual(second, { ok: false, reason: "none" });
}

function testExpiry() {
  const created = createCaptureIntent(
    {
      type: "VIEW_LISTING",
      callbackPath: "/listing/1-king/C999",
      mlsNumber: "C999",
    },
    { host: HOST, now: NOW },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const store = memoryStore();
  store.set(JSON.stringify({ v: 1, intent: created.intent }));
  const expired = consumePendingIntent(store, {
    host: HOST,
    now: NOW + CAPTURE_INTENT_TTL_MS + 1,
  });
  assert.deepEqual(expired, { ok: false, reason: "expired" });
  assert.equal(store.raw, null);
}

function testInvalidAndMalformed() {
  const badMls = createCaptureIntent(
    {
      type: "CONTACT_AGENT",
      callbackPath: "/listing/1/W1",
      mlsNumber: "no",
    },
    { host: HOST, now: NOW },
  );
  assert.deepEqual(badMls, { ok: false, reason: "invalid" });

  const external = createCaptureIntent(
    {
      type: "START_CHAT",
      callbackPath: "https://evil.example/chat",
    },
    { host: HOST, now: NOW },
  );
  assert.deepEqual(external, { ok: false, reason: "invalid" });

  const store = memoryStore();
  store.set("{not json");
  assert.deepEqual(consumePendingIntent(store, { host: HOST, now: NOW }), {
    ok: false,
    reason: "invalid",
  });

  const poisoned = memoryStore();
  const created = createCaptureIntent(
    { type: "START_CHAT", callbackPath: "/chat" },
    { host: HOST, now: NOW },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  poisoned.set(
    JSON.stringify({
      v: 1,
      intent: { ...created.intent, password: "secret" },
    }),
  );
  assert.deepEqual(consumePendingIntent(poisoned, { host: HOST, now: NOW }), {
    ok: false,
    reason: "invalid",
  });
  assert.equal(poisoned.raw, null);
}

function testCrossHostCannotReplay() {
  const store = memoryStore();
  const calls: string[] = [];
  const unregister = registerCaptureIntentHandler("ROUTE_PLANNER", () => {
    calls.push("ran");
  });
  const saved = requireAuthForIntent({
    draft: { type: "ROUTE_PLANNER", callbackPath: "/route-planner", mlsNumber: "W55" },
    host: "tenant-a.example",
    now: NOW,
    store,
    openAuth() {},
  });
  assert.equal(saved.ok, true);
  const wrong = dispatchPendingCaptureIntent(store, {
    host: "tenant-b.example",
    now: NOW,
  });
  assert.deepEqual(wrong, { status: "rejected", reason: "host_mismatch" });
  assert.deepEqual(calls, []);
  const again = dispatchPendingCaptureIntent(store, {
    host: "tenant-a.example",
    now: NOW,
  });
  assert.deepEqual(again, { status: "none" });
  unregister();
}

function testConsumedOnceAndAuthWithoutIntent() {
  const store = memoryStore();
  const calls: string[] = [];
  const unregister = registerCaptureIntentHandler("SAVE_SEARCH", (intent) => {
    if (intent.type === "SAVE_SEARCH") calls.push(intent.callbackPath);
  });
  requireAuthForIntent({
    draft: {
      type: "SAVE_SEARCH",
      callbackPath: "/search?city=Toronto",
    },
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.equal(first.status, "ready");
  if (first.status === "ready") assert.equal(first.handled, true);
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.deepEqual(second, { status: "none" });
  assert.deepEqual(calls, ["/search?city=Toronto"]);
  unregister();

  const empty = memoryStore();
  const idle: string[] = [];
  const stop = registerCaptureIntentHandler("START_CHAT", () => {
    idle.push("ran");
  });
  assert.deepEqual(
    dispatchPendingCaptureIntent(empty, { host: HOST, now: NOW }),
    { status: "none" },
  );
  assert.deepEqual(idle, []);
  stop();
}

function testValidIntentWaitsUntilHandlerExists() {
  const store = memoryStore();
  requireAuthForIntent({
    draft: {
      type: "PROPERTY_WATCH",
      callbackPath: "/listing/2/E100",
      mlsNumber: "E100",
    },
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const held = store.raw;
  const waiting = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.equal(waiting.status, "waiting");
  if (waiting.status === "waiting") {
    assert.equal(waiting.intent.type, "PROPERTY_WATCH");
  }
  assert.equal(store.raw, held);

  let ran = 0;
  const stopListen = subscribeCaptureIntentHandlers(() => {
    dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  });
  const stop = registerCaptureIntentHandler("PROPERTY_WATCH", () => {
    ran += 1;
  });
  assert.equal(ran, 1);
  assert.equal(store.raw, null);
  const again = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.deepEqual(again, { status: "none" });
  assert.equal(ran, 1);
  stop();
  stopListen();
}

const LISTING_PATH = "/listing/12-main-st/W123456";

function testAnonymousSaveOpensAuthWithListingCallback() {
  const store = memoryStore();
  const opened: { mode?: string; callbackUrl: string }[] = [];
  const saved = openGuestSaveListingIntent({
    mlsNumber: "w123456",
    callbackPath: LISTING_PATH,
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options);
    },
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(opened, [
    { mode: "sign-in", callbackUrl: LISTING_PATH, intent: "SAVE_LISTING" },
  ]);
  if (saved.ok) {
    assert.equal(saved.intent.type, "SAVE_LISTING");
    assert.equal(saved.intent.mlsNumber, "W123456");
    assert.equal(saved.intent.callbackPath, LISTING_PATH);
  }
}

async function resumeSaveAfterAuth(mode: "sign-in" | "sign-up") {
  const store = memoryStore();
  const opened: string[] = [];
  const saved = requireAuthForIntent({
    draft: {
      type: "SAVE_LISTING",
      callbackPath: LISTING_PATH,
      mlsNumber: "W123456",
    },
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options.callbackUrl);
    },
    mode,
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(opened, [LISTING_PATH]);

  const posts: string[] = [];
  const stop = registerCaptureIntentHandler("SAVE_LISTING", (intent) =>
    resumeSavedListingIntent(intent, {
      save: async (mlsNumber) => {
        posts.push(mlsNumber);
        return { ok: true };
      },
      onSaved() {
        posts.push("ui");
      },
    }),
  );
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.equal(first.status, "ready");
  assert.deepEqual(second, { status: "none" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(posts, ["W123456", "ui"]);
  assert.equal(store.raw, null);
  stop();
}

async function testAlreadySavedIsIdempotent() {
  const store = memoryStore();
  openGuestSaveListingIntent({
    mlsNumber: "W123456",
    callbackPath: LISTING_PATH,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", (intent) =>
    resumeSavedListingIntent(intent, {
      save: async () => {
        posts += 1;
        return { ok: true };
      },
      onSaved() {},
    }),
  );
  assert.equal(
    dispatchPendingCaptureIntent(store, { host: HOST, now: NOW }).status,
    "ready",
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts, 1);
  assert.equal(store.raw, null);
  assert.deepEqual(
    dispatchPendingCaptureIntent(store, { host: HOST, now: NOW }),
    { status: "none" },
  );
  stop();
}

async function testSaveFailureDoesNotReplay() {
  const store = memoryStore();
  openGuestSaveListingIntent({
    mlsNumber: "W123456",
    callbackPath: LISTING_PATH,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", (intent) =>
    resumeSavedListingIntent(intent, {
      save: async () => {
        posts += 1;
        return { ok: false };
      },
      onSaved() {
        posts += 100;
      },
    }),
  );
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts, 1);
  assert.equal(store.raw, null);
  stop();
}

async function testSuccessfulSaveDoesNotRunTwiceAfterRefresh() {
  const store = memoryStore();
  openGuestSaveListingIntent({
    mlsNumber: "W123456",
    callbackPath: LISTING_PATH,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", (intent) =>
    resumeSavedListingIntent(intent, {
      save: async () => {
        posts += 1;
        return { ok: true };
      },
      onSaved() {},
    }),
  );
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.raw, null);
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts, 1);
  stop();
}

function testWrongHostSaveDoesNotExecute() {
  const store = memoryStore();
  openGuestSaveListingIntent({
    mlsNumber: "W123456",
    callbackPath: LISTING_PATH,
    host: "tenant-a.example",
    now: NOW,
    store,
    openAuth() {},
  });
  let posts = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", (intent) =>
    resumeSavedListingIntent(intent, {
      save: async () => {
        posts += 1;
        return { ok: true };
      },
      onSaved() {},
    }),
  );
  const wrong = dispatchPendingCaptureIntent(store, {
    host: "tenant-b.example",
    now: NOW,
  });
  assert.deepEqual(wrong, { status: "rejected", reason: "host_mismatch" });
  assert.equal(posts, 0);
  assert.equal(store.raw, null);
  stop();
}

function testAuthenticatedSessionWithoutIntentDoesNotSave() {
  const store = memoryStore();
  let posts = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", () => {
    posts += 1;
  });
  assert.deepEqual(
    dispatchPendingCaptureIntent(store, { host: HOST, now: NOW }),
    { status: "none" },
  );
  assert.equal(posts, 0);
  stop();
}

async function testResumePostsExistingSavedListingsEndpoint() {
  const created = createCaptureIntent(
    {
      type: "SAVE_LISTING",
      callbackPath: LISTING_PATH,
      mlsNumber: "W123456",
    },
    { host: HOST, now: NOW },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    assert.equal(String(input), "/api/saved-listings");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    const body = JSON.parse(String(init?.body)) as { mlsNumber?: string };
    assert.equal(body.mlsNumber, "W123456");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await resumeSavedListingIntent(created.intent);
    assert.equal(result, "saved");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
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

function testAnonymousFilteredSearchKeepsQuery() {
  const href = filteredSearchHref();
  assert.equal(href.startsWith("/search?"), true);
  assert.equal(href === "/search", false);
  assert.match(href, /city=Toronto/);
  assert.match(href, /community=The\+Beaches/);
  assert.match(href, /minBeds=2/);
  assert.match(href, /minPrice=2500/);
  assert.match(href, /maxPrice=4000/);
  assert.match(href, /transactionType=LEASE/);
  assert.match(href, /propertyTypes=CONDO_APT/);
  assert.match(href, /view=map/);
  assert.match(href, /q=waterfront/);

  const store = memoryStore();
  const opened: { mode?: string; callbackUrl: string }[] = [];
  const saved = openGuestSaveSearchIntent({
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options);
    },
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(opened, [
    { mode: "sign-in", callbackUrl: href, intent: "SAVE_SEARCH" },
  ]);
  if (saved.ok) {
    assert.equal(saved.intent.type, "SAVE_SEARCH");
    assert.equal(saved.intent.callbackPath, href);
  }
  const payload = savedSearchPayloadFromCallback(href);
  assert.ok(payload);
  assert.equal(payload?.name, "The Beaches rentals");
  assert.equal(payload?.query.city, "Toronto");
  assert.equal(payload?.query.community, "The Beaches");
  assert.equal(payload?.query.minBeds, "2");
  assert.equal(payload?.query.minBaths, "1");
  assert.equal(payload?.query.minPrice, "2500");
  assert.equal(payload?.query.maxPrice, "4000");
  assert.equal(payload?.query.transactionType, "LEASE");
  assert.equal(payload?.query.propertyTypes, "CONDO_APT");
  assert.equal(payload?.query.openHouseOnly, "1");
  assert.equal(payload?.query.sort, "price_asc");
  assert.equal("view" in (payload?.query ?? {}), false);
  assert.equal("q" in (payload?.query ?? {}), false);
}

async function resumeSearchAfterAuth(mode: "sign-in" | "sign-up") {
  const href = filteredSearchHref();
  const store = memoryStore();
  const opened: string[] = [];
  requireAuthForIntent({
    draft: { type: "SAVE_SEARCH", callbackPath: href },
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options.callbackUrl);
    },
    mode,
  });
  assert.deepEqual(opened, [href]);
  const posts: Record<string, unknown>[] = [];
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", (intent) =>
    resumeSavedSearchIntent(intent, {
      list: async () => ({ ok: true, items: [] }),
      create: async (input) => {
        posts.push(input.query);
        return { ok: true };
      },
      onSaved() {},
      onNeedsConfirm() {},
    }),
  );
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  assert.equal(first.status, "ready");
  assert.deepEqual(second, { status: "none" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.city, "Toronto");
  assert.equal(posts[0]?.minBeds, "2");
  assert.equal(posts[0]?.transactionType, "LEASE");
  assert.equal(store.raw, null);
  stop();
}

async function testDuplicateSavedSearchDoesNotCreateAnother() {
  const href = filteredSearchHref();
  const store = memoryStore();
  openGuestSaveSearchIntent({
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  const payload = savedSearchPayloadFromCallback(href);
  assert.ok(payload);
  let creates = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", (intent) =>
    resumeSavedSearchIntent(intent, {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: payload?.query ?? {} }],
      }),
      create: async () => {
        creates += 1;
        return { ok: true };
      },
      onSaved() {},
      onNeedsConfirm() {},
    }),
  );
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(creates, 0);
  assert.equal(store.raw, null);
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(creates, 0);
  stop();
}

async function testDifferentExistingSearchConfirmsOnce() {
  const href = filteredSearchHref();
  const store = memoryStore();
  openGuestSaveSearchIntent({
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let creates = 0;
  let confirms = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", (intent) =>
    resumeSavedSearchIntent(intent, {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: { city: "Ottawa" } }],
      }),
      create: async () => {
        creates += 1;
        return { ok: true };
      },
      onSaved() {},
      onNeedsConfirm() {
        confirms += 1;
      },
    }),
  );
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(creates, 0);
  assert.equal(confirms, 1);
  assert.equal(store.raw, null);
  stop();
}

async function testSearchSaveFailureDoesNotReplay() {
  const href = filteredSearchHref();
  const store = memoryStore();
  openGuestSaveSearchIntent({
    callbackPath: href,
    host: HOST,
    now: NOW,
    store,
    openAuth() {},
  });
  let creates = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", (intent) =>
    resumeSavedSearchIntent(intent, {
      list: async () => ({ ok: true, items: [] }),
      create: async () => {
        creates += 1;
        return { ok: false };
      },
      onSaved() {},
      onNeedsConfirm() {},
    }),
  );
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(creates, 1);
  assert.equal(store.raw, null);
  stop();
}

function testWrongHostSearchDoesNotExecute() {
  const store = memoryStore();
  openGuestSaveSearchIntent({
    callbackPath: filteredSearchHref(),
    host: "tenant-a.example",
    now: NOW,
    store,
    openAuth() {},
  });
  let creates = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", () => {
    creates += 1;
  });
  const wrong = dispatchPendingCaptureIntent(store, {
    host: "tenant-b.example",
    now: NOW,
  });
  assert.deepEqual(wrong, { status: "rejected", reason: "host_mismatch" });
  assert.equal(creates, 0);
  assert.equal(store.raw, null);
  stop();
}

function testAuthenticatedSearchWithoutIntentDoesNotSave() {
  const store = memoryStore();
  let creates = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", () => {
    creates += 1;
  });
  assert.deepEqual(
    dispatchPendingCaptureIntent(store, { host: HOST, now: NOW }),
    { status: "none" },
  );
  assert.equal(creates, 0);
  stop();
}

async function main() {
  testSurvivesAuthAndPreservesCallback();
  testExpiry();
  testInvalidAndMalformed();
  testCrossHostCannotReplay();
  testConsumedOnceAndAuthWithoutIntent();
  testValidIntentWaitsUntilHandlerExists();
  testAnonymousSaveOpensAuthWithListingCallback();
  await resumeSaveAfterAuth("sign-up");
  await resumeSaveAfterAuth("sign-in");
  await testAlreadySavedIsIdempotent();
  await testSaveFailureDoesNotReplay();
  await testSuccessfulSaveDoesNotRunTwiceAfterRefresh();
  testWrongHostSaveDoesNotExecute();
  testAuthenticatedSessionWithoutIntentDoesNotSave();
  await testResumePostsExistingSavedListingsEndpoint();
  testAnonymousFilteredSearchKeepsQuery();
  await resumeSearchAfterAuth("sign-up");
  await resumeSearchAfterAuth("sign-in");
  await testDuplicateSavedSearchDoesNotCreateAnother();
  await testDifferentExistingSearchConfirmsOnce();
  await testSearchSaveFailureDoesNotReplay();
  testWrongHostSearchDoesNotExecute();
  testAuthenticatedSearchWithoutIntentDoesNotSave();
  console.log("capture-intent selftest passed");
}

void main();

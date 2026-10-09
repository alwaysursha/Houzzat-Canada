/**
 * Active Search Memory (Phase A) — precedence, tenant scope, no SavedSearch writes.
 * Run: node --import tsx scripts/active-search-memory-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIVE_SEARCH_MEMORY_KEY_PREFIX,
  activeSearchMemoryKey,
  clearActiveSearchMemory,
  isConsumerSearchPath,
  loadActiveSearchMemory,
  resolveActiveSearchRestoreHref,
  saveActiveSearchMemory,
  urlHasExplicitSearchCriteria,
  urlHasExplicitView,
} from "../src/lib/listings/search-state/active-search-memory";
import { serializeSearchUrl } from "../src/lib/listings/search-state/serialize";
import { parseSearchUrl } from "../src/lib/listings/search-state/parse";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const store = new Map<string, string>();
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  },
});
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { hostname: "tenant-a.example", origin: "https://tenant-a.example" },
});

// --- Path gating ---
assert.equal(isConsumerSearchPath("/search"), true);
assert.equal(isConsumerSearchPath("/admin/search"), false);
assert.equal(isConsumerSearchPath("/agent/search"), false);

// --- Explicit criteria detection ---
assert.equal(urlHasExplicitSearchCriteria(""), false);
assert.equal(urlHasExplicitSearchCriteria("transactionType=SALE"), false);
assert.equal(urlHasExplicitSearchCriteria("view=map"), false);
assert.equal(urlHasExplicitSearchCriteria("view=split"), false);
assert.equal(urlHasExplicitSearchCriteria("city=Mississauga"), true);
assert.equal(
  urlHasExplicitSearchCriteria("cities=Mississauga%7CBrampton"),
  true,
);
assert.equal(urlHasExplicitSearchCriteria("minBeds=3"), true);
assert.equal(urlHasExplicitSearchCriteria("transactionType=LEASE"), true);
assert.equal(urlHasExplicitSearchCriteria("status=SOLD"), true);
assert.equal(urlHasExplicitView("view=map"), true);
assert.equal(urlHasExplicitView("city=X"), false);

// --- Persist + load + tenant key ---
clearActiveSearchMemory("ws-a");
const href = serializeSearchUrl(
  parseSearchUrl("city=Mississauga&minBeds=3&view=split&transactionType=SALE"),
);
saveActiveSearchMemory(href, { scope: "ws-a", now: 1000 });
assert.equal(activeSearchMemoryKey("ws-a").startsWith(ACTIVE_SEARCH_MEMORY_KEY_PREFIX), true);
const loaded = loadActiveSearchMemory("ws-a");
assert.ok(loaded);
assert.equal(loaded!.href.includes("Mississauga"), true);
assert.equal(loaded!.href.includes("minBeds=3"), true);
assert.equal(loadActiveSearchMemory("ws-b"), null);

// --- Scenario 5: multi-city preserved across restore ---
const multi = serializeSearchUrl(
  parseSearchUrl(
    "cities=Toronto%7CMississauga&view=split&transactionType=SALE",
  ),
);
saveActiveSearchMemory(multi, { scope: "ws-a", now: 2000 });
const multiLoaded = loadActiveSearchMemory("ws-a");
assert.ok(multiLoaded);
assert.match(multiLoaded!.href, /cities=/);
assert.ok(multiLoaded!.href.includes("Toronto"));
assert.ok(multiLoaded!.href.includes("Mississauga"));

const homeToSearch = resolveActiveSearchRestoreHref({
  memoryHref: multiLoaded!.href,
  currentParams: new URLSearchParams(""),
});
assert.ok(homeToSearch);
assert.ok(homeToSearch!.includes("Toronto"));
assert.ok(homeToSearch!.includes("Mississauga"));

// --- Scenario 1: explicit Oakville URL wins over stored multi-city ---
assert.equal(
  urlHasExplicitSearchCriteria("city=Oakville&view=cards"),
  true,
  "homepage Oakville search must be treated as explicit",
);

// --- Scenario 3: direct URL with filters wins (no restore path) ---
assert.equal(
  urlHasExplicitSearchCriteria("city=Brampton&minBeds=3&maxPrice=900000"),
  true,
);

// --- Scenario 4: explicit view merges onto remembered criteria ---
const withCards = resolveActiveSearchRestoreHref({
  memoryHref: multiLoaded!.href,
  currentParams: new URLSearchParams("view=cards"),
});
assert.ok(withCards);
assert.match(withCards!, /view=cards/);
assert.ok(withCards!.includes("Toronto"));
const withSplit = resolveActiveSearchRestoreHref({
  memoryHref: multiLoaded!.href,
  currentParams: new URLSearchParams("view=split"),
});
assert.ok(withSplit);
assert.match(withSplit!, /view=split/);

// --- Scenario 2: reset/clear persists empty cities; refresh stays cleared ---
const cleared = serializeSearchUrl(
  parseSearchUrl("transactionType=SALE&view=cards"),
);
saveActiveSearchMemory(cleared, { scope: "ws-a", now: 3000 });
const afterClear = loadActiveSearchMemory("ws-a");
assert.ok(afterClear);
assert.equal(afterClear!.href.includes("city="), false);
assert.equal(afterClear!.href.includes("cities="), false);
const restoreCleared = resolveActiveSearchRestoreHref({
  memoryHref: afterClear!.href,
  currentParams: new URLSearchParams(""),
});
assert.ok(restoreCleared);
assert.equal(restoreCleared!.includes("city="), false);
assert.equal(restoreCleared!.includes("cities="), false);

// --- Scenario 7: tenant keys isolated ---
saveActiveSearchMemory(
  serializeSearchUrl(parseSearchUrl("city=Caledon&view=cards")),
  { scope: "ws-tenant-b", now: 4000 },
);
assert.ok(loadActiveSearchMemory("ws-tenant-b")!.href.includes("Caledon"));
assert.equal(
  loadActiveSearchMemory("ws-a")!.href.includes("Caledon"),
  false,
  "tenant A must not read tenant B memory",
);

// --- Scenario 8: malformed / missing storage does not throw ---
store.set(activeSearchMemoryKey("ws-bad"), "{not-json");
assert.equal(loadActiveSearchMemory("ws-bad"), null);
store.set(
  activeSearchMemoryKey("ws-bad2"),
  JSON.stringify({ v: 99, href: "/search?city=X", updatedAt: 1 }),
);
assert.equal(loadActiveSearchMemory("ws-bad2"), null);
assert.equal(loadActiveSearchMemory("ws-missing"), null);

// --- Scenario 9: bare URL without memory → no restore href required ---
assert.equal(urlHasExplicitSearchCriteria("view=cards"), false);
assert.equal(urlHasExplicitSearchCriteria(""), false);

// --- Scenario 6 / restore persist: skipNextPersist must clear on equal href ---
const hookSrc = read("src/lib/listings/search-state/use-committed-search.ts");
assert.ok(
  hookSrc.includes("skipNextPersistRef.current = false"),
  "restore skip flag must be consumable so the next commit persists",
);
assert.ok(
  /pageHref === lastWrittenHrefRef\.current\)\s*\{\s*skipNextPersistRef\.current = false/s.test(
    hookSrc,
  ),
  "equal-href path after restore must clear skipNextPersist",
);

// --- Source guards: no SavedSearch / alert / qualification writes ---
const memorySrc = read("src/lib/listings/search-state/active-search-memory.ts");
assert.equal(memorySrc.includes("SavedSearch"), false);
assert.equal(memorySrc.includes("/api/"), false);
assert.ok(hookSrc.includes("loadActiveSearchMemory"));
assert.ok(hookSrc.includes("saveActiveSearchMemory"));
assert.ok(hookSrc.includes("urlHasExplicitSearchCriteria"));
assert.ok(hookSrc.includes("isConsumerSearchPath"));

const authSrc = read("src/components/auth/AuthModalProvider.tsx");
assert.ok(authSrc.includes("acquireScrollLock"));
assert.ok(authSrc.includes("visualViewportOverlayStyle"));

const tourSrc = read("src/components/auth/lead-funnel/TourThisHomePrompt.tsx");
assert.ok(tourSrc.includes("Want to view this home in person?"));
assert.ok(tourSrc.includes("safe-area-inset-bottom"));
assert.ok(tourSrc.includes("--mobile-bottom-nav"));
assert.doesNotMatch(
  tourSrc,
  /Want to view this home in person\?[\s\S]*MLS|MLS#[\s\S]*Want to view/,
);

console.log("active-search-memory selftest: PASS");

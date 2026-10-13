/**
 * Phase 1 Search UX: filter panel sizing, draft cities, Apply footer.
 * Run: node --import tsx scripts/search-filters-panel-stability-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";
import { openGuestSaveSearchIntent } from "../src/lib/auth/save-search-intent";
import type { CaptureIntentStore } from "../src/lib/auth/capture-intent";
import {
  searchFiltersFromHref,
  searchPageHref,
} from "../src/lib/listings/search-page-href";
import { computeFlyoutFixedStyle } from "../src/lib/use-flyout-fixed-style";
import { visualViewportOverlayStyle } from "../src/lib/visual-viewport-overlay-style";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const menu = read("src/components/listings/SearchFiltersMenu.tsx");
const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
const experience = read("src/components/listings/SearchExperience.tsx");
const flyoutHook = read("src/lib/use-flyout-fixed-style.ts");
const cityField = read("src/components/listings/StructuredCityField.tsx");
const vvOverlay = read("src/lib/visual-viewport-overlay-style.ts");

// --- Desktop flyout: definite height + flex scroll/footer ---
assert.match(menu, /lockHeight:\s*true/);
assert.match(menu, /data-search-filters-flyout=""/);
assert.match(menu, /data-search-filters-apply=""/);
assert.match(menu, /min-h-0 min-w-0 flex-1/);
assert.match(menu, /overflow-x-hidden overflow-y-auto/);
assert.match(flyoutHook, /lockHeight/);
assert.match(flyoutHook, /export function computeFlyoutFixedStyle/);
assert.match(flyoutHook, /visualViewport/);

// Default consumers must not be forced into lockHeight
assert.doesNotMatch(
  read("src/components/account/SavedSearchesMenuButton.tsx"),
  /lockHeight/,
);

// Closed customer-tool flyouts stay portaled on body; without position:fixed they
// re-enter document flow and create scrollable empty space below the footer.
const savedSearchesMenu = read(
  "src/components/account/SavedSearchesMenuButton.tsx",
);
const customerToolsMenus = read("src/components/account/CustomerToolsMenus.tsx");
assert.match(savedSearchesMenu, /"fixed transition"/);
assert.match(customerToolsMenus, /"fixed transition"/);
assert.equal(
  (customerToolsMenus.match(/"fixed transition"/g) || []).length,
  2,
  "Saved homes + watchlist flyouts must both stay fixed when closed",
);
assert.doesNotMatch(
  read("src/components/agent/ActivityFilters.tsx"),
  /lockHeight/,
);

// Short desktop viewport: locked height equals maxHeight and stays in budget
const short = computeFlyoutFixedStyle(
  { top: 48, bottom: 80, left: 24, right: 120 },
  { width: 1280, height: 600 },
  400,
  { lockHeight: true },
);
assert.equal(short.position, "fixed");
assert.equal(typeof short.maxHeight, "number");
assert.equal(short.height, short.maxHeight);
assert.ok((short.maxHeight as number) <= 600 - 80 - 12 - 4);
assert.ok((short.width as number) <= 400);
assert.ok(
  (short.top as number) + (short.height as number) <= 600 - 12,
  "locked panel must stay inside viewport",
);

// Trigger near bottom: place above and fit available gap (no MIN_HEIGHT spill)
const nearBottom = computeFlyoutFixedStyle(
  { top: 520, bottom: 552, left: 40, right: 140 },
  { width: 1280, height: 600 },
  400,
  { lockHeight: true },
);
assert.ok((nearBottom.top as number) < 520, "opens above when below is tight");
assert.equal(nearBottom.height, nearBottom.maxHeight);
assert.ok(
  (nearBottom.top as number) + (nearBottom.height as number) <= 600 - 12,
);
assert.ok((nearBottom.height as number) <= 520 - 12 - 4);

// Tiny available gap: lockHeight must not force 140px past the edge
const tinyGap = computeFlyoutFixedStyle(
  { top: 40, bottom: 560, left: 24, right: 120 },
  { width: 1280, height: 600 },
  400,
  { lockHeight: true },
);
assert.ok((tinyGap.height as number) < 140);
assert.ok(
  (tinyGap.top as number) + (tinyGap.height as number) <= 600 - 12,
);

// Many chips / resize: width clamps; height recalculates for short space
const cramped = computeFlyoutFixedStyle(
  { top: 40, bottom: 72, left: 8, right: 100 },
  { width: 360, height: 420 },
  400,
  { lockHeight: true },
);
assert.ok((cramped.width as number) <= 360 - 24);
assert.ok((cramped.height as number) >= 1);
assert.equal(cramped.height, cramped.maxHeight);
assert.ok(
  (cramped.top as number) + (cramped.height as number) <= 420 - 12,
);

const unlocked = computeFlyoutFixedStyle(
  { top: 48, bottom: 80, left: 24, right: 120 },
  { width: 1280, height: 800 },
  256,
);
assert.equal(unlocked.height, undefined);
assert.ok(typeof unlocked.maxHeight === "number");
// Unlocked consumers keep previous MIN_HEIGHT inflation behavior
assert.ok((unlocked.maxHeight as number) >= 140);

// --- Draft cities until Apply ---
assert.match(menu, /const \[draftCities, setDraftCities\]/);
assert.match(menu, /onCitiesChange=\{setDraftCities\}/);
assert.match(menu, /function commitDraft\(/);
assert.match(menu, /onCommitFilters/);
assert.match(experience, /commitFiltersWithCities/);
assert.match(experience, /onCommitFilters=\{commitFiltersWithCities\}/);

// Buy/Rent lives in the desktop toolbar; More Filters starts at segment/location.
assert.doesNotMatch(menu, /title="Buy \/ Rent"/);
assert.match(experience, /aria-label="Buy or rent"/);
assert.match(menu, /title="Location"/);
const locationBlock = menu.slice(
  menu.indexOf('Section title="Location"'),
  menu.indexOf("data-search-filters-apply"),
);
assert.match(locationBlock, /cities=\{draftCities\}/);
assert.match(locationBlock, /onCitiesChange=\{setDraftCities\}/);
assert.doesNotMatch(locationBlock, /onCitiesChange=\{onCitiesChange\}/);
assert.match(sheet, /title="Buy \/ Rent"/);
assert.match(sheet, /title="Residential \/ Commercial"/);

// Close / Escape discard: setOpen(false) without commitDraft
assert.match(menu, /if \(event\.key === "Escape" && !confirmOpen\) setOpen\(false\)/);
const closeBtn = menu.slice(
  menu.indexOf('aria-label="Close filters"'),
  menu.indexOf('aria-label="Close filters"') + 220,
);
assert.match(closeBtn, /setOpen\(false\)/);
assert.doesNotMatch(closeBtn, /commitDraft/);

// Apply flushes typed city, commits cities + filters together, then save/CaptureIntent
assert.match(menu, /flushDraftCities/);
assert.match(menu, /commitDraft\(nextCities\);\s*\n\s*const ok = await persist\(false, nextCities\)/s);
assert.match(menu, /openGuestSaveSearchIntent/);
assert.match(menu, /savePrimarySearch/);
assert.match(menu, /browserCaptureIntentStore/);
assert.match(menu, /searchCallbackPath\(draft, nextCities\)/);

// Chip wrap / no horizontal blowout
assert.match(menu, /flex min-w-0 flex-wrap/);
assert.match(cityField, /min-w-0 flex-wrap/);
assert.match(cityField, /max-w-full/);

// --- Mobile sheet: viewport + sticky Apply ---
assert.match(sheet, /data-search-filters-sheet=""/);
assert.match(sheet, /data-search-filters-overlay=""/);
assert.match(sheet, /data-search-filters-apply=""/);
assert.match(sheet, /visualViewportOverlayStyle/);
assert.match(sheet, /@\/lib\/visual-viewport-overlay-style/);
assert.match(vvOverlay, /offsetLeft/);
assert.match(vvOverlay, /offsetTop/);
assert.match(vvOverlay, /vv\.width/);
assert.match(vvOverlay, /vv\.height/);
assert.match(sheet, /overflow-hidden overscroll-none/);
assert.match(sheet, /fixed top-0 left-0 z-\[90\] h-full w-full/);
assert.doesNotMatch(
  sheet.slice(sheet.indexOf("data-search-filters-overlay")),
  /fixed inset-0/,
);
assert.match(sheet, /absolute inset-y-0 right-0/);
const scrollLock = read("src/lib/scroll-lock.ts");
assert.match(scrollLock, /overflowX = "hidden"/);
assert.match(scrollLock, /documentElement\.style\.overflowX/);
assert.match(scrollLock, /lockCount === 1/);
assert.doesNotMatch(sheet, /prevHtmlOverflowX/);
assert.match(sheet, /min-h-0 min-w-0 flex-1/);
assert.match(sheet, /overflow-x-hidden overflow-y-auto/);
assert.match(sheet, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
assert.match(sheet, /houzzatSearchFilters/);
assert.match(sheet, /acquireScrollLock/);
assert.match(sheet, /history\.back\(\)/);
// VV sync targets the overlay root (not the sliding panel alone)
const vvEffect = sheet.slice(
  sheet.indexOf("Keep the portal root inside the visual viewport"),
  sheet.indexOf("Hardware / browser Back closes Filters"),
);
assert.match(vvEffect, /overlayRef\.current/);
assert.match(vvEffect, /visualViewportOverlayStyle/);
assert.doesNotMatch(vvEffect, /panelRef/);
// Must not size the panel with top/height only (horizontal drift bug)
assert.doesNotMatch(sheet, /el\.style\.top = `\$\{vv\.offsetTop\}px`/);
assert.doesNotMatch(sheet, /el\.style\.height = `\$\{vv\.height\}px`/);
// Draft until Apply (parity with desktop FiltersMenu); flush + atomic commit
assert.match(sheet, /const \[draftCities, setDraftCities\]/);
assert.match(sheet, /onCitiesChange=\{setDraftCities\}/);
assert.match(sheet, /flushDraftCities/);
assert.match(sheet, /commitDraft/);
assert.match(sheet, /onCommitFilters/);
assert.match(sheet, /intendedPathRef/);
assert.match(sheet, /searchCallbackPath/);

// Repeated selections / horizontal VV pans must keep overlay aligned (no drift)
const pans = [
  { offsetLeft: 0, offsetTop: 0, width: 390, height: 720 },
  { offsetLeft: 12, offsetTop: 0, width: 390, height: 720 },
  { offsetLeft: 28, offsetTop: 8, width: 390, height: 640 },
  { offsetLeft: 40, offsetTop: 8, width: 390, height: 640 },
  { offsetLeft: 40, offsetTop: 0, width: 360, height: 720 },
];
let prevLeft = 0;
for (const pan of pans) {
  const style = visualViewportOverlayStyle(pan);
  assert.equal(style.left, `${pan.offsetLeft}px`);
  assert.equal(style.width, `${pan.width}px`);
  assert.equal(style.top, `${pan.offsetTop}px`);
  assert.equal(style.height, `${pan.height}px`);
  assert.equal(style.right, "auto");
  assert.equal(style.bottom, "auto");
  // Overlay tracks the pan — relative sheet position inside overlay stays put
  const leftPx = Number.parseFloat(style.left);
  assert.equal(leftPx, pan.offsetLeft);
  prevLeft = leftPx;
}
assert.equal(prevLeft, pans[pans.length - 1]!.offsetLeft);
// Idempotent for the same VV metrics (repeated Baths/Beds taps)
assert.deepEqual(
  visualViewportOverlayStyle(pans[2]!),
  visualViewportOverlayStyle(pans[2]!),
);
assert.deepEqual(visualViewportOverlayStyle(null).left, "0px");
assert.deepEqual(visualViewportOverlayStyle(null).width, "100%");

// Keyboard open (iOS-like): shorter height, possible offsetTop — width/left stable
const keyboard = visualViewportOverlayStyle({
  offsetLeft: 0,
  offsetTop: 40,
  width: 390,
  height: 420,
});
assert.equal(keyboard.left, "0px");
assert.equal(keyboard.width, "390px");
assert.equal(keyboard.top, "40px");
assert.equal(keyboard.height, "420px");

// Pinch-zoom / horizontal pan: left tracks offsetLeft, width tracks vv.width
const zoomed = visualViewportOverlayStyle({
  offsetLeft: 24,
  offsetTop: 16,
  width: 320,
  height: 568,
});
assert.equal(zoomed.left, "24px");
assert.equal(zoomed.width, "320px");
assert.equal(zoomed.top, "16px");
assert.equal(zoomed.height, "568px");

// --- URL round-trip (cities + filters) ---
const baseFilters: SearchFilters = {
  segment: "RESIDENTIAL",
  transactionType: "SALE",
  dataSource: "",
  city: "",
  community: "The Beaches",
  minPrice: "750000",
  maxPrice: "1200000",
  minBeds: "3",
  minBaths: "2",
  propertyTypes: ["DETACHED", "SEMI_DETACHED", "TOWNHOUSE"],
  openHouseOnly: false,
  statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
  sort: "newest",
};

const href = searchPageHref({
  pathname: "/search",
  filters: baseFilters,
  view: "split",
  cities: "Toronto|Mississauga|Oakville",
});
const parsed = searchFiltersFromHref(href);
assert.ok(parsed);
assert.equal(parsed.community, "The Beaches");
assert.equal(parsed.minBeds, "3");
assert.deepEqual(parsed.propertyTypes, [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
]);
assert.deepEqual(parsed.statuses, ["ACTIVE", "SOLD_CONDITIONAL"]);
assert.match(href, /cities=Toronto%7CMississauga%7COakville|cities=Toronto\|Mississauga\|Oakville/);

// Experience commits filters + cities through the canonical controller
assert.match(experience, /function commitFiltersWithCities/);
assert.match(experience, /commitPatchFromFilters/);
assert.match(
  experience,
  /type:\s*"COMMIT"/,
);
assert.doesNotMatch(experience, /citiesOverride/);

// --- CaptureIntent / Save Search unchanged contract ---
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

const store = memoryStore();
let opened: { mode?: string; callbackUrl: string } | null = null;
const openAuth = (input: { mode?: "sign-in" | "sign-up"; callbackUrl: string }) => {
  opened = input;
};
const callbackPath = searchPageHref({
  pathname: "/search",
  filters: baseFilters,
  view: "map",
  cities: "Toronto|Vaughan",
});
const result = openGuestSaveSearchIntent({
  callbackPath,
  host: "www.houzzat.com",
  now: 1_700_000_000_000,
  store,
  openAuth,
});
assert.equal(result.ok, true);
assert.ok(store.raw);
assert.ok(opened?.callbackUrl.includes("/search"));
assert.match(opened!.callbackUrl, /cities=/);
assert.match(store.raw!, /SAVE_SEARCH/);

console.log("search-filters-panel-stability-selftest: ok");

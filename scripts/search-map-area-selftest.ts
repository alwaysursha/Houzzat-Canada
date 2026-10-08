/**
 * Map-area search: behavioral helpers + source contracts.
 *
 * STATIC: filter panel structure, wiring, CTA presence.
 * RUNTIME: map-area-search.ts state machine (no browser).
 *
 * Run: node --import tsx scripts/search-map-area-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendPlaceAndBoundsParams,
  listingSearchBoundsBox,
  mapBoundsNearlyEqual,
  mapGestureSearchThisAreaState,
  searchPlaceKey,
  shouldResetMapAreaForPlaceChange,
  type MapBoundsBox,
} from "@/lib/listings/map-area-search";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const mississauga: MapBoundsBox = {
  west: -79.8,
  south: 43.5,
  east: -79.5,
  north: 43.7,
};
const torontoViewport: MapBoundsBox = {
  west: -79.5,
  south: 43.6,
  east: -79.3,
  north: 43.8,
};
const outsideCity: MapBoundsBox = {
  west: -80.5,
  south: 43.0,
  east: -80.2,
  north: 43.2,
};

// --- RUNTIME: gesture never implies place clear; CTA is explicit ---
{
  const afterPan = mapGestureSearchThisAreaState({
    appliedBounds: null,
    nextBounds: mississauga,
  });
  assert.equal(afterPan.searchThisAreaVisible, true);
  assert.deepEqual(afterPan.pendingMapBounds, mississauga);

  const sameAsApplied = mapGestureSearchThisAreaState({
    appliedBounds: mississauga,
    nextBounds: {
      west: mississauga.west + 0.0001,
      south: mississauga.south,
      east: mississauga.east,
      north: mississauga.north,
    },
  });
  assert.equal(sameAsApplied.searchThisAreaVisible, false);
  assert.equal(sameAsApplied.pendingMapBounds, null);

  assert.equal(mapBoundsNearlyEqual(null, mississauga), false);
  assert.equal(mapBoundsNearlyEqual(mississauga, mississauga), true);
}

// --- RUNTIME: Search This Area with / without cities (query contract) ---
function buildQuery(input: {
  citiesPipe: string;
  city?: string;
  applied: MapBoundsBox | null;
  polygon?: MapBoundsBox | null;
}) {
  const params = new URLSearchParams();
  params.set("transactionType", "SALE");
  const bounds = listingSearchBoundsBox({
    polygonBox: input.polygon ?? null,
    appliedBounds: input.applied,
  });
  appendPlaceAndBoundsParams(params, {
    citiesPipe: input.citiesPipe,
    city: input.city ?? "",
    communitiesPipe: "",
    community: "",
    bounds,
  });
  return params;
}

{
  // No city — Search This Area applies viewport only
  const noCity = buildQuery({ citiesPipe: "", applied: torontoViewport });
  assert.equal(noCity.has("cities"), false);
  assert.equal(noCity.has("city"), false);
  assert.equal(noCity.get("west"), String(torontoViewport.west));
  assert.equal(noCity.get("north"), String(torontoViewport.north));

  // Mississauga alone — place retained; bounds AND when applied
  const withCity = buildQuery({
    citiesPipe: "Mississauga",
    applied: mississauga,
  });
  assert.equal(withCity.get("cities"), "Mississauga");
  assert.equal(withCity.get("west"), String(mississauga.west));

  // Multiple cities + bounds
  const multi = buildQuery({
    citiesPipe: "Mississauga|Brampton",
    applied: mississauga,
  });
  assert.equal(multi.get("cities"), "Mississauga|Brampton");
  assert.ok(multi.has("west"));

  // Viewport outside city — still AND (may return 0; not silently cleared)
  const outside = buildQuery({
    citiesPipe: "Mississauga",
    applied: outsideCity,
  });
  assert.equal(outside.get("cities"), "Mississauga");
  assert.equal(outside.get("west"), String(outsideCity.west));

  // Pan only (no Search This Area) — cities stay, no bounds
  const panOnly = buildQuery({ citiesPipe: "Mississauga", applied: null });
  assert.equal(panOnly.get("cities"), "Mississauga");
  assert.equal(panOnly.has("west"), false);

  // Polygon wins over applied bounds
  const poly = buildQuery({
    citiesPipe: "Mississauga",
    applied: mississauga,
    polygon: outsideCity,
  });
  assert.equal(poly.get("west"), String(outsideCity.west));
}

// --- RUNTIME: city change clears stale map-area key ---
{
  const miss = searchPlaceKey({
    city: "",
    community: "",
    cities: "Mississauga",
    communities: "",
  });
  const multi = searchPlaceKey({
    city: "",
    community: "",
    cities: "Mississauga|Toronto",
    communities: "",
  });
  const empty = searchPlaceKey({
    city: "",
    community: "",
    cities: "",
    communities: "",
  });
  assert.equal(shouldResetMapAreaForPlaceChange("", miss), true);
  assert.equal(shouldResetMapAreaForPlaceChange(miss, miss), false);
  assert.equal(shouldResetMapAreaForPlaceChange(miss, multi), true);
  // Clearing place does not force-reset (viewport search may remain)
  assert.equal(shouldResetMapAreaForPlaceChange(miss, empty), false);
}

// --- STATIC: source contracts (wiring, not comments) ---
const experience = read("src/components/listings/SearchExperience.tsx");
const map = read("src/components/listings/SearchMap.tsx");
const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
const menu = read("src/components/listings/SearchFiltersMenu.tsx");
const desktop = read("src/components/listings/SearchDesktopFilterPanel.tsx");

assert.match(experience, /from "@\/lib\/listings\/map-area-search"/);
assert.match(experience, /useCommittedSearch/);
assert.match(experience, /buildListingsQuery/);
assert.match(experience, /shouldResetMapAreaForPlaceChange/);
assert.match(experience, /function onSearchThisArea/);
assert.match(experience, /MAP_GESTURE/);
assert.match(experience, /SEARCH_THIS_AREA/);

const boundsFn = experience.slice(
  experience.indexOf("function onMapBoundsChange"),
  experience.indexOf("function onSearchThisArea"),
);
assert.match(boundsFn, /if \(!meta\?\.userGesture\) return/);
assert.match(boundsFn, /MAP_GESTURE/);
assert.doesNotMatch(boundsFn, /clearMultiPlace/);
assert.doesNotMatch(boundsFn, /setCitiesOverride/);
assert.doesNotMatch(boundsFn, /syncUrl\(/);

const searchAreaFn = experience.slice(
  experience.indexOf("function onSearchThisArea"),
  experience.indexOf("function onPolygonChange"),
);
assert.match(searchAreaFn, /SEARCH_THIS_AREA/);
assert.doesNotMatch(searchAreaFn, /clearMultiPlace/);
assert.doesNotMatch(searchAreaFn, /setCitiesOverride/);

// Bounds helpers still live in the canonical query + reducer modules
const queryMod = read("src/lib/listings/search-state/query.ts");
const reduceMod = read("src/lib/listings/search-state/reduce.ts");
assert.match(queryMod, /appendPlaceAndBoundsParams/);
assert.match(reduceMod, /mapGestureSearchThisAreaState/);

assert.match(map, /data-search-this-area/);
assert.match(map, /Search This Area/);
assert.match(map, /top-14/);

assert.match(experience, /SearchViewModeSwitch/);
assert.match(experience, /\["cards", LayoutGrid, "Cards"\]/);
assert.match(experience, /aria-pressed=\{view === mode\}/);
assert.match(experience, /updateView/);

// Exactly one Buy/Rent and one Residential/Commercial section per panel
for (const [label, src] of [
  ["sheet", sheet],
  ["menu", menu],
  ["desktop", desktop],
] as const) {
  const buy = src.match(/title="Buy \/ Rent"/g) ?? [];
  const segment = src.match(/title="Residential \/ Commercial"/g) ?? [];
  assert.equal(buy.length, 1, `${label}: duplicate Buy/Rent`);
  assert.equal(segment.length, 1, `${label}: duplicate segment`);
  const buyBlock = src.slice(
    src.indexOf('title="Buy / Rent"'),
    src.indexOf('title="Residential / Commercial"'),
  );
  assert.match(buyBlock, /value: "SALE", label: "Buy"/);
  assert.match(buyBlock, /value: "LEASE", label: "Rent"/);
  assert.doesNotMatch(buyBlock, /label: "For sale"/);
  assert.doesNotMatch(buyBlock, /label: "For lease"/);
  const buyAt = src.indexOf('title="Buy / Rent"');
  const locAt = src.indexOf('title="Location"');
  assert.ok(buyAt > 0 && locAt > buyAt, `${label}: Location after Buy/Rent`);
}

assert.match(sheet, /data-search-filters-apply/);
assert.match(menu, /draftCities/);
assert.match(desktop, /aria-label="Search filters"/);

console.log("search-map-area-selftest: ok (runtime + static)");

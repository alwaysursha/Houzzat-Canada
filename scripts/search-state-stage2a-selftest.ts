/**
 * Search Experience V2 — Stage 2A controller integration checks.
 *
 * Run: node --import tsx scripts/search-state-stage2a-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyCommitPatch,
  buildCriteriaKey,
  buildListingsQuery,
  buildSavedSearchQuery,
  commitPatchFromFilters,
  committedToSearchFilters,
  createSearchStateFromUrl,
  decideUrlHydrate,
  defaultCommittedSearch,
  listingsRequestId,
  parseSearchUrl,
  reduceSearch,
  serializeSearchUrl,
  shouldAcceptListingsResponse,
} from "../src/lib/listings/search-state";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

// ---------------------------------------------------------------------------
// 1. Empty cities COMMIT clears (mergeCommitted !== undefined fix)
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7CBrampton&transactionType=SALE",
  );
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { cities: [] },
  });
  assert.deepEqual(state.committed.cities, []);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), null);
}

// ---------------------------------------------------------------------------
// 2. View switch preserves criteria; changes pin density only
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=3&transactionType=SALE&view=cards",
  );
  const beforeKey = buildCriteriaKey(state.committed);
  const beforeLimit = paramsOf(buildListingsQuery(state.committed)).get("limit");
  assert.equal(beforeLimit, "60");

  state = reduceSearch(state, { type: "SET_VIEW", view: "map" });
  assert.equal(buildCriteriaKey(state.committed), beforeKey);
  assert.equal(state.committed.minBeds, "3");
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("limit"), "500");

  state = reduceSearch(state, { type: "SET_VIEW", view: "split" });
  assert.equal(buildCriteriaKey(state.committed), beforeKey);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("limit"), "500");

  state = reduceSearch(state, { type: "SET_VIEW", view: "cards" });
  assert.equal(buildCriteriaKey(state.committed), beforeKey);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("limit"), "60");
}

// ---------------------------------------------------------------------------
// 3. Live beds edit preserves multi-city (no citiesOverride)
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton"],
    minBeds: "2",
  });
  const filters = committedToSearchFilters(committed);
  assert.equal(filters.city, "");
  const patch = commitPatchFromFilters(committed, {
    ...filters,
    minBeds: "4",
  });
  assert.deepEqual(patch.cities, ["Mississauga", "Brampton"]);
  assert.equal(patch.minBeds, "4");
}

// ---------------------------------------------------------------------------
// 4. URL round-trip is stable (no history loop shape)
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Oakville"],
    minPrice: "750000",
    minBeds: "3",
    view: "map",
    sort: "price_desc",
  });
  const href = serializeSearchUrl(committed);
  const again = serializeSearchUrl(parseSearchUrl(href));
  assert.equal(href, again);

  let state = createSearchStateFromUrl(href);
  state = reduceSearch(state, { type: "SET_VIEW", view: "cards" });
  assert.match(serializeSearchUrl(state.committed), /view=cards/);
  state = reduceSearch(state, { type: "SET_VIEW", view: "split" });
  assert.doesNotMatch(serializeSearchUrl(state.committed), /view=/);

  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  state = reduceSearch(state, {
    type: "HYDRATE_FROM_URL",
    params: qs,
  });
  assert.equal(state.committed.view, "map");
  assert.deepEqual(state.committed.cities, ["Mississauga", "Oakville"]);
}

// ---------------------------------------------------------------------------
// 5. COMMIT clears pending Search This Area gesture
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl("city=Mississauga&transactionType=SALE");
  state = reduceSearch(state, {
    type: "MAP_GESTURE",
    bounds: { west: -80, south: 43, east: -79, north: 44 },
  });
  assert.equal(state.searchThisAreaVisible, true);
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { minBeds: "3" },
  });
  assert.equal(state.searchThisAreaVisible, false);
  assert.equal(state.pendingMapBounds, null);
  assert.equal(state.committed.minBeds, "3");
}

// ---------------------------------------------------------------------------
// 6. URL hydrate decisions — rapid commits vs Back/Forward (RUNTIME pure)
// ---------------------------------------------------------------------------
{
  // Rapid A→B: intermediate A must be ignored while expecting own write of B
  assert.equal(
    decideUrlHydrate({
      fromUrl: "/search?city=A&transactionType=SALE",
      lastWrittenHref: "/search?city=B&transactionType=SALE",
      expectingOwnNavigation: true,
      isPopNavigation: false,
    }).action,
    "ignore-stale",
  );
  // Own write settled
  assert.equal(
    decideUrlHydrate({
      fromUrl: "/search?city=B&transactionType=SALE",
      lastWrittenHref: "/search?city=B&transactionType=SALE",
      expectingOwnNavigation: true,
      isPopNavigation: false,
    }).action,
    "ack-own",
  );
  // Browser Back while idle
  assert.equal(
    decideUrlHydrate({
      fromUrl: "/search?city=A&transactionType=SALE",
      lastWrittenHref: "/search?city=B&transactionType=SALE",
      expectingOwnNavigation: false,
      isPopNavigation: true,
    }).action,
    "hydrate",
  );
  // Back during in-flight replace still hydrates (popstate wins)
  assert.equal(
    decideUrlHydrate({
      fromUrl: "/search?city=A&transactionType=SALE",
      lastWrittenHref: "/search?city=B&transactionType=SALE",
      expectingOwnNavigation: true,
      isPopNavigation: true,
    }).action,
    "hydrate",
  );
  // Autocomplete push while idle
  assert.equal(
    decideUrlHydrate({
      fromUrl: "/search?city=Oakville&transactionType=SALE",
      lastWrittenHref: "/search?city=Mississauga&transactionType=SALE",
      expectingOwnNavigation: false,
      isPopNavigation: false,
    }).action,
    "hydrate",
  );
}

// ---------------------------------------------------------------------------
// 7. Filter bridge matrix + rapid functional commits (RUNTIME pure)
// ---------------------------------------------------------------------------
{
  let committed = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton"],
    community: "Port Credit",
    minPrice: "500000",
    maxPrice: "1200000",
    minBeds: "2",
    minBaths: "1",
    propertyTypes: ["DETACHED"],
    openHouseOnly: true,
    statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
    sort: "price_asc",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
  });

  const base = committedToSearchFilters(committed);
  // Beds change preserves multi-city + community + price
  let patch = commitPatchFromFilters(committed, { ...base, minBeds: "4" });
  committed = reduceSearch(
    { ...createSearchStateFromUrl(""), committed },
    { type: "COMMIT", patch },
  ).committed;
  assert.deepEqual(committed.cities, ["Mississauga", "Brampton"]);
  assert.equal(committed.community, "Port Credit");
  assert.equal(committed.minBeds, "4");
  assert.equal(committed.minPrice, "500000");

  // Clear price
  patch = commitPatchFromFilters(committed, {
    ...committedToSearchFilters(committed),
    minPrice: "",
    maxPrice: "",
  });
  committed = reduceSearch(
    { ...createSearchStateFromUrl(""), committed },
    { type: "COMMIT", patch },
  ).committed;
  assert.equal(committed.minPrice, "");
  assert.equal(committed.maxPrice, "");
  assert.deepEqual(committed.cities, ["Mississauga", "Brampton"]);

  // Rent + clear open house
  patch = commitPatchFromFilters(committed, {
    ...committedToSearchFilters(committed),
    transactionType: "LEASE",
    openHouseOnly: false,
    statuses: ["ACTIVE"],
  });
  committed = reduceSearch(
    { ...createSearchStateFromUrl(""), committed },
    { type: "COMMIT", patch },
  ).committed;
  assert.equal(committed.transactionType, "LEASE");
  assert.equal(committed.openHouseOnly, false);

  // Commercial clears beds/baths via panel semantics
  patch = commitPatchFromFilters(committed, {
    ...committedToSearchFilters(committed),
    segment: "COMMERCIAL",
    minBeds: "",
    minBaths: "",
    propertyTypes: [],
  });
  committed = reduceSearch(
    { ...createSearchStateFromUrl(""), committed },
    { type: "COMMIT", patch },
  ).committed;
  assert.equal(committed.segment, "COMMERCIAL");
  assert.equal(committed.minBeds, "");
  assert.equal(committed.propertyTypes.length, 0);

  // Explicit cities replace; clear place
  patch = commitPatchFromFilters(
    committed,
    { ...committedToSearchFilters(committed), city: "", community: "" },
    { cities: ["Toronto"], clearPlace: false },
  );
  assert.deepEqual(patch.cities, ["Toronto"]);
  patch = commitPatchFromFilters(
    committed,
    { ...committedToSearchFilters(committed), city: "", community: "X" },
    { clearPlace: true },
  );
  assert.deepEqual(patch.cities, []);
  assert.equal(patch.community, "");

  // Stale full object overwrite simulation: functional merge onto latest
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=2&transactionType=SALE",
  );
  const applyFunctional = (
    updater: (f: SearchFilters) => SearchFilters,
  ) => {
    const prev = state.committed;
    const resolved = updater(committedToSearchFilters(prev));
    state = reduceSearch(state, {
      type: "COMMIT",
      patch: commitPatchFromFilters(prev, resolved),
    });
  };
  applyFunctional((f) => ({ ...f, minBeds: "3" }));
  applyFunctional((f) => ({ ...f, minPrice: "750000" }));
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.committed.minPrice, "750000");
  assert.deepEqual(state.committed.cities, ["Mississauga"]);

  // Ref-style stacking without waiting for React render (browser rapid clicks)
  let ref = defaultCommittedSearch({ cities: ["Mississauga"] });
  const stack = (updater: (f: SearchFilters) => SearchFilters) => {
    const resolved = updater(committedToSearchFilters(ref));
    const patch = commitPatchFromFilters(ref, resolved);
    ref = applyCommitPatch(ref, patch);
  };
  stack((f) => ({ ...f, minBeds: "3" }));
  stack((f) => ({ ...f, minPrice: "750000", maxPrice: "1200000" }));
  assert.equal(ref.minBeds, "3");
  assert.equal(ref.minPrice, "750000");
  assert.equal(ref.maxPrice, "1200000");
}

// ---------------------------------------------------------------------------
// 8. API query parity fixtures (RUNTIME pure)
// ---------------------------------------------------------------------------
{
  const multi = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton"],
    minBeds: "3",
    minBaths: "2",
    minPrice: "750000",
    maxPrice: "1500000",
    propertyTypes: ["DETACHED", "SEMI_DETACHED"],
    statuses: ["ACTIVE"],
    sort: "newest",
    view: "cards",
    openHouseOnly: true,
    community: "Port Credit",
  });
  const api = paramsOf(buildListingsQuery(multi));
  assert.equal(api.get("cities"), "Mississauga|Brampton");
  assert.equal(api.get("city"), null);
  assert.equal(api.get("minBeds"), "3");
  assert.equal(api.get("minBaths"), "2");
  assert.equal(api.get("minPrice"), "750000");
  assert.equal(api.get("maxPrice"), "1500000");
  assert.equal(api.get("propertyTypes"), "DETACHED,SEMI_DETACHED");
  assert.equal(api.get("openHouseOnly"), "1");
  assert.equal(api.get("community"), "Port Credit");
  assert.equal(api.get("limit"), "60");

  const mapView = { ...multi, view: "map" as const };
  assert.equal(buildCriteriaKey(multi), buildCriteriaKey(mapView));
  assert.equal(paramsOf(buildListingsQuery(mapView)).get("limit"), "500");
  assert.equal(paramsOf(buildListingsQuery(mapView)).get("cities"), "Mississauga|Brampton");

  const withArea = {
    ...multi,
    mapArea: { west: -80, south: 43, east: -79, north: 44 },
  };
  const bounded = paramsOf(buildListingsQuery(withArea));
  assert.equal(bounded.get("cities"), "Mississauga|Brampton");
  assert.equal(bounded.get("west"), "-80");
  assert.equal(bounded.get("north"), "44");

  // Saved search payload keeps multi-city
  const saved = buildSavedSearchQuery(multi);
  assert.deepEqual(saved.cities, ["Mississauga", "Brampton"]);
}

// ---------------------------------------------------------------------------
// 9. Experience wiring (STATIC)
// ---------------------------------------------------------------------------
{
  const experience = read("src/components/listings/SearchExperience.tsx");
  assert.match(experience, /useCommittedSearch/);
  assert.match(experience, /buildListingsQuery\(committed\)/);
  assert.match(experience, /type:\s*"SET_VIEW"/);
  assert.match(experience, /serializeSearchUrl/);
  assert.match(experience, /committedRef\.current/);
  assert.match(experience, /typeof next === "function"/);
  assert.match(experience, /function dispatchCommit/);
  assert.match(experience, /applyCommitPatch/);
  assert.match(experience, /useLayoutEffect/);
  // Must not clobber optimistic ref on every render body assignment.
  assert.doesNotMatch(
    experience,
    /const committedRef = useRef\(committed\);\s*committedRef\.current = committed;/,
  );
  assert.doesNotMatch(experience, /citiesOverride/);
  assert.doesNotMatch(experience, /syncUrl/);
  assert.doesNotMatch(
    experience,
    /setFilters\(\(prev\)\s*=>/,
  );
  assert.match(experience, /buildSavedSearchQuery\(committed\)/);
  assert.match(experience, /SaveSearchButton/);
  assert.match(experience, /WatchAreaButton/);
  assert.match(experience, /\/route-planner/);
  assert.match(experience, /hasClientAccess/);

  const hook = read(
    "src/lib/listings/search-state/use-committed-search.ts",
  );
  assert.match(hook, /lastWrittenHrefRef/);
  assert.match(hook, /expectingOwnNavigationRef/);
  assert.match(hook, /decideUrlHydrate/);
  assert.match(hook, /popstate/);
  assert.match(hook, /HYDRATE_FROM_URL/);
  assert.match(hook, /router\.replace/);
  assert.match(hook, /Compatibility lifetime/);

  const desktop = read(
    "src/components/listings/SearchDesktopFilterPanel.tsx",
  );
  assert.match(desktop, /onChange\(\(current\) =>/);
}

// ---------------------------------------------------------------------------
// 10. Rapid cities + beds + price + types + view; URL + stale API (RUNTIME)
// ---------------------------------------------------------------------------
{
  // Simulate Experience dispatchCommit stacking before any React re-render.
  let ref = defaultCommittedSearch({ view: "split" });
  const stackFilters = (updater: (f: SearchFilters) => SearchFilters) => {
    const resolved = updater(committedToSearchFilters(ref));
    const patch = commitPatchFromFilters(ref, resolved);
    ref = applyCommitPatch(ref, patch);
  };

  stackFilters((f) => ({ ...f, city: "" }));
  ref = applyCommitPatch(
    ref,
    commitPatchFromFilters(ref, committedToSearchFilters(ref), {
      cities: ["Mississauga", "Brampton"],
    }),
  );
  stackFilters((f) => ({ ...f, minBeds: "3" }));
  stackFilters((f) => ({
    ...f,
    minPrice: "750000",
    maxPrice: "1200000",
  }));
  stackFilters((f) => ({
    ...f,
    propertyTypes: ["DETACHED", "TOWNHOUSE"],
  }));
  ref = { ...ref, view: "map" };

  assert.deepEqual(ref.cities, ["Mississauga", "Brampton"]);
  assert.equal(ref.minBeds, "3");
  assert.equal(ref.minPrice, "750000");
  assert.equal(ref.maxPrice, "1200000");
  assert.deepEqual(ref.propertyTypes, ["DETACHED", "TOWNHOUSE"]);
  assert.equal(ref.view, "map");

  // URL serialization keeps the combined criteria (view=map included).
  const href = serializeSearchUrl(ref);
  assert.match(href, /cities=Mississauga/);
  assert.match(href, /Brampton/);
  assert.match(href, /minBeds=3/);
  assert.match(href, /minPrice=750000/);
  assert.match(href, /maxPrice=1200000/);
  assert.match(href, /propertyTypes=DETACHED/);
  assert.match(href, /view=map/);
  // Round-trip restore
  const restored = parseSearchUrl(href);
  assert.deepEqual(restored.cities, ["Mississauga", "Brampton"]);
  assert.equal(restored.minBeds, "3");
  assert.equal(restored.view, "map");

  // Reducer sequence matches ref stacking (React would apply both).
  let state = createSearchStateFromUrl("transactionType=SALE");
  const commitFromRefStyle = (
    updater: (f: SearchFilters) => SearchFilters,
  ) => {
    const prev = state.committed;
    const resolved = updater(committedToSearchFilters(prev));
    state = reduceSearch(state, {
      type: "COMMIT",
      patch: commitPatchFromFilters(prev, resolved),
    });
  };
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { cities: ["Mississauga", "Brampton"] },
  });
  commitFromRefStyle((f) => ({ ...f, minBeds: "3" }));
  commitFromRefStyle((f) => ({
    ...f,
    minPrice: "750000",
    maxPrice: "1200000",
  }));
  commitFromRefStyle((f) => ({
    ...f,
    propertyTypes: ["DETACHED", "TOWNHOUSE"],
  }));
  state = reduceSearch(state, { type: "SET_VIEW", view: "cards" });
  state = reduceSearch(state, { type: "SET_VIEW", view: "map" });
  state = reduceSearch(state, { type: "SET_VIEW", view: "split" });
  state = reduceSearch(state, { type: "SET_VIEW", view: "cards" });
  assert.deepEqual(state.committed.cities, ["Mississauga", "Brampton"]);
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.committed.minPrice, "750000");
  assert.deepEqual(state.committed.propertyTypes, ["DETACHED", "TOWNHOUSE"]);
  assert.equal(state.committed.view, "cards");
  assert.equal(
    buildCriteriaKey(state.committed),
    buildCriteriaKey({ ...state.committed, view: "map" }),
  );

  // Remove one city mid-stack
  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: {
      key: "city",
      city: "Brampton",
      label: "Brampton",
      clearable: true,
    },
  });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.minBeds, "3");

  // Stale API response protection after rapid commits
  const seqOlder = state.requestSeq;
  const idOlder = state.lastIssuedRequestId!;
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { minBeds: "4" },
  });
  assert.equal(shouldAcceptListingsResponse(state, seqOlder, idOlder), false);
  assert.equal(
    shouldAcceptListingsResponse(
      state,
      state.requestSeq,
      state.lastIssuedRequestId!,
    ),
    true,
  );
  assert.equal(
    listingsRequestId(state.committed),
    state.lastIssuedRequestId,
  );

  // Back/Forward hydrate restores prior URL without keeping newer beds
  state = reduceSearch(state, {
    type: "HYDRATE_FROM_URL",
    params: "city=Mississauga&minBeds=3&minPrice=750000&transactionType=SALE&view=cards",
  });
  assert.equal(state.committed.minBeds, "3");
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
}

console.log("search-state-stage2a-selftest: ok");

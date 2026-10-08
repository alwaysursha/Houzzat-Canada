/**
 * Search Experience V2 — Stage 1 canonical search-state behavioral tests.
 * Pure module only — does not mount SearchExperience / UI.
 *
 * Run: node --import tsx scripts/search-state-stage1-selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildActiveChips,
  buildCriteriaKey,
  buildListingsQuery,
  buildSavedSearchQuery,
  createSearchStateFromUrl,
  defaultCommittedSearch,
  listingsRequestId,
  parseSearchUrl,
  reduceSearch,
  serializeSearchUrl,
  shouldAcceptListingsResponse,
  type CommittedSearch,
  type SearchState,
} from "../src/lib/listings/search-state";
import { searchPageHref } from "../src/lib/listings/search-page-href";
import { searchFiltersToSavedQuery } from "../src/lib/listings/saved-search-query";
import { savedSearchPayloadFromCallback } from "../src/lib/auth/save-search-intent";
import { appendPlaceAndBoundsParams } from "../src/lib/listings/map-area-search";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

function assertCriteriaEqual(a: CommittedSearch, b: CommittedSearch) {
  assert.equal(buildCriteriaKey(a), buildCriteriaKey(b));
  assert.deepEqual(
    { ...a, view: "cards", mapArea: null },
    { ...b, view: "cards", mapArea: null },
  );
}

// ---------------------------------------------------------------------------
// 1. Single-city and multi-city URL round trips
// ---------------------------------------------------------------------------
{
  const single = defaultCommittedSearch({
    cities: ["Mississauga"],
    minBeds: "3",
    view: "cards",
  });
  const href = serializeSearchUrl(single);
  assert.match(href, /city=Mississauga/);
  assert.doesNotMatch(href, /cities=/);
  const back = parseSearchUrl(href);
  assert.deepEqual(back.cities, ["Mississauga"]);
  assert.equal(back.minBeds, "3");
  assert.equal(back.view, "cards");

  const multi = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton", "Oakville"],
    minPrice: "750000",
  });
  const multiHref = serializeSearchUrl(multi);
  assert.match(multiHref, /cities=Mississauga/);
  assert.match(multiHref, /Brampton/);
  assert.match(multiHref, /Oakville/);
  assert.doesNotMatch(multiHref, /(?:^|[?&])city=/);
  assert.deepEqual(parseSearchUrl(multiHref).cities, [
    "Mississauga",
    "Brampton",
    "Oakville",
  ]);
}

// ---------------------------------------------------------------------------
// 2. Legacy URL compatibility + mixed precedence
// ---------------------------------------------------------------------------
{
  // cities= wins over city=
  const mixed = parseSearchUrl(
    "transactionType=SALE&cities=Mississauga%7CToronto&city=Ignored",
  );
  assert.deepEqual(mixed.cities, ["Mississauga", "Toronto"]);
  assert.equal(mixed.cities.includes("Ignored"), false);

  // legacy city= alone
  const legacy = parseSearchUrl("transactionType=SALE&city=Mississauga&minBeds=2");
  assert.deepEqual(legacy.cities, ["Mississauga"]);
  assert.equal(legacy.minBeds, "2");

  // single cities= pipe still parses; serialize normalizes to city=
  const fromPipe = parseSearchUrl("cities=Mississauga&transactionType=SALE");
  assert.deepEqual(fromPipe.cities, ["Mississauga"]);
  assert.match(serializeSearchUrl(fromPipe), /city=Mississauga/);

  // Unsupported page-URL bounds ignored (session-only map area)
  const withBounds = parseSearchUrl(
    "city=Mississauga&west=-80&south=43&east=-79&north=44",
  );
  assert.equal(withBounds.mapArea, null);
  assert.deepEqual(withBounds.cities, ["Mississauga"]);
}

// ---------------------------------------------------------------------------
// 3. Mississauga + price + beds + baths — URL / API / chips / saved parity
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga"],
    minPrice: "750000",
    maxPrice: "1200000",
    minBeds: "3",
    minBaths: "2",
    propertyTypes: ["DETACHED"],
    view: "cards",
  });
  const href = serializeSearchUrl(committed);
  const api = paramsOf(buildListingsQuery(committed));
  const chips = buildActiveChips(committed).map((c) => c.label);
  const saved = buildSavedSearchQuery(committed);

  assert.match(href, /city=Mississauga/);
  assert.match(href, /minPrice=750000/);
  assert.match(href, /minBeds=3/);
  assert.match(href, /minBaths=2/);
  assert.match(href, /propertyTypes=DETACHED/);

  assert.equal(api.get("cities"), "Mississauga");
  assert.equal(api.get("minPrice"), "750000");
  assert.equal(api.get("minBeds"), "3");
  assert.equal(api.get("minBaths"), "2");
  assert.equal(api.get("propertyTypes"), "DETACHED");
  assert.equal(api.get("limit"), "60");

  assert.ok(chips.includes("Mississauga"));
  assert.ok(chips.includes("3+ Beds"));
  assert.ok(chips.includes("2+ Baths"));
  assert.ok(chips.includes("Detached"));

  assert.equal(saved.city, "Mississauga");
  assert.equal(saved.cities, undefined);
  assert.equal(saved.minPrice, "750000");
  assert.equal(saved.minBeds, "3");
  assert.equal(saved.minBaths, "2");

  // Fixture vs existing builders
  const filters: SearchFilters = {
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    dataSource: "",
    city: "",
    community: "",
    minPrice: "750000",
    maxPrice: "1200000",
    minBeds: "3",
    minBaths: "2",
    propertyTypes: ["DETACHED"],
    openHouseOnly: false,
    statuses: ["ACTIVE"],
    sort: "newest",
  };
  assert.deepEqual(
    buildSavedSearchQuery(committed),
    searchFiltersToSavedQuery(filters, { cities: ["Mississauga"] }),
  );

  const legacyHref = searchPageHref({
    pathname: "/search",
    filters: { ...filters, city: "Mississauga" },
    view: "cards",
  });
  assert.equal(serializeSearchUrl(committed), legacyHref);
}

// ---------------------------------------------------------------------------
// 4. Atomic draft Apply and Cancel
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl("city=Mississauga&transactionType=SALE");
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  assert.ok(state.draft);
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: { minBeds: "4", cities: ["Toronto"] },
  });
  // Committed unchanged until Apply
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.minBeds, "");
  assert.equal(state.draft?.minBeds, "4");

  const cancelled = reduceSearch(state, { type: "DISCARD_DRAFT" });
  assert.equal(cancelled.draft, null);
  assert.deepEqual(cancelled.committed.cities, ["Mississauga"]);
  assert.equal(cancelled.committed.minBeds, "");

  state = reduceSearch(state, { type: "APPLY_DRAFT" });
  assert.equal(state.draft, null);
  assert.deepEqual(state.committed.cities, ["Toronto"]);
  assert.equal(state.committed.minBeds, "4");
}

// ---------------------------------------------------------------------------
// 5. Cards → Map → Split → Cards (criteria stable; criteriaKey unchanged)
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=3&minPrice=750000&transactionType=SALE&view=cards",
  );
  const key0 = buildCriteriaKey(state.committed);
  const saved0 = buildSavedSearchQuery(state.committed);
  for (const view of ["map", "split", "cards"] as const) {
    state = reduceSearch(state, { type: "SET_VIEW", view });
    assert.equal(state.committed.view, view);
    assert.equal(buildCriteriaKey(state.committed), key0);
    assert.deepEqual(buildSavedSearchQuery(state.committed), saved0);
    assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), "Mississauga");
    assert.equal(paramsOf(buildListingsQuery(state.committed)).get("minBeds"), "3");
  }
  // Pin density may change with view
  const mapLimit = paramsOf(
    buildListingsQuery({ ...state.committed, view: "map" }),
  ).get("limit");
  const cardsLimit = paramsOf(
    buildListingsQuery({ ...state.committed, view: "cards" }),
  ).get("limit");
  assert.equal(mapLimit, "500");
  assert.equal(cardsLimit, "60");
}

// ---------------------------------------------------------------------------
// 6. Tag removal and Clear All
// ---------------------------------------------------------------------------
{
  let state: SearchState = {
    ...createSearchStateFromUrl(""),
    committed: defaultCommittedSearch({
      cities: ["Mississauga", "Brampton"],
      minPrice: "750000",
      maxPrice: "1200000",
      minBeds: "3",
      propertyTypes: ["DETACHED"],
      transactionType: "LEASE",
      segment: "COMMERCIAL",
    }),
  };
  const chips = buildActiveChips(state.committed);
  const mississauga = chips.find(
    (c) => c.key === "city" && c.city === "Mississauga",
  );
  assert.ok(mississauga);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: mississauga! });
  assert.deepEqual(state.committed.cities, ["Brampton"]);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), "Brampton");

  const price = buildActiveChips(state.committed).find((c) => c.key === "price");
  assert.ok(price);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: price! });
  assert.equal(state.committed.minPrice, "");
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("minPrice"), null);

  const beds = buildActiveChips(state.committed).find((c) => c.key === "beds");
  assert.ok(beds);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: beds! });
  assert.equal(state.committed.minBeds, "");

  const types = buildActiveChips(state.committed).find((c) => c.key === "types");
  assert.ok(types);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: types! });
  assert.equal(state.committed.propertyTypes.length, 0);

  state = reduceSearch(state, { type: "CLEAR_OPTIONAL" });
  assert.equal(state.committed.transactionType, "SALE");
  assert.equal(state.committed.segment, "RESIDENTIAL");
  assert.deepEqual(state.committed.statuses, ["ACTIVE"]);
  assert.deepEqual(state.committed.cities, []);
  assert.equal(state.committed.mapArea, null);
}

// ---------------------------------------------------------------------------
// 7. Map pan and Search This Area (city + bounds intersection)
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl("city=Mississauga&transactionType=SALE");
  const bounds = { west: -80, south: 43, east: -79, north: 44 };
  state = reduceSearch(state, { type: "MAP_GESTURE", bounds });
  assert.equal(state.searchThisAreaVisible, true);
  assert.ok(state.pendingMapBounds);
  // Pan does not change API query / cities
  assert.equal(state.committed.mapArea, null);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("west"), null);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), "Mississauga");

  state = reduceSearch(state, { type: "SEARCH_THIS_AREA" });
  assert.equal(state.searchThisAreaVisible, false);
  assert.equal(state.pendingMapBounds, null);
  assert.deepEqual(state.committed.mapArea, bounds);
  const api = paramsOf(buildListingsQuery(state.committed));
  assert.equal(api.get("cities"), "Mississauga");
  assert.equal(api.get("west"), String(bounds.west));
  assert.equal(api.get("north"), String(bounds.north));

  // Changing city clears map area
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { cities: ["Toronto"] },
  });
  assert.equal(state.committed.mapArea, null);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("west"), null);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), "Toronto");

  // Fixture: appendPlaceAndBoundsParams contract
  const p = new URLSearchParams();
  appendPlaceAndBoundsParams(p, {
    citiesPipe: "Mississauga",
    city: "",
    communitiesPipe: "",
    community: "",
    bounds,
  });
  assert.equal(p.get("cities"), "Mississauga");
  assert.equal(p.get("west"), String(bounds.west));
}

// ---------------------------------------------------------------------------
// 8. Browser navigation state restoration (href round-trip)
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton"],
    minPrice: "750000",
    minBeds: "3",
    minBaths: "2",
    propertyTypes: ["DETACHED"],
    view: "map",
    sort: "price_desc",
  });
  const href = serializeSearchUrl(committed);
  let state = createSearchStateFromUrl(href);
  assert.deepEqual(state.committed.cities, committed.cities);
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.committed.view, "map");
  assert.equal(state.committed.sort, "price_desc");

  // Simulate Back to a prior URL
  state = reduceSearch(state, {
    type: "HYDRATE_FROM_URL",
    params: "city=Oakville&transactionType=LEASE&view=cards",
  });
  assert.deepEqual(state.committed.cities, ["Oakville"]);
  assert.equal(state.committed.transactionType, "LEASE");
  assert.equal(state.committed.view, "cards");
  assert.equal(state.committed.minBeds, "");
}

// ---------------------------------------------------------------------------
// 9. Saved Search query parity
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Brampton"],
    minPrice: "750000",
    minBeds: "3",
    statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
  });
  const fromModule = buildSavedSearchQuery(committed);
  const fromLegacy = searchFiltersToSavedQuery(
    {
      segment: "RESIDENTIAL",
      transactionType: "SALE",
      dataSource: "",
      city: "",
      community: "",
      minPrice: "750000",
      maxPrice: "",
      minBeds: "3",
      minBaths: "",
      propertyTypes: [],
      openHouseOnly: false,
      statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
      sort: "newest",
    },
    { cities: ["Mississauga", "Brampton"] },
  );
  assert.deepEqual(fromModule, fromLegacy);
  assert.deepEqual(fromModule.cities, ["Mississauga", "Brampton"]);
  assert.equal(fromModule.city, undefined);
}

// ---------------------------------------------------------------------------
// 10. Guest CaptureIntent URL compatibility
// ---------------------------------------------------------------------------
{
  const committed = defaultCommittedSearch({
    cities: ["Mississauga"],
    minPrice: "750000",
    minBeds: "3",
    minBaths: "2",
  });
  const href = serializeSearchUrl(committed);
  const payload = savedSearchPayloadFromCallback(href);
  assert.ok(payload);
  assert.equal(payload!.query.city, "Mississauga");
  assert.equal(payload!.query.minPrice, "750000");
  assert.equal(payload!.query.minBeds, "3");
  assert.equal(payload!.query.minBaths, "2");

  const multiHref = serializeSearchUrl(
    defaultCommittedSearch({
      cities: ["Mississauga", "Brampton"],
      minPrice: "750000",
    }),
  );
  const multiPayload = savedSearchPayloadFromCallback(multiHref);
  assert.ok(multiPayload);
  assert.deepEqual(multiPayload!.query.cities, ["Mississauga", "Brampton"]);
}

// ---------------------------------------------------------------------------
// 11. Rapid transitions + stale-response handling
// ---------------------------------------------------------------------------
{
  let state = createSearchStateFromUrl("city=Mississauga&transactionType=SALE");
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { minBeds: "2" },
  });
  const seqA = state.requestSeq;
  const idA = state.lastIssuedRequestId;
  assert.ok(idA);

  state = reduceSearch(state, {
    type: "COMMIT",
    patch: { minBeds: "4" },
  });
  const seqB = state.requestSeq;
  const idB = state.lastIssuedRequestId;
  assert.ok(idB);
  assert.notEqual(seqA, seqB);
  assert.notEqual(idA, idB);

  assert.equal(shouldAcceptListingsResponse(state, seqA, idA!), false);
  assert.equal(shouldAcceptListingsResponse(state, seqB, idB!), true);
  assert.equal(shouldAcceptListingsResponse(state, seqB, idA!), false);

  // Explicit ISSUE_REQUEST also bumps identity
  const idC = listingsRequestId(state.committed);
  state = reduceSearch(state, { type: "ISSUE_REQUEST", requestId: idC });
  assert.equal(shouldAcceptListingsResponse(state, state.requestSeq, idC), true);
}

// View-only change must not alter criteria equality helpers
{
  const a = defaultCommittedSearch({
    cities: ["Mississauga"],
    minBeds: "3",
    view: "cards",
  });
  const b = { ...a, view: "map" as const };
  assertCriteriaEqual(a, b);
}

console.log("search-state-stage1-selftest: ok");

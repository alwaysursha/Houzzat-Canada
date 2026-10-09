/**
 * Search Experience V2 — Stage 2B-2 unified location / autocomplete sync.
 *
 * Distinguishes RUNTIME (pure helpers / reducer) from STATIC (source wiring).
 * Not claimed: live browser UI, live Typesense inventory, or production network.
 *
 * Run: node --import tsx scripts/search-state-stage2b2-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyCommitPatch,
  buildActiveChips,
  buildCriteriaKey,
  buildListingsQuery,
  clearPlaceWhenCitiesEmpty,
  commitPatchFromFilters,
  committedToSearchFilters,
  createSearchStateFromUrl,
  defaultCommittedSearch,
  placeCommitFromSuggestion,
  rebaseDraftPreservingEdits,
  reduceSearch,
  serializeSearchUrl,
} from "../src/lib/listings/search-state";
import type { AutocompleteSuggestion } from "../src/lib/listings/types";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

let failed = 0;
function check(label: string, kind: "RUNTIME" | "STATIC", fn: () => void) {
  try {
    fn();
    console.log(`PASS [${kind}] ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL [${kind}] ${label}`);
    console.error(err);
  }
}

const experience = read("src/components/listings/SearchExperience.tsx");
const autocomplete = read("src/components/listings/AddressAutocomplete.tsx");
const placeCommitSrc = read("src/lib/listings/search-state/place-commit.ts");
const resultsCopySrc = read("src/lib/listings/search-results-copy.ts");
const reduceSrc = read("src/lib/listings/search-state/reduce.ts");

// ---------------------------------------------------------------------------
// 1. City suggestion → replace cities, clear community/q, preserve filters
// ---------------------------------------------------------------------------
check("City suggestion replaces place and preserves beds/price", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=3&minPrice=750000&maxPrice=1200000&propertyTypes=DETACHED&transactionType=SALE",
  );
  const suggestion: AutocompleteSuggestion = {
    type: "city",
    group: "cities",
    label: "Brampton",
    city: "Brampton",
    href: "/search?transactionType=SALE&city=Brampton",
    lat: 43.7,
    lng: -79.7,
  };
  const place = placeCommitFromSuggestion(suggestion);
  assert.ok(place);
  assert.deepEqual(place!.patch.cities, ["Brampton"]);
  assert.equal(place!.patch.community, "");
  assert.equal(place!.patch.q, "");
  assert.ok(place!.mapCenter);

  state = reduceSearch(state, { type: "COMMIT", patch: place!.patch });
  assert.deepEqual(state.committed.cities, ["Brampton"]);
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.committed.minPrice, "750000");
  assert.deepEqual(state.committed.propertyTypes, ["DETACHED"]);
  const url = serializeSearchUrl(state.committed);
  assert.match(url, /city=Brampton/);
  assert.doesNotMatch(url, /Mississauga/);
  assert.match(url, /minBeds=3/);
  const api = paramsOf(buildListingsQuery(state.committed));
  assert.equal(api.get("cities"), "Brampton");
  assert.equal(api.get("minBeds"), "3");
});

// ---------------------------------------------------------------------------
// 2. Community suggestion sets city + community
// ---------------------------------------------------------------------------
check("Community suggestion sets city/community relationship", "RUNTIME", () => {
  const suggestion: AutocompleteSuggestion = {
    type: "community",
    group: "communities",
    label: "Port Credit",
    city: "Mississauga",
    community: "Port Credit",
    href: "/search?city=Mississauga&community=Port+Credit",
  };
  const place = placeCommitFromSuggestion(suggestion);
  assert.ok(place);
  let state = createSearchStateFromUrl(
    "city=Oakville&minBaths=2&transactionType=SALE",
  );
  state = reduceSearch(state, { type: "COMMIT", patch: place!.patch });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.community, "Port Credit");
  assert.equal(state.committed.minBaths, "2");
  const api = paramsOf(buildListingsQuery(state.committed));
  assert.equal(api.get("cities"), "Mississauga");
  assert.equal(api.get("community"), "Port Credit");
  const chips = buildActiveChips(state.committed);
  assert.ok(chips.some((c) => c.key === "city" && c.city === "Mississauga"));
  assert.ok(chips.some((c) => c.key === "community" && c.label === "Port Credit"));
});

// ---------------------------------------------------------------------------
// 3. Multi-city add / remove / clear
// ---------------------------------------------------------------------------
check("Multi-city add, remove one, clear all", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=2&transactionType=SALE",
  );
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: commitPatchFromFilters(
      state.committed,
      { ...committedToSearchFilters(state.committed), city: "" },
      { cities: ["Mississauga", "Oakville"] },
    ),
  });
  assert.deepEqual(state.committed.cities, ["Mississauga", "Oakville"]);
  let api = paramsOf(buildListingsQuery(state.committed));
  assert.equal(api.get("cities"), "Mississauga|Oakville");
  assert.equal(api.get("minBeds"), "2");

  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: { key: "city", label: "Oakville", clearable: true, city: "Oakville" },
  });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.minBeds, "2");

  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: {
      key: "city",
      label: "Mississauga",
      clearable: true,
      city: "Mississauga",
    },
  });
  assert.deepEqual(state.committed.cities, []);
  api = paramsOf(buildListingsQuery(state.committed));
  assert.equal(api.get("cities"), null);
  assert.equal(api.get("city"), null);
  const url = serializeSearchUrl(state.committed);
  assert.doesNotMatch(url, /city=/);
  assert.doesNotMatch(url, /cities=/);
});

// ---------------------------------------------------------------------------
// 4. Last city removal clears hidden community
// ---------------------------------------------------------------------------
check("Removing last city clears community constraint", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&community=Port+Credit&transactionType=SALE",
  );
  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: {
      key: "city",
      label: "Mississauga",
      clearable: true,
      city: "Mississauga",
    },
  });
  assert.deepEqual(state.committed.cities, []);
  assert.equal(state.committed.community, "");
  assert.deepEqual(state.committed.communities, []);
});

// ---------------------------------------------------------------------------
// 5. Community chip clears community only
// ---------------------------------------------------------------------------
check("Community chip clear keeps city", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&community=Port+Credit&minBeds=3&transactionType=SALE",
  );
  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: { key: "community", label: "Port Credit", clearable: true },
  });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.community, "");
  assert.equal(state.committed.minBeds, "3");
});

// ---------------------------------------------------------------------------
// 6. View switches preserve location criteria key
// ---------------------------------------------------------------------------
check("View Cards→Map→Split→Cards keeps criteria key", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&minBeds=3&transactionType=SALE&view=cards",
  );
  const key0 = buildCriteriaKey(state.committed);
  for (const view of ["map", "split", "cards"] as const) {
    state = reduceSearch(state, { type: "SET_VIEW", view });
    assert.equal(buildCriteriaKey(state.committed), key0);
    assert.deepEqual(state.committed.cities, ["Mississauga", "Oakville"]);
  }
});

// ---------------------------------------------------------------------------
// 7. Place change clears mapArea; pan alone does not
// ---------------------------------------------------------------------------
check("Named place clears mapArea; MAP_GESTURE does not", "RUNTIME", () => {
  let state = createSearchStateFromUrl("city=Mississauga&transactionType=SALE");
  state = reduceSearch(state, {
    type: "COMMIT",
    patch: {
      mapArea: { west: -80, south: 43, east: -79, north: 44 },
    },
  });
  assert.ok(state.committed.mapArea);
  state = reduceSearch(state, {
    type: "MAP_GESTURE",
    bounds: { west: -80.1, south: 43.1, east: -79.1, north: 44.1 },
  });
  assert.ok(state.committed.mapArea);
  assert.equal(state.searchThisAreaVisible, true);

  const brampton = placeCommitFromSuggestion({
    type: "city",
    group: "cities",
    label: "Brampton",
    city: "Brampton",
  });
  state = reduceSearch(state, { type: "COMMIT", patch: brampton!.patch });
  assert.equal(state.committed.mapArea, null);
  assert.deepEqual(state.committed.cities, ["Brampton"]);
});

// ---------------------------------------------------------------------------
// 8. Draft conflict: chip removes city while draft open; Apply keeps removal
// ---------------------------------------------------------------------------
check("Location chip removal during draft survives Apply", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&minBeds=2&transactionType=SALE",
  );
  const draftBase = { ...state.committed };
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: { minPrice: "900000", maxPrice: "1400000" },
  });
  // Live chip removes Oakville while draft open.
  state = reduceSearch(state, {
    type: "REMOVE_CHIP",
    chip: { key: "city", label: "Oakville", clearable: true, city: "Oakville" },
  });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.ok(state.draft);
  // Draft cities rebased to committed (removed Oakville).
  assert.deepEqual(state.draft?.cities, ["Mississauga"]);

  const local = applyCommitPatch(draftBase, {
    cities: ["Mississauga", "Oakville"],
    minPrice: "900000",
    maxPrice: "1400000",
  });
  const merged = rebaseDraftPreservingEdits(draftBase, local, state.committed);
  assert.deepEqual(merged.cities, ["Mississauga"]);
  assert.equal(merged.minPrice, "900000");
});

// ---------------------------------------------------------------------------
// 9. clearPlaceWhenCitiesEmpty helper
// ---------------------------------------------------------------------------
check("clearPlaceWhenCitiesEmpty drops community", "RUNTIME", () => {
  const prev = defaultCommittedSearch({
    cities: ["Mississauga"],
    community: "Port Credit",
  });
  assert.deepEqual(clearPlaceWhenCitiesEmpty(prev, ["Oakville"]).cities, [
    "Oakville",
  ]);
  const cleared = clearPlaceWhenCitiesEmpty(prev, []);
  assert.deepEqual(cleared.cities, []);
  assert.equal(cleared.community, "");
});

// ---------------------------------------------------------------------------
// 10. Suggestion classifier ignores listings / recent / free-text
// ---------------------------------------------------------------------------
check("placeCommit ignores listing/recent/search_for", "RUNTIME", () => {
  assert.equal(
    placeCommitFromSuggestion({
      type: "listing",
      label: "123 Main",
      mlsNumber: "X123",
      href: "/listing/X123",
    }),
    null,
  );
  assert.equal(
    placeCommitFromSuggestion({
      type: "action",
      group: "recent",
      label: "Mississauga",
      href: "/search?city=Mississauga&minBeds=3",
    }),
    null,
  );
  assert.equal(
    placeCommitFromSuggestion({
      type: "action",
      action: "search_for",
      label: "Search for foo",
    }),
    null,
  );
  assert.equal(
    placeCommitFromSuggestion({
      type: "place",
      group: "addresses",
      label: "79 Grand Flats Trail",
      city: "Kitchener",
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// 11. city_search / area_listings around actions
// ---------------------------------------------------------------------------
check("Around-area actions commit like city/community", "RUNTIME", () => {
  const cityAction = placeCommitFromSuggestion({
    type: "action",
    group: "around",
    action: "city_search",
    label: "Homes in Brampton",
    city: "Brampton",
    href: "/search?city=Brampton",
  });
  assert.deepEqual(cityAction?.patch.cities, ["Brampton"]);
  const areaAction = placeCommitFromSuggestion({
    type: "action",
    group: "around",
    action: "area_listings",
    label: "Listings in Port Credit",
    city: "Mississauga",
    community: "Port Credit",
  });
  assert.deepEqual(areaAction?.patch.cities, ["Mississauga"]);
  assert.equal(areaAction?.patch.community, "Port Credit");
});

// ---------------------------------------------------------------------------
// 12. URL round-trip single + multi + community
// ---------------------------------------------------------------------------
check("URL round-trip restores cities and community", "RUNTIME", () => {
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Oakville"],
    community: "",
    minBeds: "3",
    minBaths: "2",
    minPrice: "500000",
    propertyTypes: ["DETACHED"],
  });
  const href = serializeSearchUrl(committed);
  const again = createSearchStateFromUrl(href).committed;
  assert.deepEqual(again.cities, ["Mississauga", "Oakville"]);
  assert.equal(again.minBeds, "3");

  const withCommunity = defaultCommittedSearch({
    cities: ["Mississauga"],
    community: "Port Credit",
  });
  const href2 = serializeSearchUrl(withCommunity);
  assert.match(href2, /city=Mississauga/);
  assert.match(href2, /community=Port(\+|%20)?Credit/);
  const again2 = createSearchStateFromUrl(href2).committed;
  assert.deepEqual(again2.cities, ["Mississauga"]);
  assert.equal(again2.community, "Port Credit");
});

// ---------------------------------------------------------------------------
// 13. Single-city replace clears communities[]
// ---------------------------------------------------------------------------
check("filters.city replace clears communities pipe", "RUNTIME", () => {
  const prev = defaultCommittedSearch({
    cities: ["Mississauga"],
    communities: ["Port Credit", "Clarkson"],
  });
  const patch = commitPatchFromFilters(prev, {
    ...committedToSearchFilters(prev),
    city: "Brampton",
    community: "",
  });
  assert.deepEqual(patch.cities, ["Brampton"]);
  assert.deepEqual(patch.communities, []);
});

// ---------------------------------------------------------------------------
// STATIC: Experience commits place via helper (not bare href for cities)
// ---------------------------------------------------------------------------
check("Experience uses placeCommitFromSuggestion before href push", "STATIC", () => {
  assert.match(experience, /placeCommitFromSuggestion/);
  assert.match(experience, /dispatchCommit\(placeCommit\.patch\)/);
  // City/community must not be the old updateFilters(city/community) path.
  assert.doesNotMatch(
    experience,
    /suggestion\.type === \"city\"[\s\S]*updateFilters/,
  );
  const onPlace = experience.slice(
    experience.indexOf("function onPlaceSelect"),
    experience.indexOf("function onBarSearchClear"),
  );
  assert.match(onPlace, /placeCommitFromSuggestion/);
  // Href push remains for near_me / mls / non-place-commit rows.
  assert.match(onPlace, /pushHref/);
});

check("Autocomplete guards stale choose + fetch generations", "STATIC", () => {
  assert.match(autocomplete, /chooseGenRef/);
  assert.match(autocomplete, /listingsFetchGenRef/);
  assert.match(autocomplete, /placesFetchGenRef/);
  assert.match(autocomplete, /stillCurrent/);
  assert.match(autocomplete, /chooseGenRef\.current \+= 1/);
});

check("Community chip key wired in copy + reducer", "STATIC", () => {
  assert.match(resultsCopySrc, /key: \"community\"/);
  assert.match(reduceSrc, /case \"community\"/);
  assert.match(placeCommitSrc, /placeCommitFromSuggestion/);
  assert.match(experience, /clearPlaceWhenCitiesEmpty/);
});

check("Menu/Sheet still draft-rebase location cities", "STATIC", () => {
  const menu = read("src/components/listings/SearchFiltersMenu.tsx");
  const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
  assert.match(menu, /rebaseFilterDraftPreservingEdits/);
  assert.match(sheet, /rebaseFilterDraftPreservingEdits/);
  assert.match(menu, /StructuredCityField/);
  assert.match(sheet, /StructuredCityField/);
});

check("Mobile omits view → Cards after mount (SSR-safe, one-shot)", "STATIC", () => {
  const reduce = read("src/lib/listings/search-state/reduce.ts");
  assert.doesNotMatch(reduce, /isMobileSearchViewDefault/);
  assert.doesNotMatch(reduce, /matchMedia/);
  const controller = read(
    "src/lib/listings/search-state/use-committed-search.ts",
  );
  assert.match(controller, /SET_VIEW/);
  assert.match(controller, /max-width:\s*1023px/);
  assert.match(controller, /searchParams\.get\("view"\)/);
  assert.match(controller, /mobileCardsDefaultDoneRef/);
  const serialize = read("src/lib/listings/search-state/serialize.ts");
  assert.match(serialize, /params\.set\("view", committed\.view\)/);
  assert.doesNotMatch(
    serialize,
    /if \(committed\.view !== "split"\) params\.set\("view"/,
  );
  const href = read("src/lib/listings/search-page-href.ts");
  assert.match(
    href,
    /return isMobileDefault \? "cards" : "split"/,
  );
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nStage 2B-2 selftest: all checks passed");

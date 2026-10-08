/**
 * Search accuracy + active filter tags — scenario verification.
 * Distinguishes RUNTIME (pure helpers / URL+API+tags) from STATIC (source).
 * Run: node --import tsx scripts/search-active-filters-selftest.ts
 *
 * Not claimed: browser/device UI, live Typesense, or production network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";
import { resetSearchFilters } from "../src/components/listings/SearchFilterChips";
import { appendPlaceAndBoundsParams } from "../src/lib/listings/map-area-search";
import { searchPageHref } from "../src/lib/listings/search-page-href";
import { searchResultsCopy } from "../src/lib/listings/search-results-copy";
import { citiesParamForFilterSync } from "../src/lib/listings/search-url-cities";
import {
  structuredCitiesFromSearch,
  withStructuredCity,
} from "../src/lib/listings/structured-cities";
import { planSavedSearchApplyUi } from "../src/lib/listings/saved-search-confirm-flow";
import {
  savedSearchDisplayName,
  searchFiltersToSavedQuery,
} from "../src/lib/listings/saved-search-query";
import { savedSearchPayloadFromCallback } from "../src/lib/auth/save-search-intent";

function read(path: string) {
  return readFileSync(path, "utf8");
}

type View = "cards" | "map" | "split";
type Committed = {
  filters: SearchFilters;
  cities: string[];
  view: View;
};

const emptyFilters: SearchFilters = {
  segment: "RESIDENTIAL",
  transactionType: "SALE",
  dataSource: "",
  city: "",
  community: "",
  minPrice: "",
  maxPrice: "",
  minBeds: "",
  minBaths: "",
  propertyTypes: [],
  openHouseOnly: false,
  statuses: ["ACTIVE"],
  sort: "newest",
};

/** Mirrors commitFiltersWithCities / sheet commitDraft. */
function commitApply(draft: SearchFilters, draftCities: string[], view: View = "cards"): Committed {
  return {
    filters: { ...draft, city: "" },
    cities: draftCities.map((c) => c.trim()).filter(Boolean),
    view,
  };
}

/** Mirrors clearResultChip("city") after the optimistic-override fix. */
function removeCity(state: Committed, city: string): Committed {
  return {
    ...state,
    filters: { ...state.filters, city: "" },
    cities: state.cities.filter((c) => c !== city),
  };
}

function clearField(
  state: Committed,
  patch: Partial<SearchFilters>,
): Committed {
  return { ...state, filters: { ...state.filters, ...patch } };
}

function pageHref(state: Committed): string {
  return searchPageHref({
    pathname: "/search",
    filters: state.filters,
    view: state.view,
    cities: citiesParamForFilterSync({
      explicitCities: state.cities.join("|"),
      clearMultiPlace: state.cities.length === 0,
      urlCitiesParam: "",
    }),
    clearMultiPlace: state.cities.length === 0,
  });
}

function apiQuery(state: Committed): URLSearchParams {
  const params = new URLSearchParams();
  params.set("transactionType", state.filters.transactionType);
  if (state.filters.minPrice) params.set("minPrice", state.filters.minPrice);
  if (state.filters.maxPrice) params.set("maxPrice", state.filters.maxPrice);
  if (state.filters.minBeds) params.set("minBeds", state.filters.minBeds);
  if (state.filters.minBaths) params.set("minBaths", state.filters.minBaths);
  if (state.filters.propertyTypes.length) {
    params.set("propertyTypes", state.filters.propertyTypes.join(","));
  }
  appendPlaceAndBoundsParams(params, {
    citiesPipe: state.cities.join("|"),
    city: state.filters.city,
    communitiesPipe: "",
    community: state.filters.community,
    bounds: null,
  });
  return params;
}

function tagLabels(state: Committed): string[] {
  return searchResultsCopy({
    transactionType: state.filters.transactionType,
    segment: state.filters.segment,
    city: state.filters.city,
    community: state.filters.community,
    cities: state.cities.join("|"),
    communities: "",
    q: "",
    minPrice: state.filters.minPrice,
    maxPrice: state.filters.maxPrice,
    minBeds: state.filters.minBeds,
    minBaths: state.filters.minBaths,
    propertyTypes: state.filters.propertyTypes,
    openHouseOnly: state.filters.openHouseOnly,
    statuses: state.filters.statuses,
    total: 0,
    pending: false,
  }).chips.map((c) => c.label);
}

function fromHref(href: string) {
  const q = href.indexOf("?");
  const params = new URLSearchParams(q === -1 ? "" : href.slice(q + 1));
  const citiesParam = params.get("cities") ?? "";
  const city = params.get("city") ?? "";
  return {
    cities: structuredCitiesFromSearch(citiesParam, city),
    city,
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minBeds: params.get("minBeds") ?? "",
    minBaths: params.get("minBaths") ?? "",
    propertyTypes: params.get("propertyTypes") ?? "",
    view: params.get("view"),
    transactionType: params.get("transactionType") ?? "SALE",
  };
}

const results: Array<{ id: number; name: string; kind: "RUNTIME" | "STATIC"; pass: boolean }> = [];
function record(id: number, name: string, kind: "RUNTIME" | "STATIC", fn: () => void) {
  try {
    fn();
    results.push({ id, name, kind, pass: true });
  } catch (err) {
    results.push({ id, name, kind, pass: false });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. Mobile Apply → URL, tags, API all contain committed criteria (RUNTIME)
// ---------------------------------------------------------------------------
record(1, "Mobile Apply commits Mississauga+price+beds+baths", "RUNTIME", () => {
  const draft: SearchFilters = {
    ...emptyFilters,
    minPrice: "750000",
    maxPrice: "1200000",
    minBeds: "3",
    minBaths: "2",
    propertyTypes: ["DETACHED"],
  };
  const recognized = withStructuredCity([], "Mississauga");
  assert.deepEqual(recognized, ["Mississauga"]);
  const committed = commitApply(draft, recognized!);
  const href = pageHref(committed);
  const api = apiQuery(committed);
  const tags = tagLabels(committed);
  assert.match(href, /cities=Mississauga/);
  assert.match(href, /minPrice=750000/);
  assert.match(href, /minBeds=3/);
  assert.match(href, /minBaths=2/);
  assert.match(href, /propertyTypes=DETACHED/);
  assert.equal(api.get("cities"), "Mississauga");
  assert.equal(api.get("minPrice"), "750000");
  assert.equal(api.get("minBeds"), "3");
  assert.equal(api.get("minBaths"), "2");
  assert.equal(api.get("propertyTypes"), "DETACHED");
  assert.ok(tags.includes("Mississauga"));
  assert.ok(tags.includes("3+ Beds"));
  assert.ok(tags.includes("2+ Baths"));
  assert.ok(tags.includes("Detached"));
});

// ---------------------------------------------------------------------------
// 2. Dismiss without Apply → draft must not leak (STATIC + RUNTIME baseline)
// ---------------------------------------------------------------------------
record(2, "Dismiss without Apply does not commit draft", "STATIC", () => {
  const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
  // Form edits draft only
  assert.match(sheet, /setDraft\(\{/);
  assert.match(sheet, /onCitiesChange=\{setDraftCities\}/);
  // Close / Back do not call commitDraft
  const closeViaUi = sheet.slice(
    sheet.indexOf("const closeViaUi"),
    sheet.indexOf("useEffect(() => {\n    if (!open) {\n      setEntered"),
  );
  assert.doesNotMatch(closeViaUi, /commitDraft/);
  assert.match(closeViaUi, /history\.back\(\)/);
  // Intended path while open (unlocked) is committed props, not draft
  assert.match(
    sheet,
    /Back without Apply restores committed criteria, not uncommitted draft/,
  );
  assert.match(sheet, /intendedPathRef\.current = searchCallbackPath\(filters, cities\)/);
  // commitDraft only from applyAndSave
  const applyBlock = sheet.slice(
    sheet.indexOf("async function applyAndSave"),
    sheet.indexOf("if (!mounted)"),
  );
  assert.match(applyBlock, /commitDraft\(nextCities\)/);
});

// Uncommitted draft must not equal committed empty baseline (RUNTIME)
record(2, "Uncommitted draft differs from committed empty search", "RUNTIME", () => {
  const draftOnly: SearchFilters = {
    ...emptyFilters,
    minBeds: "4",
    minPrice: "900000",
  };
  const committed = commitApply(emptyFilters, []);
  assert.notEqual(draftOnly.minBeds, committed.filters.minBeds);
  assert.equal(apiQuery(committed).get("minBeds"), null);
  assert.equal(apiQuery(committed).get("cities"), null);
});

// ---------------------------------------------------------------------------
// 3. Apply → Saved Search confirmation → Update / Not Now keep commit (RUNTIME+STATIC)
// ---------------------------------------------------------------------------
record(3, "Saved Search confirm plan keeps filters committed", "RUNTIME", () => {
  const needs = planSavedSearchApplyUi("needs_confirm");
  assert.equal(needs.openConfirm, true);
  assert.equal(needs.closeFilters, true);
  assert.equal(needs.awaitsUserConfirm, true);
  // Cancel (Not Now) only closes dialog — no filter reset helper in plan
  assert.equal(needs.toastSuccess, false);
  const saved = planSavedSearchApplyUi("saved");
  assert.equal(saved.closeFilters, true);
});

record(3, "Sheet commits before confirm; cancel only closes dialog", "STATIC", () => {
  const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
  const applyBlock = sheet.slice(
    sheet.indexOf("async function applyAndSave"),
    sheet.indexOf("if (!mounted)"),
  );
  assert.ok(
    applyBlock.indexOf("commitDraft(nextCities)") <
      applyBlock.indexOf("await persist"),
  );
  assert.match(sheet, /onCancel=\{\(\) => setConfirmOpen\(false\)\}/);
  assert.doesNotMatch(sheet, /onCancel=\{\(\) => \{[\s\S]*onResetFilters/);
  assert.doesNotMatch(sheet, /onCancel=\{\(\) => \{[\s\S]*commitDraft/);
});

// ---------------------------------------------------------------------------
// 4. Guest Apply → CaptureIntent callback preserves criteria (RUNTIME+STATIC)
// ---------------------------------------------------------------------------
record(4, "Guest CaptureIntent callback preserves cities+filters", "RUNTIME", () => {
  const committed = commitApply(
    {
      ...emptyFilters,
      minPrice: "750000",
      minBeds: "3",
      minBaths: "2",
    },
    ["Mississauga"],
  );
  const href = pageHref(committed);
  const payload = savedSearchPayloadFromCallback(href);
  assert.ok(payload);
  assert.equal(payload!.query.city, "Mississauga");
  assert.equal(payload!.query.minPrice, "750000");
  assert.equal(payload!.query.minBeds, "3");
  assert.equal(payload!.query.minBaths, "2");
  const saved = searchFiltersToSavedQuery(committed.filters, {
    cities: committed.cities,
  });
  assert.equal(saved.city, "Mississauga");
  assert.equal(savedSearchDisplayName(committed.filters, { cities: committed.cities }), "Mississauga homes");
});

record(4, "Sheet guest path uses openGuestSaveSearchIntent + draft callback", "STATIC", () => {
  const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
  assert.match(sheet, /openGuestSaveSearchIntent/);
  assert.match(sheet, /searchCallbackPath\(draft, applyCities\)/);
  assert.match(sheet, /browserCaptureIntentStore/);
});

// ---------------------------------------------------------------------------
// 5. Remove Mississauga tag (RUNTIME)
// ---------------------------------------------------------------------------
record(5, "Remove Mississauga tag clears URL and API city", "RUNTIME", () => {
  const committed = commitApply(
    { ...emptyFilters, minBeds: "3" },
    ["Mississauga"],
  );
  const after = removeCity(committed, "Mississauga");
  const href = pageHref(after);
  const api = apiQuery(after);
  assert.doesNotMatch(href, /Mississauga/);
  assert.equal(api.get("cities"), null);
  assert.equal(api.get("city"), null);
  assert.equal(api.get("minBeds"), "3");
  assert.equal(tagLabels(after).includes("Mississauga"), false);
  assert.ok(tagLabels(after).includes("3+ Beds"));
});

// ---------------------------------------------------------------------------
// 6. Remove price, beds, property-type tags individually (RUNTIME)
// ---------------------------------------------------------------------------
record(6, "Remove price/beds/types tags update URL and API", "RUNTIME", () => {
  let state = commitApply(
    {
      ...emptyFilters,
      minPrice: "750000",
      maxPrice: "1200000",
      minBeds: "3",
      propertyTypes: ["DETACHED"],
    },
    ["Mississauga"],
  );
  state = clearField(state, { minPrice: "", maxPrice: "" });
  assert.equal(apiQuery(state).get("minPrice"), null);
  assert.doesNotMatch(pageHref(state), /minPrice=/);
  assert.equal(tagLabels(state).some((l) => l.includes("$750")), false);

  state = clearField(state, { minBeds: "" });
  assert.equal(apiQuery(state).get("minBeds"), null);
  assert.doesNotMatch(pageHref(state), /minBeds=/);
  assert.equal(tagLabels(state).includes("3+ Beds"), false);

  state = clearField(state, { propertyTypes: [] });
  assert.equal(apiQuery(state).get("propertyTypes"), null);
  assert.doesNotMatch(pageHref(state), /propertyTypes=/);
  assert.equal(tagLabels(state).includes("Detached"), false);
  assert.equal(apiQuery(state).get("cities"), "Mississauga");
});

// ---------------------------------------------------------------------------
// 7. Multi-city → remove one → remaining preserved (RUNTIME)
// ---------------------------------------------------------------------------
record(7, "Multi-city remove one preserves remaining + optimistic cities", "RUNTIME", () => {
  const committed = commitApply(emptyFilters, [
    "Mississauga",
    "Brampton",
    "Oakville",
  ]);
  const after = removeCity(committed, "Brampton");
  assert.deepEqual(after.cities, ["Mississauga", "Oakville"]);
  const href = pageHref(after);
  const api = apiQuery(after);
  assert.match(href, /cities=Mississauga/);
  assert.match(href, /Oakville/);
  assert.doesNotMatch(href, /Brampton/);
  assert.equal(api.get("cities"), "Mississauga|Oakville");
  const tags = tagLabels(after);
  assert.ok(tags.includes("Mississauga"));
  assert.ok(tags.includes("Oakville"));
  assert.equal(tags.includes("Brampton"), false);

  // 2→1 must keep optimistic single city in API immediately (no stale pipe)
  const toOne = removeCity(after, "Oakville");
  assert.deepEqual(toOne.cities, ["Mississauga"]);
  assert.equal(apiQuery(toOne).get("cities"), "Mississauga");
  assert.equal(apiQuery(toOne).get("cities")?.includes("Oakville"), false);
});

// ---------------------------------------------------------------------------
// 8. Clear All → defaults (RUNTIME)
// ---------------------------------------------------------------------------
record(8, "Clear All resets optional filters to defaults", "RUNTIME", () => {
  const committed = commitApply(
    {
      ...emptyFilters,
      transactionType: "LEASE",
      segment: "COMMERCIAL",
      minPrice: "750000",
      minBeds: "3",
      propertyTypes: ["DETACHED"],
      openHouseOnly: true,
      statuses: ["SOLD"],
    },
    ["Mississauga"],
  );
  const cleared: Committed = {
    filters: resetSearchFilters(committed.filters),
    cities: [],
    view: "cards",
  };
  assert.equal(cleared.filters.transactionType, "SALE");
  assert.equal(cleared.filters.segment, "RESIDENTIAL");
  assert.deepEqual(cleared.filters.statuses, ["ACTIVE"]);
  assert.equal(cleared.filters.minPrice, "");
  assert.equal(cleared.filters.minBeds, "");
  assert.equal(cleared.filters.propertyTypes.length, 0);
  assert.equal(apiQuery(cleared).get("cities"), null);
  assert.equal(apiQuery(cleared).get("minPrice"), null);
});

// ---------------------------------------------------------------------------
// 9. Desktop Cards sidebar live updates (STATIC)
// ---------------------------------------------------------------------------
record(9, "Desktop Cards sidebar wires live onChange to updateFilters", "STATIC", () => {
  const experience = read("src/components/listings/SearchExperience.tsx");
  const panel = experience.slice(
    experience.indexOf("<SearchDesktopFilterPanel"),
    experience.indexOf("<SearchDesktopFilterPanel") + 450,
  );
  assert.match(panel, /onChange=\{updateFilters\}/);
  assert.match(panel, /onCitiesChange=\{replaceStructuredCities\}/);
  assert.match(experience, /SearchActiveFilterStrip/);
  assert.match(experience, /chips=\{resultsCopy\.chips\}/);
});

// ---------------------------------------------------------------------------
// 10. Cards → Map → Split → Cards preserve filters (RUNTIME)
// ---------------------------------------------------------------------------
record(10, "View transitions preserve committed filters", "RUNTIME", () => {
  let state = commitApply(
    { ...emptyFilters, minBeds: "3", minPrice: "750000" },
    ["Mississauga"],
    "cards",
  );
  for (const view of ["map", "split", "cards"] as View[]) {
    state = { ...state, view };
    const href = pageHref(state);
    const parsed = fromHref(href);
    assert.deepEqual(parsed.cities, ["Mississauga"]);
    assert.equal(parsed.minBeds, "3");
    assert.equal(parsed.minPrice, "750000");
    assert.equal(apiQuery(state).get("cities"), "Mississauga");
    if (view === "split") {
      assert.equal(parsed.view, null); // default omitted
    } else {
      assert.equal(parsed.view, view);
    }
  }
});

// ---------------------------------------------------------------------------
// 11. Back/Forward / refresh sync via URL (RUNTIME+STATIC)
// ---------------------------------------------------------------------------
record(11, "Href round-trip restores cities and filters", "RUNTIME", () => {
  const committed = commitApply(
    {
      ...emptyFilters,
      minPrice: "750000",
      minBeds: "3",
      minBaths: "2",
      propertyTypes: ["DETACHED"],
    },
    ["Mississauga", "Brampton"],
    "map",
  );
  const href = pageHref(committed);
  const parsed = fromHref(href);
  assert.deepEqual(parsed.cities, ["Mississauga", "Brampton"]);
  assert.equal(parsed.minPrice, "750000");
  assert.equal(parsed.minBeds, "3");
  assert.equal(parsed.minBaths, "2");
  assert.equal(parsed.propertyTypes, "DETACHED");
  assert.equal(parsed.view, "map");
});

record(11, "Experience syncs filters from searchParams", "STATIC", () => {
  const experience = read("src/components/listings/SearchExperience.tsx");
  assert.match(experience, /Keep filter state aligned when URL changes/);
  assert.match(experience, /setFilters\(\(prev\) => \(\{/);
  assert.match(experience, /searchParams\.get\("minBeds"\)/);
  assert.match(experience, /citiesParamForFilterSync/);
});

// ---------------------------------------------------------------------------
// 12. No unintended Saved Search / lead / analytics changes (STATIC)
// ---------------------------------------------------------------------------
record(12, "Saved Search and CaptureIntent contracts unchanged", "STATIC", () => {
  const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
  const menu = read("src/components/listings/SearchFiltersMenu.tsx");
  const confirm = read("src/lib/listings/saved-search-confirm-flow.ts");
  const save = read("src/lib/listings/save-primary-search.ts");
  assert.match(sheet, /savePrimarySearch/);
  assert.match(sheet, /openGuestSaveSearchIntent/);
  assert.match(sheet, /planSavedSearchApplyUi/);
  assert.match(sheet, /UpdateSavedSearchDialog/);
  assert.match(menu, /savePrimarySearch/);
  assert.match(menu, /openGuestSaveSearchIntent/);
  assert.match(confirm, /needs_confirm/);
  assert.match(confirm, /awaitsUserConfirm/);
  assert.match(save, /confirmReplace/);
  // Analytics / lead modules not touched by this change set — ensure sheet
  // still routes guest through CaptureIntent, not a new path.
  assert.doesNotMatch(sheet, /gtag\(|analytics\.track|posthog/i);
});

// Wire-up: city removal uses optimistic override (STATIC — defect fix)
record(7, "City tag removal sets optimistic citiesOverride always", "STATIC", () => {
  const experience = read("src/components/listings/SearchExperience.tsx");
  const cityCase = experience.slice(
    experience.indexOf('case "city":'),
    experience.indexOf('case "query":'),
  );
  assert.match(cityCase, /setCitiesOverride\(nextCities\)/);
  assert.match(cityCase, /cities: nextCities\.join\("\|"\)/);
  assert.doesNotMatch(cityCase, /nextCities\.length > 1 \? nextCities : null/);
});

console.log("\n=== Scenario results ===");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  #${r.id} [${r.kind}] ${r.name}`);
}
const failed = results.filter((r) => !r.pass);
assert.equal(failed.length, 0, `${failed.length} scenario check(s) failed`);
console.log("search-active-filters-selftest: ok");

/**
 * Search location correctness: city commit on Apply, history intended URL,
 * Saved Search city persistence + digest/href consumers.
 * Run: node --import tsx scripts/search-location-correctness-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { savedQueryToListingSearchParams } from "@/lib/email/digests/search";
import { savedQueryToSearchHref } from "@/lib/agent/intent-to-search";
import { savedSearchPayloadFromCallback } from "@/lib/auth/save-search-intent";
import {
  savedSearchDisplayName,
  searchFiltersToSavedQuery,
} from "@/lib/listings/saved-search-query";
import { searchPageHref } from "@/lib/listings/search-page-href";
import {
  structuredCitiesFromSearch,
  withStructuredCity,
} from "@/lib/listings/structured-cities";
import type { SearchFilters } from "@/components/listings/SearchFilterChips";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const baseFilters: SearchFilters = {
  segment: "RESIDENTIAL",
  transactionType: "SALE",
  dataSource: "",
  city: "",
  community: "",
  minPrice: "750000",
  maxPrice: "1200000",
  minBeds: "3",
  minBaths: "2",
  propertyTypes: [],
  openHouseOnly: false,
  statuses: ["ACTIVE", "SOLD_CONDITIONAL"],
  sort: "newest",
};

// --- City recognition / multi-city ---
assert.deepEqual(withStructuredCity([], "Mississauga"), ["Mississauga"]);
assert.deepEqual(withStructuredCity([], "mississauga"), ["Mississauga"]);
assert.equal(withStructuredCity([], "NotACityXYZ"), null);
assert.deepEqual(withStructuredCity(["Mississauga"], "Toronto"), [
  "Mississauga",
  "Toronto",
]);
assert.deepEqual(
  structuredCitiesFromSearch("Mississauga|Toronto", ""),
  ["Mississauga", "Toronto"],
);

// --- Saved query: single city uses legacy `city` ---
const single = searchFiltersToSavedQuery(baseFilters, {
  cities: ["Mississauga"],
});
assert.equal(single.city, "Mississauga");
assert.equal(single.cities, undefined);
assert.equal(single.minPrice, "750000");
assert.equal(single.minBeds, "3");
assert.equal(single.minBaths, "2");
assert.equal(single.status, "ACTIVE,SOLD_CONDITIONAL");
assert.equal(
  savedSearchDisplayName(baseFilters, { cities: ["Mississauga"] }),
  "Mississauga Listings · 3+ Beds · 2+ Baths · $750K–$1.2M",
);

// --- Saved query: multi-city uses `cities` array (digest + href contract) ---
const multi = searchFiltersToSavedQuery(baseFilters, {
  cities: ["Mississauga", "Brampton"],
});
assert.equal(multi.city, undefined);
assert.deepEqual(multi.cities, ["Mississauga", "Brampton"]);
assert.equal(
  savedSearchDisplayName(baseFilters, { cities: ["Mississauga", "Brampton"] }),
  "Mississauga & Brampton Listings · 3+ Beds · 2+ Baths · $750K–$1.2M",
);

// Legacy filters.city still works when extras omitted
const legacy = searchFiltersToSavedQuery({
  ...baseFilters,
  city: "Oakville",
});
assert.equal(legacy.city, "Oakville");
assert.equal(legacy.cities, undefined);

// --- Digest matcher preserves cities ---
const digestSingle = savedQueryToListingSearchParams(single);
assert.equal(digestSingle.city, "Mississauga");
assert.equal(digestSingle.cities, undefined);
assert.equal(digestSingle.minPrice, 750000);

const digestMulti = savedQueryToListingSearchParams(multi);
assert.deepEqual(digestMulti.cities, ["Mississauga", "Brampton"]);
assert.equal(digestMulti.city, undefined);

// --- Search href round-trip ---
const href = searchPageHref({
  pathname: "/search",
  filters: { ...baseFilters, city: "" },
  view: "cards",
  cities: "Mississauga|Toronto",
});
assert.match(href, /cities=Mississauga%7CToronto|cities=Mississauga\|Toronto/);
assert.match(href, /minPrice=750000/);
assert.match(href, /minBeds=3/);

const fromSaved = savedQueryToSearchHref(multi);
assert.match(fromSaved, /cities=Mississauga/);
assert.match(fromSaved, /Brampton/);

// --- Guest CaptureIntent callback → saved payload keeps cities ---
const guestHref =
  "/search?transactionType=SALE&cities=Mississauga%7CBrampton&minPrice=750000&minBeds=3";
const guestPayload = savedSearchPayloadFromCallback(guestHref);
assert.ok(guestPayload);
assert.deepEqual(guestPayload!.query.cities, ["Mississauga", "Brampton"]);
assert.equal(guestPayload!.query.city, undefined);
assert.equal(guestPayload!.query.minPrice, "750000");
assert.equal(guestPayload!.query.minBeds, "3");

const guestSingle = savedSearchPayloadFromCallback(
  "/search?transactionType=SALE&cities=Mississauga&maxPrice=1200000",
);
assert.ok(guestSingle);
assert.equal(guestSingle!.query.city, "Mississauga");
assert.equal(guestSingle!.query.cities, undefined);

// --- Source contracts: flush on Apply, intended path restore ---
const cityField = read("src/components/listings/StructuredCityField.tsx");
assert.match(cityField, /useImperativeHandle/);
assert.match(cityField, /flush:/);
assert.match(cityField, /withStructuredCity/);
assert.match(cityField, /role="alert"/);
assert.match(cityField, /Choose a city from the list/i);
assert.match(cityField, /role="listbox"/);
assert.match(cityField, /Add another city/);
assert.match(cityField, /\/api\/listings\/autocomplete/);
// Apply flush must not call onCitiesChange (avoids prop lag wiping intended path)
const flushImpl = cityField.slice(
  cityField.indexOf("useImperativeHandle(ref,"),
  cityField.indexOf("function selectCity("),
);
assert.doesNotMatch(flushImpl, /onCitiesChange/);
assert.match(cityField, /function selectCity\(/);
assert.match(cityField, /function commitFromKeyboard\(/);
assert.match(cityField, /if \(result\.committed\) onCitiesChange\(result\.cities\)/);

const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
assert.match(sheet, /intendedPathRef/);
assert.match(sheet, /applyIntentLockedRef/);
assert.match(sheet, /applyIntentLockedRef\.current = true/);
assert.match(sheet, /searchCallbackPath\(filters, cities\)/);
assert.match(sheet, /routerRef\.current\.replace\(path/);
assert.match(sheet, /flushDraftCities/);
assert.match(sheet, /commitDraft/);
assert.match(sheet, /onCommitFilters/);
assert.match(sheet, /setDraftCities/);
assert.match(sheet, /applyAndSave/);
assert.match(sheet, /cityFieldRef/);
assert.match(sheet, /searchFiltersToSavedQuery\(draft, placeExtras\)/);
assert.doesNotMatch(sheet, /keepHrefRef\.current = window\.location\.href/);
assert.match(sheet, /houzzatSearchFilters/);
assert.match(sheet, /history\.back\(\)/);
assert.match(sheet, /closeAfterApply/);
assert.match(sheet, /Close Filters after Apply without history\.back/);
assert.match(sheet, /UpdateSavedSearchDialog/);
// Lock + commit before persist so Back restore keeps applied Mississauga path
const applyBlock = sheet.slice(
  sheet.indexOf("async function applyAndSave"),
  sheet.indexOf("if (!mounted)"),
);
assert.match(applyBlock, /applyIntentLockedRef\.current = true/);
assert.match(applyBlock, /commitDraft\(nextCities\)/);
assert.ok(
  applyBlock.indexOf("applyIntentLockedRef.current = true") <
    applyBlock.indexOf("commitDraft(nextCities)"),
);

const menu = read("src/components/listings/SearchFiltersMenu.tsx");
assert.match(menu, /flushDraftCities/);
assert.match(menu, /applyCitiesRef/);
assert.match(menu, /cityFieldRef/);
assert.match(menu, /searchFiltersToSavedQuery\(draft, placeExtras\)/);
assert.match(menu, /searchCallbackPath\(draft, nextCities\)/);

const experience = read("src/components/listings/SearchExperience.tsx");
assert.match(experience, /searchCallbackPath=\{searchCallbackPath\}/);
assert.match(experience, /useCommittedSearch/);
assert.match(experience, /buildListingsQuery/);
assert.match(experience, /citiesQueryParam/);
assert.doesNotMatch(experience, /citiesOverride/);
assert.match(experience, /buildSavedSearchQuery\(committed\)/);
assert.match(
  experience,
  /callbackPath=\{searchCallbackPath\(filters, structuredCities\)\}/,
);
assert.match(experience, /queryString/);
// API query derives from committed criteria (canonical builder)
const queryBlock = experience.slice(
  experience.indexOf("const queryString = useMemo"),
  experience.indexOf("const load = useCallback"),
);
assert.match(queryBlock, /buildListingsQuery\(committed\)/);
assert.doesNotMatch(queryBlock, /if \(citiesParam\)/);

const intent = read("src/lib/auth/save-search-intent.ts");
assert.match(intent, /structuredCitiesFromSearch/);
assert.match(intent, /searchFiltersToSavedQuery\(filters, placeExtras\)/);

const digests = read("src/lib/email/digests/search.ts");
assert.match(digests, /asStringList\(q\.cities\)/);
assert.match(digests, /params\.cities\.map/);

console.log("search-location-correctness-selftest: ok");

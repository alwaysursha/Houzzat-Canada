/**
 * Phase 1 search quality: text status, token dropping, and Neon q fallback.
 * Run: node --env-file=.env.local --import tsx scripts/search-phase1-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addressQueryKeepsAllTokens,
  compareStreetHistory,
  listingQueryCandidateWhere,
  typesenseTextMatchSettings,
} from "../src/lib/listings/search-match";
import {
  parseListingSearchQueryParams,
  unspecifiedSearchStatus,
} from "../src/lib/listings/parse-search-query-params";
import { typesenseResultNeedsNeonFallback } from "../src/lib/listings/provider";
import {
  parseSearchQuery,
  searchHrefFromParsed,
  shouldUseExplicitPlace,
} from "../src/lib/listings/parse-search-query";
import { buildEntitledTypesenseFilterBy } from "../src/lib/typesense/search";
import { typesenseAutocomplete } from "../src/lib/typesense/autocomplete";
import { typesenseSearch } from "../src/lib/typesense/search";
import { normalizeListingSearchStatuses } from "../src/lib/tenancy/listing-entitlement/search-authority-filters";

function containsValues(where: unknown): string[] {
  return JSON.stringify(where).match(/"contains":"[^"]+"/g) ?? [];
}

assert.equal(addressQueryKeepsAllTokens("eden oak trail"), true);
assert.equal(addressQueryKeepsAllTokens("125 eden oak trail"), true);
assert.equal(addressQueryKeepsAllTokens("eden oak"), true);
assert.equal(addressQueryKeepsAllTokens("kitchener"), false);
for (const q of [
  "eden oak",
  "eden oak tr",
  "eden oak tra",
  "eden oak trai",
  "eden oak trail",
  "eden oak court",
  "eden oak crescent",
]) {
  const settings = typesenseTextMatchSettings(q);
  assert.equal(settings.num_typos, 0, q);
  assert.equal(settings.drop_tokens_threshold, 0, q);
}
assert.equal(typesenseTextMatchSettings("eden oak t").num_typos, 1);
assert.equal(
  typesenseTextMatchSettings("eden oak t").drop_tokens_threshold,
  undefined,
);

const ranked = [
  { status: "TERMINATED", listedAt: "2026-09-01T00:00:00.000Z", street: "history-new" },
  { status: "ACTIVE", listedAt: "2024-01-01T00:00:00.000Z", street: "current-old" },
  { status: "SOLD", listedAt: "2026-09-20T00:00:00.000Z", street: "history-newer" },
  { status: "SOLD_CONDITIONAL", listedAt: "2025-01-01T00:00:00.000Z", street: "current-new" },
].sort(compareStreetHistory);
assert.deepEqual(
  ranked.map((row) => row.street),
  ["current-new", "current-old", "history-newer", "history-new"],
);

for (const q of ["eden oak trail", "125 eden oak trail", "eden oak"]) {
  for (const value of containsValues(listingQueryCandidateWhere(q))) {
    assert.notEqual(value, '"contains":"tr"');
    assert.ok(value.length > '"contains":"xx"'.length);
  }
}

assert.equal(unspecifiedSearchStatus(null), "ACTIVE");
assert.equal(unspecifiedSearchStatus(""), "ACTIVE");
assert.equal(unspecifiedSearchStatus("eden oak trail"), "ALL");

const browse = parseListingSearchQueryParams(
  new URLSearchParams({ transactionType: "SALE" }),
);
assert.equal(browse.q, undefined);
assert.equal(browse.status, "ACTIVE");
assert.deepEqual(normalizeListingSearchStatuses(browse), [
  "ACTIVE",
  "SOLD_CONDITIONAL",
]);
assert.equal(typesenseResultNeedsNeonFallback(browse, 0), false);

const text = parseListingSearchQueryParams(
  new URLSearchParams({ q: "eden oak trail", transactionType: "SALE" }),
);
assert.equal(text.status, "ALL");
assert.equal(text.transactionType, "SALE");
assert.equal(normalizeListingSearchStatuses(text), null);
assert.equal(typesenseResultNeedsNeonFallback(text, 0), false);
assert.equal(typesenseResultNeedsNeonFallback(text, 2), false);

const lease = parseListingSearchQueryParams(
  new URLSearchParams({ q: "eden oak trail", transactionType: "LEASE" }),
);
assert.equal(lease.status, "ALL");
assert.equal(lease.transactionType, "LEASE");

function filterOf(params: ReturnType<typeof parseListingSearchQueryParams>) {
  const built = buildEntitledTypesenseFilterBy(params);
  assert.equal(built.kind, "passthrough");
  return built.filterBy ?? "";
}

const saleFilter = filterOf(text);
assert.match(saleFilter, /transactionType:=SALE/);
assert.doesNotMatch(saleFilter, /transactionType:=LEASE/);
assert.doesNotMatch(saleFilter, /status:=/);

const leaseFilter = filterOf(lease);
assert.match(leaseFilter, /transactionType:=LEASE/);
assert.doesNotMatch(leaseFilter, /transactionType:=SALE/);
assert.doesNotMatch(leaseFilter, /status:=/);

const browseFilter = filterOf(browse);
assert.match(browseFilter, /status:=\[ACTIVE,SOLD_CONDITIONAL\]/);
assert.doesNotMatch(browseFilter, /TERMINATED/);

function explicit(status: string) {
  return parseListingSearchQueryParams(
    new URLSearchParams({
      q: "eden oak trail",
      status,
      transactionType: "SALE",
    }),
  );
}

assert.deepEqual(normalizeListingSearchStatuses(explicit("SOLD")), ["SOLD"]);
assert.deepEqual(normalizeListingSearchStatuses(explicit("TERMINATED")), [
  "TERMINATED",
]);
assert.deepEqual(normalizeListingSearchStatuses(explicit("CANCELLED")), [
  "TERMINATED",
]);
assert.deepEqual(normalizeListingSearchStatuses(explicit("UNLISTED")), [
  "SUSPENDED",
  "TERMINATED",
  "EXPIRED",
]);
assert.match(filterOf(explicit("SOLD")), /status:=SOLD/);
assert.doesNotMatch(filterOf(explicit("SOLD")), /ACTIVE/);
assert.match(filterOf(explicit("TERMINATED")), /status:=TERMINATED/);
assert.match(filterOf(explicit("CANCELLED")), /status:=TERMINATED/);
assert.match(
  filterOf(explicit("UNLISTED")),
  /status:=\[SUSPENDED,TERMINATED,EXPIRED\]/,
);

const city = parseListingSearchQueryParams(
  new URLSearchParams({ city: "Kitchener", transactionType: "SALE" }),
);
assert.equal(city.status, "ACTIVE");
assert.equal(city.q, undefined);
assert.equal(typesenseResultNeedsNeonFallback(city, 0), true);
const cities = parseListingSearchQueryParams(
  new URLSearchParams({ cities: "Cambridge|Kitchener", transactionType: "SALE" }),
);
assert.deepEqual(cities.cities, ["Cambridge", "Kitchener"]);
assert.equal(cities.status, "ACTIVE");
assert.equal(typesenseResultNeedsNeonFallback(cities, 0), true);
assert.equal(
  typesenseResultNeedsNeonFallback({ ...cities, cursor: "ts:2" }, 0),
  false,
);

const typed = searchHrefFromParsed(parseSearchQuery("eden oak trail"), {
  transactionType: "SALE",
});
assert.match(typed, /q=eden\+oak\+trail|q=eden%20oak%20trail/);
assert.doesNotMatch(typed, /[?&]lat=/);
assert.equal(shouldUseExplicitPlace(false), false);
assert.equal(shouldUseExplicitPlace(true), true);

const home = readFileSync(
  new URL("../src/components/home/HomeHeroSearch.tsx", import.meta.url),
  "utf8",
);
assert.match(home, /shouldUseExplicitPlace\(explicitPlaceRef\.current\)/);
assert.match(home, /if \(source !== "selected"\) return/);
const autocomplete = readFileSync(
  new URL(
    "../src/components/listings/AddressAutocomplete.tsx",
    import.meta.url,
  ),
  "utf8",
);
assert.match(autocomplete, /onPlaceResolvedRef\.current\?\.\(resolved, "auto"\)/);
assert.match(
  autocomplete,
  /onPlaceResolvedRef\.current\?\.\(addressRow, "selected"\)/,
);

const searchTs = readFileSync(
  new URL("../src/lib/typesense/search.ts", import.meta.url),
  "utf8",
);
const autocompleteTs = readFileSync(
  new URL("../src/lib/typesense/autocomplete.ts", import.meta.url),
  "utf8",
);
assert.match(searchTs, /typesenseTextMatchSettings\(q\)/);
assert.match(autocompleteTs, /typesenseTextMatchSettings\(q\)/);
assert.match(autocompleteTs, /compareStreetHistory/);
assert.match(
  readFileSync(
    new URL("../src/lib/listings/provider.ts", import.meta.url),
    "utf8",
  ),
  /orderStreetHistory/,
);
assert.match(autocompleteTs, /ACTIVE_LISTINGS/);
assert.match(autocompleteTs, /"SOLD"/);

const experience = readFileSync(
  new URL("../src/components/listings/SearchExperience.tsx", import.meta.url),
  "utf8",
);
const bounds = experience.slice(
  experience.indexOf("function onMapBoundsChange"),
  experience.indexOf("function onPolygonChange"),
);
assert.match(bounds, /if \(!meta\?\.userGesture\) return/);
assert.match(bounds, /city: ""/);
assert.match(bounds, /community: ""/);
assert.doesNotMatch(bounds, /q:\s*""/);

const searchRoute = readFileSync(
  new URL("../src/app/api/listings/search/route.ts", import.meta.url),
  "utf8",
);
assert.match(searchRoute, /if \(!isClient\)/);
assert.match(searchRoute, /soldPrice: null/);
const autocompleteRoute = readFileSync(
  new URL("../src/app/api/listings/autocomplete/route.ts", import.meta.url),
  "utf8",
);
assert.match(autocompleteRoute, /if \(!isClient\)/);
assert.match(autocompleteRoute, /!isOnMarketListingStatus/);
assert.match(autocompleteRoute, /listPrice: undefined/);

async function liveInventory() {
  const sale = {
    q: "eden oak trail",
    status: "ALL" as const,
    transactionType: "SALE" as const,
    sort: "newest" as const,
    limit: 20,
  };
  const trail = await typesenseSearch(sale, "proptx");
  assert.ok(trail, "Typesense search is enabled");
  assert.ok(trail.total > 0 && trail.total < 30);
  assert.ok(
    trail.items.some((item) => /eden oak trail/i.test(item.addressLine)),
  );
  for (const item of trail.items) {
    assert.match(item.addressLine, /eden oak trail/i);
    assert.notEqual(item.transactionType, "LEASE");
    assert.doesNotMatch(
      `${item.addressLine} ${item.community ?? ""}`,
      /burnhamthorpe|city centre/i,
    );
  }

  const missing = await typesenseSearch(
    { ...sale, q: "125 eden oak trail" },
    "proptx",
  );
  assert.ok(missing);
  assert.ok(missing.total < 10);
  for (const item of missing.items) {
    assert.match(item.addressLine, /eden oak trail/i);
    assert.match(item.addressLine, /\b125\b/);
  }

  const partial = await typesenseSearch({ ...sale, q: "eden oak" }, "proptx");
  assert.ok(partial);
  assert.ok(partial.total > 0);
  assert.ok(
    partial.items.some((item) => /eden oak/i.test(item.addressLine)),
  );

  const leaseHits = await typesenseSearch(
    { ...sale, transactionType: "LEASE" },
    "proptx",
  );
  assert.ok(leaseHits);
  for (const item of leaseHits.items) {
    assert.equal(item.transactionType, "LEASE");
    assert.match(item.addressLine, /eden oak trail/i);
  }

  const trailIds = new Set<string>();
  for (const q of [
    "eden oak t",
    "eden oak tr",
    "eden oak tra",
    "eden oak trai",
    "eden oak trail",
  ]) {
    const step = await typesenseSearch({ ...sale, q }, "proptx");
    assert.ok(step);
    const exact = step.items.filter((item) =>
      /\beden oak trail\b/i.test(item.addressLine),
    );
    assert.ok(exact.length > 0, q);
    if (q === "eden oak trai") {
      for (const item of exact) trailIds.add(item.mlsNumber);
    }
    if (q === "eden oak trail") {
      for (const item of step.items) {
        assert.match(item.addressLine, /\beden oak trail\b/i);
      }
      for (const mls of trailIds) {
        assert.ok(step.items.some((item) => item.mlsNumber === mls), mls);
      }
    }
  }

  const court = await typesenseSearch({ ...sale, q: "eden oak court" }, "proptx");
  assert.ok(court && court.total > 0);
  for (const item of court.items) {
    assert.match(item.addressLine, /\beden oak court\b/i);
    assert.doesNotMatch(item.addressLine, /\beden oak (trail|crescent)\b/i);
  }
  const crescent = await typesenseSearch(
    { ...sale, q: "eden oak crescent" },
    "proptx",
  );
  assert.ok(crescent && crescent.total > 0);
  for (const item of crescent.items) {
    assert.match(item.addressLine, /\beden oak crescent\b/i);
  }

  const suggestions = await typesenseAutocomplete("eden oak trail", {
    transactionType: "SALE",
  });
  assert.ok(suggestions);
  assert.ok(
    suggestions.some((item) => /eden oak trail/i.test(item.label)),
    "autocomplete and search both see Eden Oak Trail",
  );
  assert.ok(
    trail.items.some((item) =>
      suggestions.some((item) => /eden oak trail/i.test(item.label)),
    ),
  );

  console.log(
    JSON.stringify({
      edenOakTrail: trail.total,
      missingCivic: missing.total,
      edenOak: partial.total,
      lease: leaseHits.total,
      autocomplete: suggestions.filter((item) =>
        /eden oak trail/i.test(item.label),
      ).length,
    }),
  );
}

liveInventory()
  .then(() => {
    console.log("search-phase1-selftest ok");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

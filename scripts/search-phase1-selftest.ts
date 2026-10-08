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
  normalizeTypesenseStreetQuery,
  typesenseQueryPlan,
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

function assertPlan(typed: string, sent: string, strict: boolean) {
  const plan = typesenseQueryPlan(typed);
  assert.equal(plan.q, sent, typed);
  assert.equal(normalizeTypesenseStreetQuery(typed), sent, typed);
  if (strict) {
    assert.equal(plan.num_typos, 0, typed);
    assert.equal(plan.drop_tokens_threshold, 0, typed);
    assert.equal(plan.typo_tokens_threshold, 0, typed);
    return;
  }
  assert.equal(plan.num_typos, 1, typed);
  assert.equal(plan.drop_tokens_threshold, undefined, typed);
}

assertPlan("erin centre b", "erin centre b", false);
assertPlan("erin centre bl", "erin centre boulevard", true);
assertPlan("erin centre blv", "erin centre boulevard", true);
assertPlan("Erin Centre Blvd", "erin centre boulevard", true);
assertPlan("erin centre boulevard", "erin centre boulevard", true);
assertPlan("main r", "main r", false);
assertPlan("main rd", "main road", true);
assertPlan("main road", "main road", true);
assertPlan("king c", "king c", false);
assertPlan("king ct", "king court", true);
assertPlan("king crt", "king court", true);
assertPlan("king court", "king court", true);
assertPlan("eden oak t", "eden oak t", false);
assertPlan("eden oak tr", "eden oak trail", true);
assertPlan("eden oak tra", "eden oak trail", true);
assertPlan("eden oak trai", "eden oak trail", true);
assertPlan("eden oak trail", "eden oak trail", true);
assertPlan("lakeshore dr", "lakeshore drive", true);
assertPlan("burnhamthorpe av", "burnhamthorpe avenue", true);
assertPlan("burnhamthorpe ave", "burnhamthorpe avenue", true);
assertPlan("eden oak cres", "eden oak crescent", true);
assertPlan("eden oak cr", "eden oak crescent", true);
assertPlan("queen st", "queen street", true);
assertPlan("queen str", "queen street", true);
assertPlan("401 hwy", "401 highway", true);
assert.equal(typesenseQueryPlan("erin centre cr").q, "erin centre crescent");
assert.notEqual(typesenseQueryPlan("erin centre cr").q, "erin centre court");
assert.equal(typesenseQueryPlan("eden oak tr").q, "eden oak trail");
assert.notEqual(typesenseQueryPlan("eden oak tr").q, "eden oak terrace");
assertPlan("ruscombe c", "ruscombe c", false);
assertPlan("ruscombe cl", "ruscombe close", true);
assertPlan("ruscombe close", "ruscombe close", true);
assertPlan("mill run g", "mill run g", false);
assertPlan("mill run gt", "mill run gate", true);
assertPlan("mill run gate", "mill run gate", true);
assertPlan("rosemar gdns", "rosemar gardens", true);
assertPlan("rosemar gardens", "rosemar gardens", true);
assertPlan("orchard h", "orchard h", false);
assertPlan("orchard hts", "orchard heights", true);
assertPlan("orchard heights", "orchard heights", true);
assertPlan("victoria ter", "victoria terrace", true);
assertPlan("victoria terr", "victoria terrace", true);
assertPlan("victoria terrace", "victoria terrace", true);
assertPlan("carding mill pl", "carding mill place", true);
assertPlan("carding mill place", "carding mill place", true);
assertPlan("woods bay ln", "woods bay lane", true);
assertPlan("woods bay lane", "woods bay lane", true);
assertPlan("theobalds cir", "theobalds circle", true);
assertPlan("theobalds circle", "theobalds circle", true);
assertPlan("erin mills pkwy", "erin mills parkway", true);
assertPlan("erin mills parkway", "erin mills parkway", true);
assertPlan("maple ga", "maple ga", false);

for (const unchanged of [
  "kitchener",
  "W13757690",
  "L5M 2T6",
  "mississauga",
  "erin centre",
  "st clair",
  "blvd",
]) {
  assert.equal(normalizeTypesenseStreetQuery(unchanged), unchanged);
}
assert.equal(normalizeTypesenseStreetQuery("St Clair Ave"), "st clair avenue");
assert.equal(normalizeTypesenseStreetQuery("125 Main St"), "125 main street");

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
assert.match(searchTs, /typesenseQueryPlan\(/);
assert.match(autocompleteTs, /typesenseQueryPlan\(/);
assert.match(searchTs, /buildEntitledTypesenseFilterBy/);
assert.match(autocompleteTs, /discoveryAuthorityFilter/);
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
  experience.indexOf("function onSearchThisArea"),
);
assert.match(bounds, /if \(!meta\?\.userGesture\) return/);
// Pan/zoom must not clear place filters — Search This Area is explicit.
assert.match(bounds, /mapGestureSearchThisAreaState/);
assert.doesNotMatch(bounds, /clearMultiPlace/);
assert.doesNotMatch(bounds, /setCitiesOverride/);
assert.doesNotMatch(bounds, /syncUrl\(/);
assert.match(experience, /function onSearchThisArea/);
assert.match(experience, /from "@\/lib\/listings\/map-area-search"/);
assert.match(experience, /SearchViewModeSwitch/);
assert.match(experience, /"Cards"/);
assert.match(experience, /"Map"/);
assert.match(experience, /"Split"/);

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

  async function assertAliasAgrees(
    typed: string,
    canonical: string,
    address: RegExp,
  ) {
    const abbreviated = await typesenseSearch(
      { ...sale, q: typed, limit: 20 },
      "proptx",
    );
    const full = await typesenseSearch(
      { ...sale, q: canonical, limit: 20 },
      "proptx",
    );
    assert.ok(abbreviated && full, typed);
    assert.ok(full.total > 0, canonical);
    assert.equal(abbreviated.total, full.total, `${typed} vs ${canonical}`);
    for (const item of abbreviated.items) {
      assert.match(item.addressLine, address, typed);
    }
    const typedSuggestions = await typesenseAutocomplete(typed, {
      transactionType: "SALE",
    });
    const canonicalSuggestions = await typesenseAutocomplete(canonical, {
      transactionType: "SALE",
    });
    assert.ok(typedSuggestions && canonicalSuggestions, typed);
    const listingsOf = (
      rows: NonNullable<Awaited<ReturnType<typeof typesenseAutocomplete>>>,
    ) => rows.filter((item) => item.type === "listing" || item.type === "mls");
    const typedListings = listingsOf(typedSuggestions);
    const canonicalListings = listingsOf(canonicalSuggestions);
    assert.ok(typedListings.length > 0, `${typed} autocomplete`);
    for (const row of typedListings) {
      assert.match(row.label, address, `${typed} label`);
    }
    assert.deepEqual(
      typedListings.map((item) => item.mlsNumber),
      canonicalListings.map((item) => item.mlsNumber),
      `${typed} autocomplete vs ${canonical}`,
    );
  }

  await assertAliasAgrees(
    "erin centre blv",
    "erin centre boulevard",
    /erin centre (boulevard|blvd)/i,
  );
  await assertAliasAgrees(
    "erin centre blvd",
    "erin centre boulevard",
    /erin centre (boulevard|blvd)/i,
  );
  await assertAliasAgrees("main rd", "main road", /\b(road|rd)\b/i);
  await assertAliasAgrees("king ct", "king court", /\b(court|ct)\b/i);
  await assertAliasAgrees("king crt", "king court", /\b(court|ct)\b/i);
  await assertAliasAgrees("lakeshore dr", "lakeshore drive", /\b(drive|dr)\b/i);
  await assertAliasAgrees("dundas ave", "dundas avenue", /\b(avenue|ave)\b/i);
  await assertAliasAgrees(
    "eden oak cres",
    "eden oak crescent",
    /\b(crescent|cres)\b/i,
  );
  await assertAliasAgrees("queen st", "queen street", /\b(street|st)\b/i);
  await assertAliasAgrees("eden oak tr", "eden oak trail", /\btrail\b/i);
  await assertAliasAgrees("ruscombe cl", "ruscombe close", /\bclose\b/i);
  await assertAliasAgrees("mill run gt", "mill run gate", /\bgate\b/i);
  await assertAliasAgrees(
    "rosemar gdns",
    "rosemar gardens",
    /\b(gardens|gdns)\b/i,
  );
  await assertAliasAgrees("orchard hts", "orchard heights", /\bheights\b/i);
  await assertAliasAgrees(
    "victoria terr",
    "victoria terrace",
    /\b(terrace|ter)\b/i,
  );
  await assertAliasAgrees(
    "carding mill pl",
    "carding mill place",
    /\b(place|pl)\b/i,
  );
  await assertAliasAgrees("woods bay ln", "woods bay lane", /\b(lane|ln)\b/i);
  await assertAliasAgrees(
    "theobalds cir",
    "theobalds circle",
    /\b(circle|cir)\b/i,
  );
  await assertAliasAgrees(
    "erin mills pkwy",
    "erin mills parkway",
    /\b(parkway|pkwy)\b/i,
  );

  const sample = trail.items[0];
  assert.ok(sample);
  const city = await typesenseSearch({ ...sale, q: "kitchener" }, "proptx");
  assert.ok(city && city.total > 20);
  const mls = await typesenseSearch(
    { ...sale, q: sample.mlsNumber },
    "proptx",
  );
  assert.ok(mls?.items.some((item) => item.mlsNumber === sample.mlsNumber));
  if (sample.postalCode) {
    const postal = await typesenseSearch(
      { ...sale, q: sample.postalCode },
      "proptx",
    );
    assert.ok(
      postal?.items.some((item) => item.postalCode === sample.postalCode),
    );
    assert.equal(
      normalizeTypesenseStreetQuery(sample.postalCode),
      sample.postalCode.trim(),
    );
  }
  if (sample.community) {
    const community = await typesenseSearch(
      { ...sale, q: sample.community },
      "proptx",
    );
    assert.ok(community && community.total > 0);
    assert.equal(
      normalizeTypesenseStreetQuery(sample.community),
      sample.community.trim(),
    );
  }
  const civicFull = await typesenseSearch(
    { ...sale, q: "187 eden oak trail" },
    "proptx",
  );
  const civicAlias = await typesenseSearch(
    { ...sale, q: "187 eden oak tr" },
    "proptx",
  );
  assert.ok(civicFull && civicFull.total > 0);
  assert.equal(civicAlias?.total, civicFull.total);
  for (const item of civicAlias?.items ?? []) {
    assert.match(item.addressLine, /\b187\b/);
    assert.match(item.addressLine, /eden oak trail/i);
  }
  const missingAlias = await typesenseSearch(
    { ...sale, q: "125 eden oak tr" },
    "proptx",
  );
  assert.ok(missingAlias);
  assert.equal(missingAlias.total, missing.total);
  const activeOnly = await typesenseSearch(
    { ...sale, q: "erin centre boulevard", status: "ACTIVE", limit: 20 },
    "proptx",
  );
  assert.ok(activeOnly && activeOnly.total > 0);
  for (const item of activeOnly.items) {
    assert.ok(
      item.status === "ACTIVE" || item.status === "SOLD_CONDITIONAL",
      item.status ?? "",
    );
  }
  const closed = await typesenseSearch(
    {
      ...sale,
      q: "erin centre blvd",
      entitlementFilteringEnabled: true,
      entitlement: { workspaceId: "", authorities: [] },
    },
    "proptx",
  );
  assert.ok(closed);
  assert.equal(closed.total, 0);
  const closedSuggestions = await typesenseAutocomplete("erin centre blvd", {
    transactionType: "SALE",
    entitlementFilteringEnabled: true,
    entitlement: { workspaceId: "", authorities: [] },
  });
  assert.deepEqual(closedSuggestions, []);

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

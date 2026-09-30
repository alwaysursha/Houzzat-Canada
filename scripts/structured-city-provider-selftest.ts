/**
 * Structured city Typesense misses fall through to district-aware Neon matching.
 * Run: node --import tsx scripts/structured-city-provider-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  listingCityInServiceAreas,
  serviceAreaCityWhere,
} from "../src/lib/listings/precise-property-search";
import { parseListingSearchQueryParams } from "../src/lib/listings/parse-search-query-params";
import { typesenseResultNeedsNeonFallback } from "../src/lib/listings/provider";
import {
  parseInitialStatuses,
  statusesQueryValue,
} from "../src/lib/listings/search-page-href";
import { normalizeListingSearchStatuses } from "../src/lib/tenancy/listing-entitlement/search-authority-filters";

assert.equal(typesenseResultNeedsNeonFallback({ q: "cambridge" }, 0), true);
assert.equal(
  typesenseResultNeedsNeonFallback({ cities: ["Cambridge"] }, 0),
  true,
);
assert.equal(typesenseResultNeedsNeonFallback({ city: "Kitchener" }, 0), true);
assert.equal(
  typesenseResultNeedsNeonFallback(
    { cities: ["Cambridge", "Kitchener"] },
    0,
  ),
  true,
);
assert.equal(
  typesenseResultNeedsNeonFallback({ cities: ["Cambridge"], cursor: "ts:2" }, 0),
  false,
);
assert.equal(
  typesenseResultNeedsNeonFallback({ cities: ["Cambridge"], cursor: "W123" }, 0),
  true,
);
assert.equal(typesenseResultNeedsNeonFallback({ city: "Cambridge" }, 8), false);
assert.equal(typesenseResultNeedsNeonFallback({ q: "cambridge" }, 8), false);
assert.equal(typesenseResultNeedsNeonFallback({}, 0), false);
assert.equal(typesenseResultNeedsNeonFallback({ status: "ACTIVE" }, 0), false);
assert.equal(typesenseResultNeedsNeonFallback({ status: "SOLD" }, 0), true);
assert.equal(
  typesenseResultNeedsNeonFallback({ status: "TERMINATED" }, 0),
  true,
);
assert.equal(
  typesenseResultNeedsNeonFallback({ statuses: ["CANCELLED"] }, 0),
  true,
);
assert.equal(
  typesenseResultNeedsNeonFallback({ status: "SOLD", cursor: "ts:2" }, 0),
  false,
);
assert.equal(typesenseResultNeedsNeonFallback({ status: "SOLD" }, 4), false);
assert.deepEqual(parseInitialStatuses("SOLD", false), ["SOLD"]);
assert.deepEqual(parseInitialStatuses("ACTIVE", false), ["ACTIVE"]);
assert.equal(statusesQueryValue(parseInitialStatuses("ACTIVE", false)), null);

function searchedStatuses(status: string): string[] | null {
  const pageStatuses = parseInitialStatuses(status, false);
  const pageQuery = statusesQueryValue(pageStatuses);
  const params = parseListingSearchQueryParams(
    new URLSearchParams(pageQuery ? { status: pageQuery } : {}),
  );
  return normalizeListingSearchStatuses(params);
}

assert.deepEqual(searchedStatuses("TERMINATED"), ["TERMINATED"]);
assert.deepEqual(searchedStatuses("CANCELLED"), ["TERMINATED"]);
assert.deepEqual(searchedStatuses("SUSPENDED"), ["SUSPENDED"]);
assert.deepEqual(searchedStatuses("EXPIRED"), ["EXPIRED"]);
assert.deepEqual(searchedStatuses("UNLISTED"), [
  "SUSPENDED",
  "TERMINATED",
  "EXPIRED",
]);
assert.deepEqual(searchedStatuses("SOLD"), ["SOLD"]);
assert.deepEqual(searchedStatuses("ACTIVE"), ["ACTIVE", "SOLD_CONDITIONAL"]);
assert.deepEqual(
  normalizeListingSearchStatuses(
    parseListingSearchQueryParams(new URLSearchParams({ status: "CANCELLED" })),
  ),
  ["TERMINATED"],
);
assert.equal(
  typesenseResultNeedsNeonFallback({ city: "  ", cities: ["", " "] }, 0),
  false,
);

assert.equal(listingCityInServiceAreas("Toronto", ["Toronto"]), true);
assert.equal(listingCityInServiceAreas("toronto c01", ["Toronto"]), true);
assert.equal(listingCityInServiceAreas("Toronto C02", ["Toronto"]), true);
assert.equal(listingCityInServiceAreas("Kingston", ["King"]), false);
assert.equal(listingCityInServiceAreas("Cambridgeville", ["Cambridge"]), false);
assert.equal(listingCityInServiceAreas("Cambridge", ["Cambridge", "Kitchener"]), true);
assert.equal(listingCityInServiceAreas("Kitchener", ["Cambridge", "Kitchener"]), true);
assert.equal(listingCityInServiceAreas("Waterloo", ["Cambridge", "Kitchener"]), false);

const toronto = serviceAreaCityWhere(["Toronto"]);
assert.deepEqual(toronto.OR, [
  { city: { equals: "Toronto", mode: "insensitive" } },
  { city: { startsWith: "Toronto ", mode: "insensitive" } },
]);
const multi = serviceAreaCityWhere(["Cambridge", "Kitchener"]);
assert.equal(Array.isArray(multi.OR) ? multi.OR.length : 0, 4);

const provider = readFileSync("src/lib/listings/provider.ts", "utf8");
assert.match(provider, /serviceAreaCityWhere\(cityNames\)/);
assert.match(provider, /typesenseResultNeedsNeonFallback/);
assert.doesNotMatch(provider, /FSBO-CAM01|FSBO-KW01/);
assert.doesNotMatch(
  readFileSync("src/components/listings/SearchMap.tsx", "utf8"),
  /typesenseResultNeedsNeonFallback/,
);

console.log("structured-city-provider-selftest: ok");

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
import { typesenseResultNeedsNeonFallback } from "../src/lib/listings/provider";

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

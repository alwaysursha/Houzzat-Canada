/**
 * Recognized whole-query cities become the existing cities filter.
 * Run: node --import tsx scripts/structured-city-search-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalMarketCity } from "../src/lib/geo/regions";
import { parseSearchQuery } from "../src/lib/listings/parse-search-query";
import {
  structuredCitiesFromSearch,
  withStructuredCity,
} from "../src/lib/listings/structured-cities";

assert.equal(canonicalMarketCity("cambridge"), "Cambridge");
assert.equal(canonicalMarketCity("KITCHENER"), "Kitchener");
assert.equal(canonicalMarketCity(" waterloo "), "Waterloo");
assert.equal(canonicalMarketCity("ajax"), "Ajax");
assert.equal(canonicalMarketCity("pickering"), "Pickering");
assert.equal(canonicalMarketCity("79 Grand Ave"), null);
assert.equal(canonicalMarketCity("The Beaches"), null);
assert.equal(canonicalMarketCity("FSBO-KW01"), null);
assert.equal(canonicalMarketCity("Cambridge homes"), null);

assert.equal(parseSearchQuery("cambridge").q, "cambridge");
assert.equal(parseSearchQuery("cambridge").city, undefined);
assert.equal(parseSearchQuery("79 Grand Ave").q, "79 Grand Ave");

assert.deepEqual(withStructuredCity([], "cambridge"), ["Cambridge"]);
assert.deepEqual(
  withStructuredCity(["Cambridge"], "KITCHENER"),
  ["Cambridge", "Kitchener"],
);
assert.deepEqual(
  withStructuredCity(["Cambridge", "Kitchener"], "kitchener"),
  ["Cambridge", "Kitchener"],
);
assert.deepEqual(
  withStructuredCity(["Cambridge", "Kitchener"], "Waterloo"),
  ["Cambridge", "Kitchener", "Waterloo"],
);
assert.equal(withStructuredCity(["Cambridge"], "79 Grand Ave"), null);
assert.deepEqual(
  withStructuredCity(["Ajax"], "Pickering"),
  ["Ajax", "Pickering"],
);

assert.deepEqual(structuredCitiesFromSearch("Cambridge|Kitchener", "Ignored"), [
  "Cambridge",
  "Kitchener",
]);
assert.deepEqual(structuredCitiesFromSearch("", "Cambridge"), ["Cambridge"]);
assert.deepEqual(structuredCitiesFromSearch("", ""), []);

const experience = readFileSync(
  "src/components/listings/SearchExperience.tsx",
  "utf8",
);
assert.ok(experience.includes("withStructuredCity"));
assert.equal(experience.includes("skipBoundsNotify"), false);
const hints = readFileSync("src/lib/listings/parse-search-query.ts", "utf8");
assert.equal(hints.includes('"Cambridge"'), false);
assert.equal(hints.includes('"Kitchener"'), false);
assert.equal(hints.includes('"Waterloo"'), false);

console.log("structured city search selftest ok");

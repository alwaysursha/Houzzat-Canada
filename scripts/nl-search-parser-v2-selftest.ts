/**
 * NL search parser v2 — deterministic phrase → structured URL filters.
 * Run: pnpm nl-search-parser-v2:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNlSearchParserV2Enabled } from "../src/lib/listings/nl-search-parser-flag";
import {
  parseSearchQuery,
  parseSearchQueryLegacy,
  parseSearchQueryV2,
  searchHrefFromParsed,
} from "../src/lib/listings/parse-search-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function withFlag<T>(enabled: boolean, fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
  process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 = enabled ? "1" : "0";
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
    } else {
      process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 = prev;
    }
  }
}

function hrefV2(phrase: string): string {
  return searchHrefFromParsed(parseSearchQueryV2(phrase));
}

function paramsOf(href: string): URLSearchParams {
  return new URL(href, "http://localhost").searchParams;
}

function testExamplePhrases() {
  const rentals = parseSearchQueryV2("Rentals in Mississauga");
  assert.equal(rentals.transactionType, "LEASE");
  assert.equal(rentals.city, "Mississauga");
  assert.equal(rentals.propertyTypes, undefined);
  assert.equal(rentals.q, undefined);

  const towns = parseSearchQueryV2("Townhouses in Markham");
  assert.deepEqual(towns.propertyTypes?.slice().sort(), [
    "CONDO_TOWNHOUSE",
    "TOWNHOUSE",
  ]);
  assert.equal(towns.city, "Markham");
  assert.equal(towns.transactionType, undefined);

  const apts = parseSearchQueryV2("3-bedroom apartments in Toronto");
  assert.equal(apts.minBeds, 3);
  assert.deepEqual(apts.propertyTypes, ["CONDO_APT"]);
  assert.equal(apts.city, "Toronto");
  assert.equal(apts.q, undefined);

  const det = parseSearchQueryV2("Detached homes under $1M in Brampton");
  assert.deepEqual(det.propertyTypes, ["DETACHED"]);
  assert.equal(det.maxPrice, 1_000_000);
  assert.equal(det.city, "Brampton");
  assert.equal(det.q, undefined);

  const condoRent = parseSearchQueryV2(
    "Condos for rent under $2,500 in Kitchener",
  );
  assert.equal(condoRent.transactionType, "LEASE");
  assert.deepEqual(condoRent.propertyTypes, ["CONDO_APT"]);
  assert.equal(condoRent.maxPrice, 2500);
  assert.equal(condoRent.city, "Kitchener");

  const multi = parseSearchQueryV2(
    "4-bedroom homes in Mississauga or Oakville",
  );
  assert.equal(multi.minBeds, 4);
  assert.equal(multi.propertyTypes, undefined, "generic homes ≠ DETACHED");
  assert.deepEqual(multi.cities?.slice().sort(), ["Mississauga", "Oakville"]);
  assert.equal(multi.city, undefined);
  assert.equal(multi.q, undefined);

  const baths = parseSearchQueryV2(
    "2-bathroom detached homes in Cambridge",
  );
  assert.equal(baths.minBaths, 2);
  assert.deepEqual(baths.propertyTypes, ["DETACHED"]);
  assert.equal(baths.city, "Cambridge");

  const between = parseSearchQueryV2(
    "Homes between $600k and $900k in Waterloo",
  );
  assert.equal(between.minPrice, 600_000);
  assert.equal(between.maxPrice, 900_000);
  assert.equal(between.city, "Waterloo");
  assert.equal(between.propertyTypes, undefined);
  assert.equal(between.q, undefined);

  console.log("[examples] phrase mappings PASS");
}

function testMultiCitySerialization() {
  const href = hrefV2("Homes in Mississauga or Oakville");
  const p = paramsOf(href);
  assert.equal(p.get("cities"), "Mississauga|Oakville");
  assert.equal(p.get("city"), null);

  const andHref = hrefV2("Rentals in Kitchener and Waterloo");
  const ap = paramsOf(andHref);
  assert.equal(ap.get("transactionType"), "LEASE");
  assert.equal(ap.get("cities"), "Kitchener|Waterloo");

  const comma = hrefV2("Homes in Brampton, Mississauga, Caledon");
  const cp = paramsOf(comma);
  assert.ok(cp.get("cities")?.includes("Brampton"));
  assert.ok(cp.get("cities")?.includes("Mississauga"));
  assert.ok(cp.get("cities")?.includes("Caledon"));

  const single = hrefV2("Townhouses in Markham");
  assert.equal(paramsOf(single).get("city"), "Markham");
  assert.equal(paramsOf(single).get("cities"), null);
  console.log("[cities] multi-city URL PASS");
}

function testGenericHomesAndFalsePositives() {
  const homes = parseSearchQueryV2("Homes in Guelph");
  assert.equal(homes.propertyTypes, undefined);
  assert.equal(homes.city, "Guelph");

  // "King" must not match inside unrelated words.
  const parking = parseSearchQueryV2("parking near Mississauga");
  assert.equal(parking.city, "Mississauga");
  assert.ok(!parking.cities?.includes("King"));

  const looking = parseSearchQueryV2("looking for rentals in Brampton");
  assert.equal(looking.transactionType, "LEASE");
  assert.equal(looking.city, "Brampton");
  assert.equal(looking.q, undefined);
  console.log("[types/geo] generic homes + false positives PASS");
}

function testMalformedPricesAndLeftovers() {
  const bad = parseSearchQueryV2("Homes under $ in Toronto");
  assert.equal(bad.maxPrice, undefined);
  assert.equal(bad.city, "Toronto");

  const junk = parseSearchQueryV2("Homes under xyz in Toronto");
  assert.equal(junk.maxPrice, undefined);

  const meaningful = parseSearchQueryV2("eden oak trail Mississauga");
  assert.equal(meaningful.city, "Mississauga");
  assert.ok(meaningful.q?.toLowerCase().includes("eden"));
  console.log("[price/q] malformed + leftovers PASS");
}

function testFlagOffRegression() {
  withFlag(false, () => {
    assert.equal(isNlSearchParserV2Enabled(), false);
    // Legacy: bare cambridge stays free-text (structured city search owns whole-query city).
    const bare = parseSearchQuery("cambridge");
    assert.equal(bare.q, "cambridge");
    assert.equal(bare.city, undefined);

    // Legacy: homes → DETACHED
    const legacyHomes = parseSearchQueryLegacy("Homes in Oakville");
    assert.deepEqual(legacyHomes.propertyTypes, ["DETACHED"]);
    assert.equal(legacyHomes.city, "Oakville");

    // Flag OFF dispatch uses legacy
    const viaFlag = parseSearchQuery("Homes in Oakville");
    assert.deepEqual(viaFlag.propertyTypes, ["DETACHED"]);
  });

  withFlag(true, () => {
    assert.equal(isNlSearchParserV2Enabled(), true);
    const v2 = parseSearchQuery("Homes in Oakville");
    assert.equal(v2.propertyTypes, undefined);
    assert.equal(v2.city, "Oakville");
  });
  console.log("[flag] OFF regression + ON dispatch PASS");
}

function testBathsInHref() {
  const href = hrefV2("2 bath detached in Cambridge");
  const p = paramsOf(href);
  assert.equal(p.get("minBaths"), "2");
  assert.equal(p.get("propertyTypes"), "DETACHED");
  assert.equal(p.get("city"), "Cambridge");
  console.log("[baths] minBaths URL PASS");
}

function testSourceGuards() {
  const src = readFileSync(
    join(root, "src/lib/listings/parse-search-query.ts"),
    "utf8",
  );
  assert.ok(src.includes("isNlSearchParserV2Enabled"));
  assert.ok(src.includes("parseSearchQueryV2"));
  assert.ok(src.includes("parseSearchQueryLegacy"));
  assert.ok(src.includes("staticOntarioHubCities"));
  assert.ok(src.includes("cities.join(\"|\")") || src.includes('cities.join("|")'));

  const env = readFileSync(join(root, ".env.example"), "utf8");
  assert.ok(env.includes("NEXT_PUBLIC_NL_SEARCH_PARSER_V2"));
  assert.ok(env.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"'));
  console.log("[source] guards PASS");
}

function main() {
  testSourceGuards();
  testExamplePhrases();
  testMultiCitySerialization();
  testGenericHomesAndFalsePositives();
  testMalformedPricesAndLeftovers();
  testFlagOffRegression();
  testBathsInHref();
  console.log("nl-search-parser-v2-selftest: OK");
}

main();

/**
 * Phase 4 — NL → URL → committed chips → saved search + status safety.
 * Run: pnpm nl-search-chips-saved:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { savedQueryToSearchHref } from "../src/lib/agent/intent-to-search";
import { unspecifiedSearchStatus } from "../src/lib/listings/parse-search-query-params";
import {
  leftoverQueryForSearchHref,
  parseSearchQueryV2,
  searchHrefFromParsed,
} from "../src/lib/listings/parse-search-query";
import {
  buildActiveChips,
  buildListingsQuery,
  buildSavedSearchQuery,
  initialSearchState,
  parseSearchUrl,
  reduceSearch,
  serializeSearchUrl,
  shouldPinActiveStatusForBuyerQuery,
  type CommittedSearch,
  type SearchState,
} from "../src/lib/listings/search-state";
import { inventorySearchHrefFromQuery } from "../src/lib/listings/unified-search-route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withFlags<T>(
  flags: { nl?: boolean; offMarket?: boolean },
  fn: () => T,
): T {
  const prevNl = process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
  const prevOm = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 = flags.nl ? "1" : "0";
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = flags.offMarket
    ? "1"
    : "0";
  try {
    return fn();
  } finally {
    if (prevNl === undefined) delete process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
    else process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 = prevNl;
    if (prevOm === undefined) {
      delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = prevOm;
    }
  }
}

function chipMap(committed: CommittedSearch) {
  return buildActiveChips(committed).map((c) => ({
    key: c.key,
    label: c.label,
    city: "city" in c ? (c as { city?: string }).city : undefined,
  }));
}

function testExamplePhraseChips() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "3-bedroom townhouses in Mississauga under $900K",
      { transactionType: "SALE" },
    );
    const committed = parseSearchUrl(href);
    assert.deepEqual(committed.cities, ["Mississauga"]);
    assert.equal(committed.minBeds, "3");
    assert.equal(committed.maxPrice, "900000");
    assert.deepEqual(committed.propertyTypes.slice().sort(), [
      "CONDO_TOWNHOUSE",
      "TOWNHOUSE",
    ]);
    assert.equal(committed.transactionType, "SALE");
    assert.equal(committed.q, "");
    assert.deepEqual(committed.statuses, ["ACTIVE"]);

    const chips = chipMap(committed);
    const labels = chips.map((c) => c.label);
    assert.ok(labels.includes("For Sale"));
    assert.ok(labels.includes("Mississauga"));
    assert.ok(labels.includes("3+ Beds"));
    assert.ok(labels.includes("Townhouse / Condo Townhouse"));
    assert.ok(labels.some((l) => /900|Under/i.test(l)));
    assert.equal(chips.some((c) => c.key === "query"), false);
    assert.equal(chips.some((c) => c.key === "status"), false);

    const api = new URLSearchParams(buildListingsQuery(committed));
    assert.equal(api.get("status"), null);
    assert.equal(api.get("q"), null);
    assert.equal(unspecifiedSearchStatus(api.get("q")), "ACTIVE");
  });
  console.log("[chips] example phrase PASS");
}

function testChipRemovalAndUrlSync() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "3-bedroom townhouses in Mississauga under $900K",
      { transactionType: "SALE" },
    );
    let state: SearchState = initialSearchState(parseSearchUrl(href));

    state = reduceSearch(state, {
      type: "REMOVE_CHIP",
      chip: { key: "beds", label: "3+ Beds", clearable: true },
    });
    assert.equal(state.committed.minBeds, "");
    assert.equal(state.committed.maxPrice, "900000");

    state = reduceSearch(state, {
      type: "REMOVE_CHIP",
      chip: { key: "price", label: "Under $900K", clearable: true },
    });
    assert.equal(state.committed.maxPrice, "");

    state = reduceSearch(state, {
      type: "REMOVE_CHIP",
      chip: {
        key: "types",
        label: "Townhouse / Condo Townhouse",
        clearable: true,
      },
    });
    assert.deepEqual(state.committed.propertyTypes, []);

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

    const serialized = serializeSearchUrl(state.committed);
    assert.equal(serialized.includes("minBeds="), false);
    assert.equal(serialized.includes("maxPrice="), false);
    assert.equal(serialized.includes("propertyTypes="), false);
    assert.equal(serialized.includes("city="), false);
  });
  console.log("[chips] removal + URL sync PASS");
}

function testMultiCityPersistence() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "Homes in Mississauga or Oakville",
      { transactionType: "SALE" },
    );
    const committed = parseSearchUrl(href);
    assert.deepEqual(committed.cities.slice().sort(), [
      "Mississauga",
      "Oakville",
    ]);
    const cities = chipMap(committed).filter((c) => c.key === "city");
    assert.equal(cities.length, 2);

    let state: SearchState = initialSearchState(committed);
    state = reduceSearch(state, {
      type: "REMOVE_CHIP",
      chip: {
        key: "city",
        label: "Mississauga",
        clearable: true,
        city: "Mississauga",
      },
    });
    assert.deepEqual(state.committed.cities, ["Oakville"]);
    const again = serializeSearchUrl(state.committed);
    assert.ok(again.includes("city=Oakville"));
    assert.equal(again.includes("cities="), false);

    const reloaded = parseSearchUrl(again);
    assert.deepEqual(reloaded.cities, ["Oakville"]);
  });
  console.log("[cities] multi-city chips PASS");
}

function testSavedSearchStructured() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "3-bedroom townhouses in Mississauga under $900K",
      { transactionType: "SALE" },
    );
    const committed = parseSearchUrl(href);
    const saved = buildSavedSearchQuery(committed);
    assert.equal(saved.city, "Mississauga");
    assert.equal(saved.minBeds, "3");
    assert.equal(saved.maxPrice, "900000");
    assert.equal(typeof saved.propertyTypes, "string");
    assert.ok(String(saved.propertyTypes).includes("TOWNHOUSE"));
    assert.equal(saved.transactionType, "SALE");
    assert.equal(saved.q, undefined);

    const reloadHref = savedQueryToSearchHref(saved);
    const reloaded = parseSearchUrl(reloadHref);
    assert.deepEqual(reloaded.cities, ["Mississauga"]);
    assert.equal(reloaded.minBeds, "3");
    assert.equal(reloaded.maxPrice, "900000");
    assert.ok(reloaded.propertyTypes.includes("TOWNHOUSE"));
  });
  console.log("[saved] structured serialize/reload PASS");
}

function testStatusSafety() {
  withFlags({ nl: true, offMarket: false }, () => {
    const clean = inventorySearchHrefFromQuery(
      "looking for rentals in Brampton",
      { transactionType: "SALE" },
    );
    assert.equal(new URL(clean, "http://x").searchParams.get("q"), null);

    const street = parseSearchQueryV2("eden oak trail Mississauga");
    assert.equal(street.city, "Mississauga");
    assert.ok(street.q?.toLowerCase().includes("eden"));
    assert.ok(leftoverQueryForSearchHref(street));
    const streetHref = searchHrefFromParsed(street, {
      transactionType: "SALE",
    });
    const streetCommitted = parseSearchUrl(streetHref);
    assert.ok(streetCommitted.q);
    assert.equal(shouldPinActiveStatusForBuyerQuery(streetCommitted), false);
    const streetApi = new URLSearchParams(buildListingsQuery(streetCommitted));
    assert.equal(streetApi.get("status"), null);
    assert.equal(unspecifiedSearchStatus(streetApi.get("q")), "ALL");

    const buyerLeftover: CommittedSearch = {
      ...parseSearchUrl(
        inventorySearchHrefFromQuery("3-bedroom apartments in Toronto", {
          transactionType: "SALE",
        }),
      ),
      q: "some builder name",
    };
    assert.equal(shouldPinActiveStatusForBuyerQuery(buyerLeftover), true);
    const buyerApi = new URLSearchParams(buildListingsQuery(buyerLeftover));
    assert.equal(buyerApi.get("status"), "ACTIVE");
    assert.equal(buyerApi.get("q"), "some builder name");

    const crumbParsed = {
      ...parseSearchQueryV2("Homes in Oakville"),
      q: "looking for",
      hasFilters: true,
    };
    assert.equal(leftoverQueryForSearchHref(crumbParsed), undefined);
  });
  console.log("[status] buyer safety + historical q PASS");
}

function testFlagCombinations() {
  withFlags({ nl: false, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery("Homes in Oakville", {
      transactionType: "SALE",
    });
    const c = parseSearchUrl(href);
    assert.deepEqual(c.propertyTypes, ["DETACHED"]);
    assert.ok(chipMap(c).some((x) => x.label === "Detached"));
  });
  withFlags({ nl: true, offMarket: false }, () => {
    const c = parseSearchUrl(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.deepEqual(c.propertyTypes, []);
  });
  withFlags({ nl: false, offMarket: true }, () => {
    const c = parseSearchUrl(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.deepEqual(c.propertyTypes, ["DETACHED"]);
  });
  withFlags({ nl: true, offMarket: true }, () => {
    const c = parseSearchUrl(
      inventorySearchHrefFromQuery(
        "4-bedroom homes in Mississauga or Oakville",
        { transactionType: "SALE" },
      ),
    );
    assert.equal(c.minBeds, "4");
    assert.equal(c.cities.length, 2);
    assert.deepEqual(c.propertyTypes, []);
  });
  console.log("[flags] four combinations PASS");
}

function testMobileListingSheetStack() {
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  assert.ok(chrome.includes("routeFreeTextInventorySearch"));
  assert.ok(chrome.includes('routed.via === "listing"'));
  assert.ok(chrome.includes("openListingSheet(routed.href)"));

  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("fillOnly && onPlaceSelect"));
  const listingBlock = ac.slice(
    ac.indexOf('if (decision.kind === "listing")'),
    ac.indexOf('if (decision.kind === "property_prepared")'),
  );
  assert.ok(listingBlock.includes("onPlaceSelect"));
  assert.ok(listingBlock.includes("decision.mlsNumber"));
  console.log("[mobile] listing sheet stack wiring PASS");
}

function testExperienceHydratePath() {
  const exp = read("src/components/listings/SearchExperience.tsx");
  assert.ok(exp.includes("routeFreeTextInventorySearch"));
  assert.ok(exp.includes("router.push(routed.href)"));
  assert.ok(exp.includes("buildActiveChips"));
  assert.ok(exp.includes("clearResultChip"));
  assert.ok(exp.includes('type: "REMOVE_CHIP"'));
  console.log("[experience] hydrate + chips wiring PASS");
}

function main() {
  testExamplePhraseChips();
  testChipRemovalAndUrlSync();
  testMultiCityPersistence();
  testSavedSearchStructured();
  testStatusSafety();
  testFlagCombinations();
  testMobileListingSheetStack();
  testExperienceHydratePath();
  console.log("nl-search-chips-saved-selftest: OK");
}

main();

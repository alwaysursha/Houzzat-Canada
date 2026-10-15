/**
 * Phase 3 — unified free-text search routing (flags independent).
 * Run: pnpm unified-search-routing:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNlSearchParserV2Enabled } from "../src/lib/listings/nl-search-parser-flag";
import { unspecifiedSearchStatus } from "../src/lib/listings/parse-search-query-params";
import {
  inventorySearchHrefFromQuery,
  routeFreeTextInventorySearch,
  shouldAttemptOffMarketFreeTextResolve,
} from "../src/lib/listings/unified-search-route";
import { isOffMarketPropertySearchEnabled } from "../src/lib/property-address/feature-flag";
import type { ResolveAddressResult } from "../src/lib/property-address/resolve-address";
import {
  decideSearchAddressNavigation,
  rememberPreparedPropertyAddress,
} from "../src/lib/property-address/search-integration";

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

async function withFlagsAsync<T>(
  flags: { nl?: boolean; offMarket?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const prevNl = process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
  const prevOm = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2 = flags.nl ? "1" : "0";
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = flags.offMarket
    ? "1"
    : "0";
  try {
    return await fn();
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

function paramsOf(href: string): URLSearchParams {
  return new URL(href, "http://localhost").searchParams;
}

function testCivicGateIndependentOfNlFlag() {
  withFlags({ nl: false, offMarket: false }, () => {
    assert.equal(isNlSearchParserV2Enabled(), false);
    assert.equal(isOffMarketPropertySearchEnabled(), false);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve(
        "79 Grand Flats Trail, Kitchener",
      ),
      false,
    );
  });

  withFlags({ nl: true, offMarket: false }, () => {
    assert.equal(isNlSearchParserV2Enabled(), true);
    assert.equal(isOffMarketPropertySearchEnabled(), false);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve(
        "79 Grand Flats Trail, Kitchener",
      ),
      false,
      "NL ON must not enable civic resolve",
    );
  });

  withFlags({ nl: false, offMarket: true }, () => {
    assert.equal(isNlSearchParserV2Enabled(), false);
    assert.equal(isOffMarketPropertySearchEnabled(), true);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve(
        "79 Grand Flats Trail, Kitchener",
      ),
      true,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("Rentals in Mississauga"),
      false,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("3 bed Ajax"),
      false,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("Townhouses in Markham"),
      false,
    );
  });

  withFlags({ nl: true, offMarket: true }, () => {
    assert.equal(isNlSearchParserV2Enabled(), true);
    assert.equal(isOffMarketPropertySearchEnabled(), true);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve(
        "79 Grand Flats Trail, Kitchener",
      ),
      true,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("4-bedroom homes in Oakville"),
      false,
    );
  });
  console.log("[flags] civic gate × 4 combos PASS");
}

function testNlUrlFiltersByFlag() {
  withFlags({ nl: false, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery("Homes in Oakville", {
      transactionType: "SALE",
    });
    const p = paramsOf(href);
    assert.equal(p.get("propertyTypes"), "DETACHED", "legacy homes→DETACHED");
    assert.equal(p.get("city"), "Oakville");
  });

  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "4-bedroom homes in Mississauga or Oakville",
      { transactionType: "SALE" },
    );
    const p = paramsOf(href);
    assert.equal(p.get("minBeds"), "4");
    assert.equal(p.get("cities"), "Mississauga|Oakville");
    assert.equal(p.get("city"), null);
    assert.equal(p.get("propertyTypes"), null, "generic homes ≠ DETACHED");
    assert.equal(p.get("q"), null, "no filler q");
  });

  withFlags({ nl: true, offMarket: true }, () => {
    const href = inventorySearchHrefFromQuery(
      "Condos for rent under $2,500 in Kitchener",
      { transactionType: "SALE" },
    );
    const p = paramsOf(href);
    assert.equal(p.get("transactionType"), "LEASE");
    assert.equal(p.get("propertyTypes"), "CONDO_APT");
    assert.equal(p.get("maxPrice"), "2500");
    assert.equal(p.get("city"), "Kitchener");
    assert.equal(p.get("q"), null);
  });

  withFlags({ nl: false, offMarket: true }, () => {
    // Off-market ON must not change NL legacy parse for non-civic phrases.
    const href = inventorySearchHrefFromQuery("Homes in Oakville", {
      transactionType: "SALE",
    });
    assert.equal(paramsOf(href).get("propertyTypes"), "DETACHED");
  });
  console.log("[nl] URL filters by flag PASS");
}

function testNoInactiveLeakageFromFillerQ() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "looking for rentals in Brampton",
      { transactionType: "SALE" },
    );
    const p = paramsOf(href);
    assert.equal(p.get("q"), null);
    assert.equal(p.get("transactionType"), "LEASE");
    assert.equal(p.get("city"), "Brampton");
    assert.equal(
      unspecifiedSearchStatus(p.get("q")),
      "ACTIVE",
      "no q → ACTIVE inventory",
    );
  });

  // Meaningful leftover street text may broaden — intentional.
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery("eden oak trail Mississauga", {
      transactionType: "SALE",
    });
    const q = paramsOf(href).get("q");
    assert.ok(q);
    assert.equal(unspecifiedSearchStatus(q), "ALL");
  });
  console.log("[status] filler q leakage PASS");
}

function testSelectTimeDecisionsUnchanged() {
  const active: ResolveAddressResult = {
    ok: true,
    address: {
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      unitNumber: null,
      city: "Kitchener",
      province: "ON",
      postalCode: null,
      lat: 43.4,
      lng: -80.4,
      placeId: "p1",
      provider: "photon",
    },
    listingStatusClass: "ACTIVE_LISTING",
    activeListing: {
      mlsNumber: "X123",
      path: "/listing/79-grand-flats-trail-kitchener/X123",
    },
    confidence: "high",
    resolution: { geocodeOk: true, mlsProbe: "active", errors: [], warnings: [] },
  };
  assert.equal(decideSearchAddressNavigation(active).kind, "listing");

  const off: ResolveAddressResult = {
    ...active,
    listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
    activeListing: null,
    resolution: { geocodeOk: true, mlsProbe: "none", errors: [], warnings: [] },
  };
  const prep = decideSearchAddressNavigation(off);
  assert.equal(prep.kind, "property_prepared");

  const unknown: ResolveAddressResult = {
    ...active,
    listingStatusClass: "UNKNOWN",
    activeListing: null,
    resolution: {
      geocodeOk: true,
      mlsProbe: "failed",
      errors: ["timeout"],
      warnings: [],
    },
  };
  const near = decideSearchAddressNavigation(unknown);
  assert.equal(near.kind, "nearby");
  assert.equal(/off[-\s]?market/i.test(JSON.stringify(near)), false);

  const bad: ResolveAddressResult = {
    ok: false,
    error: "nope",
    code: "UNRESOLVABLE",
    listingStatusClass: "UNKNOWN",
    resolution: {
      geocodeOk: false,
      mlsProbe: "skipped",
      errors: ["approximate"],
      warnings: [],
    },
  };
  assert.equal(decideSearchAddressNavigation(bad).kind, "unresolvable");
  console.log("[select] ACTIVE / off-market / UNKNOWN / UNRESOLVABLE PASS");
}

async function testFreeTextRouteWithMockFetch() {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.ok(url.includes("/api/property-address/resolve"));
    fetchCount += 1;
    const body: ResolveAddressResult = {
      ok: true,
      address: {
        formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
        streetNumber: "79",
        streetName: "Grand Flats Trail",
        unitNumber: null,
        city: "Kitchener",
        province: "ON",
        postalCode: null,
        lat: 43.4,
        lng: -80.4,
        placeId: null,
        provider: "photon",
      },
      listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
      activeListing: null,
      confidence: "high",
      resolution: {
        geocodeOk: true,
        mlsProbe: "none",
        errors: [],
        warnings: [],
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withFlagsAsync({ nl: true, offMarket: false }, async () => {
      fetchCount = 0;
      const routed = await routeFreeTextInventorySearch(
        "79 Grand Flats Trail, Kitchener",
        { transactionType: "SALE" },
      );
      assert.equal(fetchCount, 0, "off-market OFF → no resolve fetch");
      assert.equal(routed.via, "search");
      assert.ok(routed.href.startsWith("/search"));
    });

    await withFlagsAsync({ nl: false, offMarket: true }, async () => {
      fetchCount = 0;
      const routed = await routeFreeTextInventorySearch(
        "79 Grand Flats Trail, Kitchener",
        { transactionType: "SALE" },
      );
      assert.equal(fetchCount, 1, "one resolve per submit");
      assert.equal(routed.via, "property");
      assert.ok(routed.href.startsWith("/property/"));
    });

    await withFlagsAsync({ nl: true, offMarket: true }, async () => {
      fetchCount = 0;
      const nl = await routeFreeTextInventorySearch("Rentals in Mississauga", {
        transactionType: "SALE",
      });
      assert.equal(fetchCount, 0, "NL phrase must not resolve");
      assert.equal(nl.via, "search");
      assert.equal(paramsOf(nl.href).get("transactionType"), "LEASE");
      assert.equal(paramsOf(nl.href).get("city"), "Mississauga");

      const civic = await routeFreeTextInventorySearch(
        "79 Grand Flats Trail, Kitchener",
        { transactionType: "SALE" },
      );
      assert.equal(fetchCount, 1);
      assert.equal(civic.via, "property");
    });

    await withFlagsAsync({ nl: true, offMarket: true }, async () => {
      fetchCount = 0;
      globalThis.fetch = (async () => {
        fetchCount += 1;
        const body: ResolveAddressResult = {
          ok: true,
          address: {
            formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
            streetNumber: "79",
            streetName: "Grand Flats Trail",
            unitNumber: null,
            city: "Kitchener",
            province: "ON",
            postalCode: null,
            lat: 43.4,
            lng: -80.4,
            placeId: null,
            provider: "photon",
          },
          listingStatusClass: "ACTIVE_LISTING",
          activeListing: {
            mlsNumber: "X999",
            path: "/listing/79-grand-flats-trail-kitchener/X999",
          },
          confidence: "high",
          resolution: {
            geocodeOk: true,
            mlsProbe: "active",
            errors: [],
            warnings: [],
          },
        };
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch;

      const routed = await routeFreeTextInventorySearch(
        "79 Grand Flats Trail, Kitchener",
        { transactionType: "SALE" },
      );
      assert.equal(routed.via, "listing");
      assert.equal(
        routed.href,
        "/listing/79-grand-flats-trail-kitchener/X999",
      );
    });

    await withFlagsAsync({ nl: true, offMarket: true }, async () => {
      fetchCount = 0;
      globalThis.fetch = (async () => {
        fetchCount += 1;
        const body: ResolveAddressResult = {
          ok: true,
          address: {
            formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
            streetNumber: "79",
            streetName: "Grand Flats Trail",
            unitNumber: null,
            city: "Kitchener",
            province: "ON",
            postalCode: null,
            lat: 43.4,
            lng: -80.4,
            placeId: null,
            provider: "photon",
          },
          listingStatusClass: "UNKNOWN",
          activeListing: null,
          confidence: "medium",
          resolution: {
            geocodeOk: true,
            mlsProbe: "failed",
            errors: ["mls_probe_timeout"],
            warnings: [],
          },
        };
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch;

      const routed = await routeFreeTextInventorySearch(
        "79 Grand Flats Trail, Kitchener",
        { transactionType: "SALE" },
      );
      assert.equal(routed.via, "nearby");
      assert.ok(routed.href.startsWith("/search?"));
      assert.ok(routed.href.includes("lat="));
      assert.equal(/property\//.test(routed.href), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("[submit] free-text civic + NL routing PASS");
}

function testEntryPointWiring() {
  const files = [
    "src/components/home/HomeHeroSearch.tsx",
    "src/components/site/SiteHeaderClient.tsx",
    "src/components/listings/SearchExperience.tsx",
    "src/components/mobile/ListingSheetChrome.tsx",
    "src/components/listings/AddressAutocomplete.tsx",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.ok(
      src.includes("routeFreeTextInventorySearch"),
      `${rel} must use unified router`,
    );
  }

  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("allowSelectResolve"));
  assert.ok(ac.includes("isOffMarketPropertySearchEnabled"));
  // Keystroke path must not call resolve API.
  const fetchPlacesIdx = ac.indexOf("async function fetchPlaces");
  const fetchListingsIdx = ac.indexOf("async function fetchListings");
  const sliceStart = Math.min(
    fetchPlacesIdx > 0 ? fetchPlacesIdx : ac.length,
    fetchListingsIdx > 0 ? fetchListingsIdx : ac.length,
  );
  const keystrokeRegion = ac.slice(sliceStart, sliceStart + 4000);
  assert.equal(
    keystrokeRegion.includes("fetchPropertyAddressResolve"),
    false,
  );
  assert.equal(keystrokeRegion.includes("routeFreeTextInventorySearch"), false);

  // Valuation fillOnly must not gain inventory resolve via onSearchSubmit alone
  // — HomeValuationForm stays fillOnly without inventory submit router.
  const valuation = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(valuation.includes("fillOnly"));
  assert.equal(valuation.includes("routeFreeTextInventorySearch"), false);

  const env = read(".env.example");
  assert.ok(env.includes('NEXT_PUBLIC_NL_SEARCH_PARSER_V2="0"'));
  assert.ok(
    env.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"'),
  );
  console.log("[wiring] entry points + no keystroke resolve PASS");
}

function testSavedSearchUrlCompat() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery(
      "2-bathroom detached homes in Cambridge",
      { transactionType: "SALE" },
    );
    const p = paramsOf(href);
    // Same field names saved-search / CommittedSearch already use.
    assert.equal(p.get("minBaths"), "2");
    assert.equal(p.get("propertyTypes"), "DETACHED");
    assert.equal(p.get("city"), "Cambridge");
    assert.equal(p.get("transactionType"), "SALE");
    assert.equal(p.has("status"), false);
  });
  console.log("[url] saved-search-compatible fields PASS");
}

function testPreparedStorageStillWorks() {
  const mem = new Map<string, string>();
  const storage = {
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    getItem: (k: string) => mem.get(k) ?? null,
  };
  rememberPreparedPropertyAddress(
    {
      path: "/property/test",
      formattedAddress: "1 Test St",
      streetNumber: "1",
      streetName: "Test St",
      unitNumber: null,
      city: "Toronto",
      province: "ON",
      postalCode: null,
      lat: 1,
      lng: 2,
      placeId: null,
      listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
      preparedAt: "2026-01-01T00:00:00.000Z",
    },
    storage,
  );
  assert.equal(mem.size, 1);
  console.log("[storage] prepared property PASS");
}

async function main() {
  testCivicGateIndependentOfNlFlag();
  testNlUrlFiltersByFlag();
  testNoInactiveLeakageFromFillerQ();
  testSelectTimeDecisionsUnchanged();
  await testFreeTextRouteWithMockFetch();
  testEntryPointWiring();
  testSavedSearchUrlCompat();
  testPreparedStorageStillWorks();
  console.log("unified-search-routing-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

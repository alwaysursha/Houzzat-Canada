/**
 * Final integrated QA — flag matrix + NL/off-market/chips/status (mocked).
 * Run: pnpm final-integrated-qa:selftest
 *
 * READ-ONLY verification helpers. No production writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNlSearchParserV2Enabled } from "../src/lib/listings/nl-search-parser-flag";
import { unspecifiedSearchStatus } from "../src/lib/listings/parse-search-query-params";
import {
  buildActiveChips,
  buildListingsQuery,
  buildSavedSearchQuery,
  parseSearchUrl,
  shouldPinActiveStatusForBuyerQuery,
} from "../src/lib/listings/search-state";
import {
  inventorySearchHrefFromQuery,
  shouldAttemptOffMarketFreeTextResolve,
} from "../src/lib/listings/unified-search-route";
import { isOffMarketPropertySearchEnabled } from "../src/lib/property-address/feature-flag";
import {
  classifyAddressListingStatus,
  decideSearchAddressNavigation,
  type ResolveAddressResult,
} from "../src/lib/property-address";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withFlags<T>(
  flags: { nl: boolean; offMarket: boolean },
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

function params(href: string) {
  return new URL(href, "http://localhost").searchParams;
}

type Expect = {
  transactionType?: string;
  city?: string;
  cities?: string[];
  minBeds?: string;
  maxPrice?: string;
  propertyTypes?: string | null;
  noQ?: boolean;
  chipIncludes?: string[];
};

function assertNlPhrase(phrase: string, expect: Expect) {
  const href = inventorySearchHrefFromQuery(phrase, {
    transactionType: "SALE",
  });
  const p = params(href);
  const committed = parseSearchUrl(href);
  const chips = buildActiveChips(committed).map((c) => c.label);
  const api = new URLSearchParams(buildListingsQuery(committed));

  if (expect.transactionType) {
    assert.equal(p.get("transactionType"), expect.transactionType);
  }
  if (expect.city) assert.equal(p.get("city"), expect.city);
  if (expect.cities) {
    const raw = p.get("cities") ?? "";
    for (const c of expect.cities) assert.ok(raw.includes(c), `${phrase} cities`);
  }
  if (expect.minBeds) assert.equal(p.get("minBeds"), expect.minBeds);
  if (expect.maxPrice) assert.equal(p.get("maxPrice"), expect.maxPrice);
  if (expect.propertyTypes === null) {
    assert.equal(p.get("propertyTypes"), null);
  } else if (expect.propertyTypes) {
    for (const t of expect.propertyTypes.split(",")) {
      assert.ok(
        (p.get("propertyTypes") ?? "").includes(t),
        `${phrase} types ${t}`,
      );
    }
  }
  if (expect.noQ) {
    assert.equal(p.get("q"), null);
    assert.equal(committed.q, "");
    assert.equal(api.get("q"), null);
    assert.equal(unspecifiedSearchStatus(api.get("q")), "ACTIVE");
    assert.equal(shouldPinActiveStatusForBuyerQuery(committed), false);
  }
  for (const label of expect.chipIncludes ?? []) {
    assert.ok(
      chips.some((c) => c.includes(label) || c === label),
      `${phrase} missing chip ${label}; got ${chips.join(" | ")}`,
    );
  }
  // Typesense/API criteria must carry the same structured fields.
  if (expect.city) assert.ok(api.get("cities") === expect.city || api.get("city") === expect.city || (api.get("cities") ?? "").includes(expect.city));
  if (expect.minBeds) assert.equal(api.get("minBeds"), expect.minBeds);
  if (expect.maxPrice) assert.equal(api.get("maxPrice"), expect.maxPrice);
  if (expect.transactionType) {
    assert.equal(api.get("transactionType"), expect.transactionType);
  }
}

function testFlagDefaultsOff() {
  delete process.env.NEXT_PUBLIC_NL_SEARCH_PARSER_V2;
  delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  assert.equal(isNlSearchParserV2Enabled(), false);
  assert.equal(isOffMarketPropertySearchEnabled(), false);

  const env = read(".env.example");
  assert.ok(env.includes('NEXT_PUBLIC_NL_SEARCH_PARSER_V2="0"'));
  assert.ok(env.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"'));
  console.log("[release] flags default OFF PASS");
}

function testFlagMatrixIndependence() {
  withFlags({ nl: false, offMarket: false }, () => {
    assert.equal(isNlSearchParserV2Enabled(), false);
    assert.equal(isOffMarketPropertySearchEnabled(), false);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("79 Grand Flats Trail Kitchener"),
      false,
    );
    const p = params(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.equal(p.get("propertyTypes"), "DETACHED");
  });

  withFlags({ nl: true, offMarket: false }, () => {
    assert.equal(isNlSearchParserV2Enabled(), true);
    assert.equal(isOffMarketPropertySearchEnabled(), false);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("79 Grand Flats Trail Kitchener"),
      false,
    );
    const p = params(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.equal(p.get("propertyTypes"), null);
  });

  withFlags({ nl: false, offMarket: true }, () => {
    assert.equal(isNlSearchParserV2Enabled(), false);
    assert.equal(isOffMarketPropertySearchEnabled(), true);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("79 Grand Flats Trail Kitchener"),
      true,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("Rentals in Mississauga"),
      false,
    );
    const p = params(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.equal(p.get("propertyTypes"), "DETACHED");
  });

  withFlags({ nl: true, offMarket: true }, () => {
    assert.equal(isNlSearchParserV2Enabled(), true);
    assert.equal(isOffMarketPropertySearchEnabled(), true);
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("79 Grand Flats Trail Kitchener"),
      true,
    );
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("3-bedroom apartments in Toronto"),
      false,
    );
    const p = params(
      inventorySearchHrefFromQuery("Homes in Oakville", {
        transactionType: "SALE",
      }),
    );
    assert.equal(p.get("propertyTypes"), null);
  });
  console.log("[matrix] 4 flag combinations PASS");
}

function testMajorNlExamples() {
  withFlags({ nl: true, offMarket: false }, () => {
    assertNlPhrase("Rentals in Mississauga", {
      transactionType: "LEASE",
      city: "Mississauga",
      propertyTypes: null,
      noQ: true,
      chipIncludes: ["For Lease", "Mississauga"],
    });
    assertNlPhrase("3-bedroom apartments in Toronto", {
      transactionType: "SALE",
      city: "Toronto",
      minBeds: "3",
      propertyTypes: "CONDO_APT",
      noQ: true,
      chipIncludes: ["Toronto", "3+ Beds", "Condo"],
    });
    assertNlPhrase("Detached homes under $1M in Brampton", {
      city: "Brampton",
      maxPrice: "1000000",
      propertyTypes: "DETACHED",
      noQ: true,
      chipIncludes: ["Brampton", "Detached"],
    });
    assertNlPhrase("Townhouses in Markham", {
      city: "Markham",
      propertyTypes: "TOWNHOUSE,CONDO_TOWNHOUSE",
      noQ: true,
      chipIncludes: ["Markham", "Townhouse"],
    });
    assertNlPhrase("4-bedroom homes in Mississauga or Oakville", {
      cities: ["Mississauga", "Oakville"],
      minBeds: "4",
      propertyTypes: null,
      noQ: true,
      chipIncludes: ["Mississauga", "Oakville", "4+ Beds"],
    });
    assertNlPhrase("Condos for rent under $2,500 in Kitchener", {
      transactionType: "LEASE",
      city: "Kitchener",
      maxPrice: "2500",
      propertyTypes: "CONDO_APT",
      noQ: true,
      chipIncludes: ["For Lease", "Kitchener", "Condo"],
    });

    // Saved search structured (no raw phrase).
    const href = inventorySearchHrefFromQuery(
      "4-bedroom homes in Mississauga or Oakville",
      { transactionType: "SALE" },
    );
    const saved = buildSavedSearchQuery(parseSearchUrl(href));
    assert.ok(Array.isArray(saved.cities) || saved.city);
    assert.equal(saved.minBeds, "4");
    assert.equal(saved.q, undefined);
  });
  console.log("[nl] major examples + chips + API criteria PASS");
}

function testOffMarketDecisions() {
  const baseAddress = {
    formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
    streetNumber: "79",
    streetName: "Grand Flats Trail",
    unitNumber: "12" as string | null,
    city: "Kitchener",
    province: "ON",
    postalCode: "N2A 0J5",
    lat: 43.45,
    lng: -80.45,
    placeId: "p1",
    provider: "photon" as const,
  };

  assert.equal(
    classifyAddressListingStatus({
      kind: "active",
      path: "/listing/x/X1",
      mlsNumber: "X1",
    }),
    "ACTIVE_LISTING",
  );
  assert.equal(
    classifyAddressListingStatus({ kind: "none" }),
    "NO_ACTIVE_LISTING_FOUND",
  );
  assert.equal(
    classifyAddressListingStatus({ kind: "failed", reason: "timeout" }),
    "UNKNOWN",
  );
  assert.equal(
    classifyAddressListingStatus({ kind: "skipped", reason: "no_coords" }),
    "UNKNOWN",
  );

  const active: ResolveAddressResult = {
    ok: true,
    address: { ...baseAddress, unitNumber: null },
    listingStatusClass: "ACTIVE_LISTING",
    activeListing: {
      mlsNumber: "X1",
      path: "/listing/79-grand-flats-trail-kitchener/X1",
    },
    confidence: "high",
    resolution: { geocodeOk: true, mlsProbe: "active", errors: [], warnings: [] },
  };
  assert.equal(decideSearchAddressNavigation(active).kind, "listing");

  const none: ResolveAddressResult = {
    ...active,
    listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
    activeListing: null,
    address: { ...baseAddress, unitNumber: "1205" },
    resolution: { geocodeOk: true, mlsProbe: "none", errors: [], warnings: [] },
  };
  const prep = decideSearchAddressNavigation(none);
  assert.equal(prep.kind, "property_prepared");
  if (prep.kind === "property_prepared") {
    assert.ok(prep.prepared.path.startsWith("/property/"));
    assert.ok(prep.prepared.path.includes("unit=1205") || prep.prepared.unitNumber === "1205");
  }

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
    error: "unresolvable",
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
  console.log("[off-market] classify + navigate PASS");
}

function testSecuritySourceGuards() {
  // VOW / sold valuation disclosure must stay capability-gated on the API.
  const valuationRoute = read("src/app/api/valuation/route.ts");
  assert.ok(valuationRoute.includes("canSeeSoldValuation"));
  assert.ok(valuationRoute.includes("mayDiscloseSoldEstimate"));
  assert.ok(valuationRoute.includes("hasClientAccess"));
  assert.ok(valuationRoute.includes("resolveListingEntitlementContextForRequest"));

  const estimate = read("src/lib/market/home-value-estimate.ts");
  assert.ok(
    estimate.includes("INSUFFICIENT_DATA") ||
      estimate.includes("insufficient"),
  );

  // Property page must not auto-run valuation on visit.
  const profile = read("src/components/property/PropertyProfileView.tsx");
  assert.ok(profile.includes("PropertyHomeValuationCta"));
  assert.equal(profile.includes('fetch("/api/valuation"'), false);
  assert.equal(profile.includes("estimateHomeValue"), false);

  // Resolve is select/submit only — not keystroke.
  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("isOffMarketPropertySearchEnabled"));
  assert.ok(ac.includes("fetchPropertyAddressResolve"));
  // Debounced suggestion fetches must not call the resolve API.
  const listingsFetch = ac.includes("/api/listings/autocomplete");
  assert.ok(listingsFetch);
  const fetchPlacesIdx = ac.indexOf("const fetchPlaces");
  const chooseIdx = ac.indexOf("async function choose");
  assert.ok(chooseIdx > 0);
  if (fetchPlacesIdx > 0 && fetchPlacesIdx < chooseIdx) {
    const suggestBlock = ac.slice(fetchPlacesIdx, chooseIdx);
    assert.equal(suggestBlock.includes("fetchPropertyAddressResolve"), false);
    assert.equal(suggestBlock.includes("/api/property-address/resolve"), false);
  }
  // choose() is the select-time resolve site.
  const chooseBlock = ac.slice(chooseIdx, chooseIdx + 2500);
  assert.ok(chooseBlock.includes("fetchPropertyAddressResolve"));

  const resolve = read("src/lib/property-address/resolve-address.ts");
  assert.ok(resolve.includes("classifyAddressListingStatus"));

  console.log("[security] source guards PASS");
}

function testStreetOnlyStatusDocumented() {
  withFlags({ nl: true, offMarket: false }, () => {
    const href = inventorySearchHrefFromQuery("eden oak trail Mississauga", {
      transactionType: "SALE",
    });
    const committed = parseSearchUrl(href);
    assert.ok(committed.q);
    assert.equal(committed.cities[0], "Mississauga");
    // Intentional historical: no buyer pin → API unspecified uses ALL.
    assert.equal(shouldPinActiveStatusForBuyerQuery(committed), false);
    assert.equal(unspecifiedSearchStatus(committed.q), "ALL");
  });
  console.log("[status] street-only q→ALL documented PASS");
}

function main() {
  testFlagDefaultsOff();
  testFlagMatrixIndependence();
  testMajorNlExamples();
  testOffMarketDecisions();
  testSecuritySourceGuards();
  testStreetOnlyStatusDocumented();
  console.log("final-integrated-qa-selftest: OK");
}

main();

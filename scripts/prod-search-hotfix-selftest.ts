/**
 * Hotfix regressions: NL filter merge, Crt→Court civic gate, insights no-store.
 * Run: pnpm prod-search-hotfix:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeParsedSearchIntoCommitted } from "../src/lib/listings/merge-parsed-search";
import { parseSearchQueryV2 } from "../src/lib/listings/parse-search-query";
import {
  canonicalizeStreetSuffixesInQuery,
  parseExactAddressQuery,
} from "../src/lib/listings/search-match";
import { defaultCommittedSearch } from "../src/lib/listings/search-state";
import { serializeSearchUrl } from "../src/lib/listings/search-state/serialize";
import { shouldAttemptOffMarketFreeTextResolve } from "../src/lib/listings/unified-search-route";
import { resolvePropertyAddress } from "../src/lib/property-address";
import type { ResolveAddressDeps } from "../src/lib/property-address";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withOffMarket<T>(enabled: boolean, fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = enabled
    ? "1"
    : "0";
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = prev;
    }
  }
}

function testNlFilterMergeKeepsCity() {
  const prev = {
    ...defaultCommittedSearch(),
    cities: ["Mississauga"],
    transactionType: "SALE" as const,
  };
  const parsed = parseSearchQueryV2("3 bedrooms");
  assert.equal(parsed.minBeds, 3);
  assert.equal(parsed.city, undefined);
  const merged = mergeParsedSearchIntoCommitted(prev, parsed);
  assert.deepEqual(merged.cities, ["Mississauga"]);
  assert.equal(merged.minBeds, "3");
  const href = serializeSearchUrl(merged);
  const params = new URL(href, "http://localhost").searchParams;
  assert.equal(params.get("city"), "Mississauga");
  assert.equal(params.get("minBeds"), "3");
  console.log("[merge] city + beds accumulate PASS");
}

function testNlFilterMergeExamples() {
  const cases: Array<{ phrase: string; city?: string; beds?: string; types?: string; txn?: string; max?: string }> = [
    {
      phrase: "Homes in Mississauga with 3 bedrooms",
      city: "Mississauga",
      beds: "3",
    },
    {
      phrase: "Detached homes under $1M in Brampton",
      city: "Brampton",
      types: "DETACHED",
      max: "1000000",
    },
    {
      phrase: "3 bedroom condos in Toronto",
      city: "Toronto",
      beds: "3",
      types: "CONDO_APT",
    },
    {
      phrase: "Rentals in Mississauga",
      city: "Mississauga",
      txn: "LEASE",
    },
  ];

  for (const c of cases) {
    const prev = {
      ...defaultCommittedSearch(),
      cities: ["Oakville"],
      minBeds: "2",
      transactionType: "SALE" as const,
    };
    const merged = mergeParsedSearchIntoCommitted(
      prev,
      parseSearchQueryV2(c.phrase),
    );
    const params = new URL(
      serializeSearchUrl(merged),
      "http://localhost",
    ).searchParams;
    if (c.city) assert.equal(params.get("city"), c.city, c.phrase);
    if (c.beds) assert.equal(params.get("minBeds"), c.beds, c.phrase);
    if (c.types) assert.equal(params.get("propertyTypes"), c.types, c.phrase);
    if (c.txn) assert.equal(params.get("transactionType"), c.txn, c.phrase);
    if (c.max) assert.equal(params.get("maxPrice"), c.max, c.phrase);
    // Unrelated beds from prev survive only when phrase omits beds.
    if (!c.beds) assert.equal(merged.minBeds, "2", `keep beds: ${c.phrase}`);
  }
  console.log("[merge] example phrases PASS");
}

function testCrtCivicGate() {
  const parsed = parseExactAddressQuery("5309 Roebuck Crt Mississauga");
  assert.ok(parsed);
  assert.equal(parsed!.streetNumber, "5309");
  assert.equal(parsed!.streetName, "Roebuck");
  assert.equal(parsed!.streetType?.toLowerCase(), "crt");
  assert.equal(parsed!.city, "Mississauga");

  assert.equal(
    canonicalizeStreetSuffixesInQuery("5309 Roebuck Crt Mississauga"),
    "5309 Roebuck Court Mississauga",
  );

  withOffMarket(true, () => {
    assert.equal(
      shouldAttemptOffMarketFreeTextResolve("5309 Roebuck Crt Mississauga"),
      true,
    );
  });
  console.log("[civic] Roebuck Crt gate + canonicalize PASS");
}

async function testGoogleFallbackConfirmsCrtAddress() {
  const stubEntitlement = {
    workspaceId: "ws-test",
  } as unknown as WorkspaceListingEntitlement;

  let photonQuery = "";
  const deps: ResolveAddressDeps = {
    googlePlacesEnabled: () => true,
    propTxConfigured: () => true,
    resolveGoogleAutocomplete: async () => [
      { placeId: "places/roebuck-crt" },
    ],
    resolveGooglePlace: async () => ({
      label: "5309 Roebuck Court",
      city: "Mississauga",
      province: "ON",
      postalCode: "L5R 2J6",
      lat: 43.6,
      lng: -79.65,
      placeId: "places/roebuck-crt",
      provider: "google",
      houseNumber: "5309",
    }),
    resolvePhotonPlaces: async (q) => {
      photonQuery = q;
      return [
        {
          label: "Roebuck Court",
          city: "Mississauga",
          lat: 43.6,
          lng: -79.65,
          placeId: null,
          provider: "photon",
          houseNumber: null,
        },
      ];
    },
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
  };

  const result = await resolvePropertyAddress(
    { query: "5309 Roebuck Crt Mississauga" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(photonQuery, "5309 Roebuck Court Mississauga");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.address.streetNumber, "5309");
  assert.equal(result.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
  console.log("[resolve] Google civic fallback for Crt PASS");
}

function testSourceWiring() {
  const experience = read("src/components/listings/SearchExperience.tsx");
  assert.ok(experience.includes("portalDesktopSuggestions"));
  assert.ok(experience.includes("mergeParsedSearchIntoCommitted"));
  assert.ok(experience.includes("relative z-40"));

  const insightsRoute = read(
    "src/app/api/listings/[mlsNumber]/insights/route.ts",
  );
  assert.ok(insightsRoute.includes('Cache-Control": "private, no-store"'));
  assert.ok(insightsRoute.includes("session?.user?.id"));

  const deferred = read(
    "src/components/listings/insights/ListingInsightsDeferred.tsx",
  );
  assert.ok(deferred.includes('cache: "no-store"'));
  assert.ok(deferred.includes("canSeeRestricted"));

  const listingPage = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  assert.ok(listingPage.includes("session?.user?.id"));
  assert.equal(
    /session\?\.user\?\.email\s*\n\s*\? await prisma\.user/.test(listingPage),
    false,
  );
  console.log("[source] hotfix wiring PASS");
}

async function main() {
  testSourceWiring();
  testNlFilterMergeKeepsCity();
  testNlFilterMergeExamples();
  testCrtCivicGate();
  await testGoogleFallbackConfirmsCrtAddress();
  console.log("prod-search-hotfix-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

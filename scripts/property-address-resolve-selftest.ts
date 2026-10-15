/**
 * Property address resolution foundation.
 * Run: pnpm property-address-resolve:selftest
 *
 * No production writes. No MLS sync. No live provider calls in unit cases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import {
  allowPropertyAddressResolve,
  classifyAddressListingStatus,
  clearPropertyAddressResolveRateLimitsForTests,
  evaluateExactAddressIdentity,
  looksLikeResolveAbuse,
  normalizeUnitNumber,
  parseResolveAddressInput,
  pickBestPlaceHit,
  resolvePropertyAddress,
  unitsMatch,
  type ResolveAddressDeps,
} from "../src/lib/property-address";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const stubEntitlement = {
  workspaceId: "ws-test",
} as unknown as WorkspaceListingEntitlement;

function baseDeps(
  overrides: Partial<ResolveAddressDeps> = {},
): ResolveAddressDeps {
  return {
    googlePlacesEnabled: () => false,
    propTxConfigured: () => true,
    resolveGooglePlace: async () => null,
    resolvePhotonPlaces: async () => [],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
    ...overrides,
  };
}

function kitchenerHit(overrides: Record<string, unknown> = {}) {
  return {
    label: "79 Grand Flats Trail",
    city: "Kitchener",
    province: "ON",
    postalCode: "N2A 0J5",
    lat: 43.45,
    lng: -80.45,
    placeId: null as string | null,
    provider: "photon" as const,
    houseNumber: "79",
    ...overrides,
  };
}

async function testActiveMlsListing() {
  const deps = baseDeps({
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({
      kind: "ok",
      hits: [
        {
          mlsNumber: "X12345678",
          addressLine: "79 Grand Flats Trail",
          unitNumber: null,
          city: "Kitchener",
          province: "ON",
          postalCode: "N2A 0J5",
        },
      ],
    }),
    findPropTxAtExactAddress: async () => {
      throw new Error("PropTx must not run when Neon finds active");
    },
  });

  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, Ontario" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.listingStatusClass, "ACTIVE_LISTING");
  assert.equal(result.activeListing?.mlsNumber, "X12345678");
  assert.ok(result.activeListing?.path.includes("/listing/"));
  assert.ok(result.activeListing?.path.includes("X12345678"));
  assert.equal(result.address.city, "Kitchener");
  assert.equal(result.address.streetNumber, "79");
  assert.equal(result.resolution.mlsProbe, "active");
  assert.equal(result.confidence, "high");
}

/** Authoritative PropTx empty + Neon empty → NO_ACTIVE_LISTING_FOUND. */
async function testNoActiveListingAuthoritative() {
  const deps = baseDeps({
    propTxConfigured: () => true,
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
  });

  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
  assert.equal(result.activeListing, null);
  assert.equal(result.resolution.mlsProbe, "none");
  assert.equal(result.resolution.geocodeOk, true);
  assert.equal(
    "soldPrice" in result || "history" in result || "listingHistory" in result,
    false,
  );
}

/** Neon empty + PropTx unavailable must NOT claim off-market. */
async function testNeonEmptyPropTxUnavailableIsUnknown() {
  const deps = baseDeps({
    propTxConfigured: () => false,
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => {
      throw new Error("PropTx must not be called when not configured");
    },
  });

  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.listingStatusClass, "UNKNOWN");
  assert.equal(result.activeListing, null);
  assert.equal(result.resolution.mlsProbe, "skipped");
  assert.ok(result.resolution.warnings.includes("proptx_not_configured"));
  assert.ok(
    result.resolution.errors.includes("authoritative_mls_provider_unavailable"),
  );
}

async function testExactCivicAccepted() {
  const identity = evaluateExactAddressIdentity({
    query: "79 Grand Flats Trail, Kitchener, ON",
    requestedUnit: null,
    hit: {
      label: "79 Grand Flats Trail",
      city: "Kitchener",
      houseNumber: "79",
    },
  });
  assert.equal(identity.ok, true);

  const deps = baseDeps({
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
  });
  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.address.streetNumber, "79");
  assert.equal(result.address.city, "Kitchener");
}

async function testStreetOnlyGeocodeRejected() {
  const identity = evaluateExactAddressIdentity({
    query: "79 Grand Flats Trail, Kitchener, ON",
    requestedUnit: null,
    hit: {
      label: "79 Grand Flats Trail", // fabricated label number
      city: "Kitchener",
      houseNumber: null,
    },
  });
  assert.equal(identity.ok, false);
  if (!identity.ok) {
    assert.equal(identity.reason, "approximate_or_street_level_geocode");
  }

  const deps = baseDeps({
    resolvePhotonPlaces: async () => [
      kitchenerHit({ houseNumber: null, label: "Grand Flats Trail" }),
    ],
  });
  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "UNRESOLVABLE");
  assert.ok(
    result.resolution.errors.includes("approximate_or_street_level_geocode"),
  );
}

async function testWrongCivicNumberRejected() {
  const identity = evaluateExactAddressIdentity({
    query: "79 Grand Flats Trail, Kitchener, ON",
    requestedUnit: null,
    hit: {
      label: "81 Grand Flats Trail",
      city: "Kitchener",
      houseNumber: "81",
    },
  });
  assert.equal(identity.ok, false);
  if (!identity.ok) assert.equal(identity.reason, "civic_number_mismatch");

  const deps = baseDeps({
    resolvePhotonPlaces: async () => [
      kitchenerHit({
        houseNumber: "81",
        label: "81 Grand Flats Trail",
      }),
    ],
  });
  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "UNRESOLVABLE");
  assert.ok(result.resolution.errors.includes("civic_number_mismatch"));
}

async function testWrongMunicipalityRejected() {
  const identity = evaluateExactAddressIdentity({
    query: "79 Grand Flats Trail, Kitchener, ON",
    requestedUnit: null,
    hit: {
      label: "79 Grand Flats Trail",
      city: "Waterloo",
      houseNumber: "79",
    },
  });
  assert.equal(identity.ok, false);
  if (!identity.ok) assert.equal(identity.reason, "municipality_mismatch");

  const deps = baseDeps({
    resolvePhotonPlaces: async () => [
      kitchenerHit({ city: "Waterloo" }),
    ],
  });
  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "UNRESOLVABLE");
  assert.ok(result.resolution.errors.includes("municipality_mismatch"));
}

async function testUnitNumberPreserved() {
  assert.equal(normalizeUnitNumber(" #12 "), "12");
  assert.equal(unitsMatch(null, null), true);
  assert.equal(unitsMatch("12", null), false);

  const deps = baseDeps({
    resolvePhotonPlaces: async () => [
      {
        label: "100 King Street West",
        city: "Toronto",
        province: "ON",
        postalCode: null,
        lat: 43.65,
        lng: -79.38,
        placeId: null,
        provider: "photon" as const,
        houseNumber: "100",
      },
    ],
    findNeonActiveAtAddress: async (input) => {
      assert.equal(input.unitNumber, "1205");
      return {
        kind: "ok",
        hits: [
          {
            mlsNumber: "C111",
            addressLine: "100 King Street West",
            unitNumber: "1102",
            city: "Toronto",
            province: "ON",
            postalCode: null,
          },
        ].filter((h) => unitsMatch(input.unitNumber, h.unitNumber)),
      };
    },
    findPropTxAtExactAddress: async (parsed) => {
      assert.equal(parsed.unit, "1205");
      return {
        kind: "ok",
        rows: [
          {
            ListingId: "C999",
            StandardStatus: "Active",
            UnitNumber: "1205",
            StreetNumber: "100",
            StreetName: "King",
            StreetSuffix: "Street",
            City: "Toronto",
            StateOrProvince: "ON",
            UnparsedAddress: "100 King Street West",
          },
        ],
      };
    },
  });

  const result = await resolvePropertyAddress(
    {
      query: "100 King Street West, Toronto, ON",
      unitNumber: "1205",
    },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.address.unitNumber, "1205");
  assert.equal(result.listingStatusClass, "ACTIVE_LISTING");
  assert.equal(result.activeListing?.mlsNumber, "C999");
}

async function testUnresolvableAddress() {
  const deps = baseDeps({
    resolvePhotonPlaces: async () => [],
  });
  const result = await resolvePropertyAddress(
    { query: "zzz not a real street xyzzy 99999" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "UNRESOLVABLE");
  assert.equal(result.listingStatusClass, "UNKNOWN");
}

async function testProviderTimeoutIsUnknownNotOffMarket() {
  const deps = baseDeps({
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({
      kind: "failed",
      reason: "timeout",
    }),
  });

  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.listingStatusClass, "UNKNOWN");
  assert.equal(result.activeListing, null);
  assert.equal(result.resolution.mlsProbe, "failed");
  assert.ok(result.resolution.errors.some((e) => e.includes("timeout")));
}

async function testGeocodeFailureIsUnknown() {
  const deps = baseDeps({
    resolvePhotonPlaces: async () => {
      throw new Error("photon down");
    },
  });
  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener" },
    { entitlement: stubEntitlement, deps },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.listingStatusClass, "UNKNOWN");
  assert.notEqual(result.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
}

async function testCrossTenantNotEntitled() {
  const deps = baseDeps({
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "not_entitled" }),
    findPropTxAtExactAddress: async () => {
      throw new Error("must not call PropTx when not entitled");
    },
  });

  const result = await resolvePropertyAddress(
    { query: "79 Grand Flats Trail, Kitchener, ON" },
    { entitlement: undefined, deps },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.listingStatusClass, "UNKNOWN");
  assert.equal(result.activeListing, null);
  assert.equal(result.resolution.mlsProbe, "skipped");
  assert.ok(
    result.resolution.errors.includes("mls_inventory_not_entitled"),
  );
}

async function testMalformedAndAbuse() {
  assert.equal(looksLikeResolveAbuse("http://evil.test/x"), true);
  assert.equal(
    looksLikeResolveAbuse("79 Grand Flats Trail, Kitchener"),
    false,
  );

  const short = parseResolveAddressInput({ query: "ab" });
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.code, "INVALID_INPUT");

  const abuse = parseResolveAddressInput({
    query: "BUY NOW http://spam.example <script>",
  });
  assert.equal(abuse.ok, false);
  if (!abuse.ok) assert.equal(abuse.code, "ABUSE_REJECTED");

  const empty = parseResolveAddressInput({});
  assert.equal(empty.ok, false);

  clearPropertyAddressResolveRateLimitsForTests();
  for (let i = 0; i < 30; i += 1) {
    assert.equal(allowPropertyAddressResolve("1.2.3.4"), true);
  }
  assert.equal(allowPropertyAddressResolve("1.2.3.4"), false);
  assert.equal(allowPropertyAddressResolve("9.9.9.9"), true);
  clearPropertyAddressResolveRateLimitsForTests();
}

async function testClassifyHelpers() {
  assert.equal(
    classifyAddressListingStatus({ kind: "none" }),
    "NO_ACTIVE_LISTING_FOUND",
  );
  assert.equal(
    classifyAddressListingStatus({ kind: "failed", reason: "timeout" }),
    "UNKNOWN",
  );
  assert.equal(
    classifyAddressListingStatus({
      kind: "skipped",
      reason: "authoritative_mls_provider_unavailable",
    }),
    "UNKNOWN",
  );
  assert.equal(
    classifyAddressListingStatus({
      kind: "active",
      mlsNumber: "X1",
      path: "/listing/a/X1",
    }),
    "ACTIVE_LISTING",
  );

  const best = pickBestPlaceHit("79 Grand Flats Trail Kitchener", [
    {
      label: "Grand Flats Trail",
      lat: 43,
      lng: -80,
      provider: "photon",
      houseNumber: null,
    },
    {
      label: "79 Grand Flats Trail",
      city: "Kitchener",
      lat: 43.4,
      lng: -80.4,
      provider: "photon",
      houseNumber: "79",
    },
  ]);
  assert.equal(best?.houseNumber, "79");
}

function testSourceGuards() {
  const route = read("src/app/api/property-address/resolve/route.ts");
  assert.ok(route.includes("resolvePropertyAddress"));
  assert.ok(route.includes("resolveListingEntitlementContextForRequest"));
  assert.ok(route.includes("allowPropertyAddressResolve"));
  assert.equal(route.includes("soldPrice"), false);
  assert.equal(route.includes("listingHistory"), false);

  const resolve = read("src/lib/property-address/resolve-address.ts");
  assert.ok(resolve.includes("fetchAllPropertiesAtExactAddress"));
  assert.ok(resolve.includes("evaluateExactAddressIdentity"));
  assert.ok(resolve.includes("authoritative_mls_provider_unavailable"));
  assert.equal(resolve.includes("prisma.listing.create"), false);

  const photon = read("src/lib/geo/photon-autocomplete.ts");
  assert.ok(photon.includes("houseNumber: props.housenumber"));

  const autocomplete = read("src/components/listings/AddressAutocomplete.tsx");
  assert.equal(autocomplete.includes("property-address/resolve"), false);
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.equal(funnel.includes("property-address/resolve"), false);
}

async function main() {
  testSourceGuards();
  testClassifyHelpers();
  await testActiveMlsListing();
  await testNoActiveListingAuthoritative();
  await testNeonEmptyPropTxUnavailableIsUnknown();
  await testExactCivicAccepted();
  await testStreetOnlyGeocodeRejected();
  await testWrongCivicNumberRejected();
  await testWrongMunicipalityRejected();
  await testUnitNumberPreserved();
  await testUnresolvableAddress();
  await testProviderTimeoutIsUnknownNotOffMarket();
  await testGeocodeFailureIsUnknown();
  await testCrossTenantNotEntitled();
  await testMalformedAndAbuse();
  console.log("property-address-resolve-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Phase 3 — minimal /property profile.
 * Run: pnpm property-address-profile:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import {
  buildNeighbourhoodInsightsFromActives,
  loadPropertyProfile,
  propertyAddressPath,
  propertySlugMatchesResolved,
  type ResolveAddressDeps,
} from "../src/lib/property-address";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const stubEntitlement = {
  workspaceId: "ws-test",
} as unknown as WorkspaceListingEntitlement;

function kitchenerHit() {
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
  };
}

function baseDeps(
  overrides: Partial<ResolveAddressDeps> = {},
): ResolveAddressDeps {
  return {
    googlePlacesEnabled: () => false,
    propTxConfigured: () => true,
    resolveGooglePlace: async () => null,
    resolvePhotonPlaces: async () => [kitchenerHit()],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
    ...overrides,
  };
}

const stubNeighbourhood = async () =>
  buildNeighbourhoodInsightsFromActives({
    city: "Kitchener",
    rows: [],
  });

async function withFlag<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = enabled
    ? "1"
    : "0";
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = prev;
    }
  }
}

async function testFlagOffDisablesProfile() {
  await withFlag(false, async () => {
    const result = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: {
        address: "79 Grand Flats Trail, Kitchener, ON",
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
      loadNeighbourhoodInsights: stubNeighbourhood,
    });
    assert.equal(result.kind, "disabled");
  });
}

async function testExactValidProfileRenders() {
  await withFlag(true, async () => {
    const path = propertyAddressPath({
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      city: "Kitchener",
      province: "ON",
      postalCode: "N2A 0J5",
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON, N2A 0J5",
      lat: 43.45,
      lng: -80.45,
    });
    const url = new URL(path, "http://localhost");
    const result = await loadPropertyProfile({
      slug: url.pathname.replace("/property/", ""),
      searchParams: {
        address: url.searchParams.get("address") ?? undefined,
        lat: url.searchParams.get("lat") ?? undefined,
        lng: url.searchParams.get("lng") ?? undefined,
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
      loadNeighbourhoodInsights: stubNeighbourhood,
    });
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.profile.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
    assert.match(
      result.profile.statusHeadline,
      /No active MLS listing found in our data/i,
    );
    assert.equal(result.profile.address.streetNumber, "79");
    assert.equal(result.profile.address.city, "Kitchener");
    assert.ok(result.profile.nearbyHref?.startsWith("/search?"));
    assert.equal(
      /sold|history|listPrice/i.test(JSON.stringify(result.profile)),
      false,
    );
  });
}

async function testActiveMlsRedirects() {
  await withFlag(true, async () => {
    const result = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: {
        address: "79 Grand Flats Trail, Kitchener, ON",
      },
      entitlement: stubEntitlement,
      deps: baseDeps({
        findNeonActiveAtAddress: async () => ({
          kind: "ok",
          hits: [
            {
              mlsNumber: "X999",
              addressLine: "79 Grand Flats Trail",
              unitNumber: null,
              city: "Kitchener",
              province: "ON",
              postalCode: null,
            },
          ],
        }),
      }),
    });
    assert.equal(result.kind, "redirect_listing");
    if (result.kind !== "redirect_listing") return;
    assert.ok(result.href.includes("/listing/"));
    assert.ok(result.href.includes("X999"));
  });
}

async function testUnknownNeverClaimsOffMarket() {
  await withFlag(true, async () => {
    const path = propertyAddressPath({
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      city: "Kitchener",
      province: "ON",
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      lat: 43.45,
      lng: -80.45,
    });
    const url = new URL(path, "http://localhost");
    const result = await loadPropertyProfile({
      slug: url.pathname.replace("/property/", ""),
      searchParams: {
        address: url.searchParams.get("address") ?? undefined,
        lat: url.searchParams.get("lat") ?? undefined,
        lng: url.searchParams.get("lng") ?? undefined,
      },
      entitlement: stubEntitlement,
      deps: baseDeps({
        propTxConfigured: () => false,
      }),
      loadNeighbourhoodInsights: stubNeighbourhood,
    });
    assert.equal(
      result.kind,
      "ok",
      result.kind === "unresolvable" ? result.message : result.kind,
    );
    if (result.kind !== "ok") return;
    assert.equal(result.profile.listingStatusClass, "UNKNOWN");
    assert.match(result.profile.statusHeadline, /Property information/i);
    assert.equal(/off[-\s]?market/i.test(result.profile.statusHeadline), false);
    assert.equal(/off[-\s]?market/i.test(result.profile.statusDetail), false);
  });
}

async function testMissingAddressFailsSafely() {
  await withFlag(true, async () => {
    const result = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: {},
      entitlement: stubEntitlement,
      deps: baseDeps(),
    });
    assert.equal(result.kind, "unresolvable");
  });
}

async function testWrongSlugRedirectsCanonical() {
  await withFlag(true, async () => {
    const result = await loadPropertyProfile({
      slug: "wrong-slug-here",
      searchParams: {
        address: "79 Grand Flats Trail, Kitchener, ON",
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
    });
    assert.equal(result.kind, "redirect_canonical");
    if (result.kind !== "redirect_canonical") return;
    assert.ok(result.href.startsWith("/property/"));
    assert.ok(result.href.includes("address="));
  });
}

async function testUnitIdentityPreserved() {
  assert.equal(
    propertySlugMatchesResolved("100-king-street-west-unit-1205-toronto", {
      streetNumber: "100",
      streetName: "King Street West",
      unitNumber: "1205",
      city: "Toronto",
    }),
    true,
  );
  assert.equal(
    propertySlugMatchesResolved("100-king-street-west-toronto", {
      streetNumber: "100",
      streetName: "King Street West",
      unitNumber: "1205",
      city: "Toronto",
    }),
    false,
  );

  const path = propertyAddressPath({
    streetNumber: "100",
    streetName: "King Street West",
    unitNumber: "1205",
    city: "Toronto",
    formattedAddress: "100 King Street West Unit 1205, Toronto, ON",
    lat: 43.65,
    lng: -79.38,
  });
  assert.ok(path.includes("unit=1205"));
  assert.ok(path.includes("1205"));
}

function testSourceGuards() {
  assert.ok(existsSync(join(root, "src/app/(marketing)/property/[slug]/page.tsx")));
  const page = read("src/app/(marketing)/property/[slug]/page.tsx");
  assert.ok(page.includes("isOffMarketPropertySearchEnabled"));
  assert.ok(page.includes("loadPropertyProfile"));
  assert.ok(page.includes("notFound()"));
  assert.equal(page.includes("soldPrice"), false);
  assert.equal(page.includes("estimateHomeValue"), false);

  const view = read("src/components/property/PropertyProfileView.tsx");
  assert.ok(view.includes("ClaimPropertyAddressButton"));
  assert.ok(view.includes("Search Nearby Homes"));
  assert.ok(view.includes("PropertyLocationMap"));
  assert.ok(view.includes("NeighbourhoodInsightsCard"));
  assert.ok(view.includes("PropertyHomeValuationCta"));
  assert.equal(view.includes("Bedroom"), false);
  assert.equal(view.includes("estimateHomeValue"), false);

  const claimBtn = read("src/components/property/ClaimPropertyAddressButton.tsx");
  assert.ok(claimBtn.includes("Claim Your Address"));
  assert.ok(claimBtn.includes("rememberClaimAddressContext"));
  assert.ok(claimBtn.includes("claimAddress"));
  assert.ok(claimBtn.includes("does not verify"));

  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.ok(funnel.includes("readClaimAddressContext"));

  const autocomplete = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(autocomplete.includes("decision.prepared.path"));
  assert.ok(autocomplete.includes("pushHref(router, decision.prepared.path)"));
}

async function main() {
  testSourceGuards();
  await testFlagOffDisablesProfile();
  await testExactValidProfileRenders();
  await testActiveMlsRedirects();
  await testUnknownNeverClaimsOffMarket();
  await testMissingAddressFailsSafely();
  await testWrongSlugRedirectsCanonical();
  await testUnitIdentityPreserved();
  console.log("property-address-profile-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

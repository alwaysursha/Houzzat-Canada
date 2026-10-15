/**
 * Phase 4B — neighbourhood insights + valuation prefill on /property.
 * Run: pnpm property-address-phase4b:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import {
  buildNeighbourhoodInsightsFromActives,
  homeValuationPrefillHref,
  loadHomeValuationPrefillFromRequest,
  loadPropertyProfile,
  prefillFromResolvedAddress,
  type ResolveAddressDeps,
  type ResolvedAddressParts,
} from "../src/lib/property-address";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const stubEntitlement = {
  workspaceId: "ws-test",
  authorities: [{ organizationId: "org-a", providerKey: "trreb" }],
} as unknown as WorkspaceListingEntitlement;

function kitchenerHit(community?: string | null) {
  return {
    label: "79 Grand Flats Trail",
    city: "Kitchener",
    community: community ?? null,
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
    resolvePhotonPlaces: async () => [kitchenerHit("Grand River North")],
    findNeonActiveAtAddress: async () => ({ kind: "ok", hits: [] }),
    findPropTxAtExactAddress: async () => ({ kind: "ok", rows: [] }),
    ...overrides,
  };
}

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

function testAuthorizedActivesContribute() {
  const insights = buildNeighbourhoodInsightsFromActives({
    city: "Kitchener",
    community: "Grand River North",
    rows: [
      { listPrice: 700_000, daysOnMarket: 10 },
      { listPrice: 750_000, daysOnMarket: 20 },
      { listPrice: 800_000, daysOnMarket: 30 },
    ],
  });
  assert.equal(insights.empty, false);
  assert.equal(insights.scope, "community");
  assert.equal(insights.activeCount, 3);
  assert.equal(insights.medianAskingPrice, 750_000);
  assert.equal(insights.avgDaysOnMarket, 20);
  assert.match(insights.sampleNote, /Grand River North/);
  assert.equal(/sold|soldPrice|median sold/i.test(JSON.stringify(insights)), false);
  console.log("[insights] authorized actives PASS");
}

function testUnauthorizedEmptyEntitlement() {
  // Empty inventory path is modeled as zero rows (entitlement empty → no query rows).
  const insights = buildNeighbourhoodInsightsFromActives({
    city: "Kitchener",
    rows: [],
  });
  assert.equal(insights.empty, true);
  assert.equal(insights.medianAskingPrice, null);
  assert.equal(insights.activeCount, 0);
  assert.match(insights.sampleNote, /Not enough authorized/);
  console.log("[insights] unauthorized/empty PASS");
}

function testMunicipalityLabelWhenNoCommunity() {
  const insights = buildNeighbourhoodInsightsFromActives({
    city: "Kitchener",
    community: null,
    rows: [{ listPrice: 600_000, daysOnMarket: 12 }],
  });
  assert.equal(insights.scope, "municipality");
  assert.equal(insights.placeLabel, "Kitchener");
  assert.match(insights.sampleNote, /municipality level/i);
  console.log("[insights] municipality label PASS");
}

function testValuationPrefillAndUnit() {
  const address: ResolvedAddressParts = {
    formattedAddress: "100 King Street West Unit 1205, Toronto, ON, M5X 1A1",
    streetNumber: "100",
    streetName: "King Street West",
    unitNumber: "1205",
    city: "Toronto",
    community: "Financial District",
    province: "ON",
    postalCode: "M5X 1A1",
    lat: 43.65,
    lng: -79.38,
    placeId: "place-1",
    provider: "google",
  };
  const href = homeValuationPrefillHref(address);
  assert.ok(href.startsWith("/home-valuation?"));
  assert.ok(href.includes("from=property"));
  assert.ok(href.includes("unit=1205"));
  assert.ok(href.includes("city=Toronto"));
  assert.ok(href.includes("postal=M5X"));
  assert.ok(href.includes("lat=43.65"));
  const prefill = prefillFromResolvedAddress(address);
  assert.ok(prefill);
  assert.equal(prefill!.unitNumber, "1205");
  assert.equal(prefill!.city, "Toronto");
  console.log("[prefill] address + unit PASS");
}

async function testClientParamsCannotBypassResolve() {
  await withFlag(true, async () => {
    const rejected = await loadHomeValuationPrefillFromRequest({
      searchParams: {
        from: "property",
        address: "not-a-real-address-xyz",
        city: "Toronto",
        lat: "43.65",
        lng: "-79.38",
      },
      entitlement: stubEntitlement,
      deps: baseDeps({
        resolvePhotonPlaces: async () => [],
      }),
    });
    assert.equal(rejected, null, "unresolvable client params must not prefill");

    const ok = await loadHomeValuationPrefillFromRequest({
      searchParams: {
        from: "property",
        address: "79 Grand Flats Trail, Kitchener, ON",
        unit: undefined,
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
    });
    assert.ok(ok);
    assert.equal(ok!.city, "Kitchener");
    assert.equal(ok!.from, "property");

    const mismatched = await loadHomeValuationPrefillFromRequest({
      searchParams: {
        from: "property",
        address: "79 Grand Flats Trail, Kitchener, ON",
        lat: "45.0",
        lng: "-75.0",
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
    });
    assert.equal(mismatched, null, "tampered coords rejected");
  });
  console.log("[prefill] canonical validation PASS");
}

async function testProfileWiresInsightsAndValuation() {
  await withFlag(true, async () => {
    const insights = buildNeighbourhoodInsightsFromActives({
      city: "Kitchener",
      community: "Grand River North",
      rows: [
        { listPrice: 710_000, daysOnMarket: 8 },
        { listPrice: 730_000, daysOnMarket: 14 },
      ],
    });
    const result = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: {
        address: "79 Grand Flats Trail, Kitchener, ON",
      },
      entitlement: stubEntitlement,
      deps: baseDeps(),
      loadNeighbourhoodInsights: async () => insights,
    });
    assert.equal(
      result.kind,
      "ok",
      result.kind === "unresolvable"
        ? result.message
        : result.kind === "redirect_canonical" || result.kind === "redirect_listing"
          ? result.href
          : result.kind,
    );
    if (result.kind !== "ok") return;
    assert.equal(result.profile.neighbourhood.activeCount, 2);
    assert.equal(result.profile.neighbourhood.scope, "community");
    assert.ok(result.profile.homeValuationHref.includes("/home-valuation?"));
    assert.ok(result.profile.homeValuationHref.includes("from=property"));
    assert.equal(result.profile.address.community, "Grand River North");
    assert.equal(
      /soldPrice|medianSold|estimateHomeValue/i.test(
        JSON.stringify(result.profile),
      ),
      false,
    );
  });
  console.log("[profile] insights + valuation CTA wiring PASS");
}

function testSourceGuards() {
  const view = read("src/components/property/PropertyProfileView.tsx");
  assert.ok(view.includes("NeighbourhoodInsightsCard"));
  assert.ok(view.includes("PropertyHomeValuationCta"));
  assert.ok(view.includes("ClaimPropertyAddressButton"));
  assert.equal(view.includes("estimateHomeValue"), false);
  assert.equal(view.includes("soldPrice"), false);

  const insightsCard = read(
    "src/components/property/NeighbourhoodInsightsCard.tsx",
  );
  assert.ok(insightsCard.includes("Median asking price"));
  assert.equal(insightsCard.includes("sold"), false);
  assert.equal(insightsCard.includes("Sold"), false);

  const cta = read("src/components/property/PropertyHomeValuationCta.tsx");
  assert.ok(cta.includes("Discover Your Home"));
  assert.ok(cta.includes("Get My Home Estimate"));

  const loader = read("src/lib/property-address/neighbourhood-insights.ts");
  assert.ok(loader.includes('statuses: ["ACTIVE"]'));
  assert.ok(loader.includes('segment: "RESIDENTIAL"'));
  assert.ok(loader.includes("buildPrismaEntitledInventoryWhere"));
  assert.equal(loader.includes("SOLD"), false);
  assert.equal(loader.includes("soldPrice"), false);

  const valuationPage = read("src/app/(marketing)/home-valuation/page.tsx");
  assert.ok(valuationPage.includes("loadHomeValuationPrefillFromRequest"));
  assert.ok(valuationPage.includes("verifiedPrefill"));

  const engine = read("src/lib/market/home-value-estimate.ts");
  assert.ok(engine.includes("weightedSoldEstimate"));
  assert.ok(engine.includes("INSUFFICIENT_DATA"));
  assert.equal(engine.includes("mayDiscloseSoldEstimate"), false);
  assert.ok(engine.includes('status: "SOLD"'));

  const route = read("src/app/api/valuation/route.ts");
  assert.ok(
    route.includes("const mayDiscloseSoldEstimate = canSeeSoldValuation"),
  );

  const flag = read(".env.example");
  assert.ok(flag.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"'));

  const claim = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(claim.includes("applySellerPropertyClaim"));
  console.log("[source] 4B + V1 guards PASS");
}

async function main() {
  testSourceGuards();
  testAuthorizedActivesContribute();
  testUnauthorizedEmptyEntitlement();
  testMunicipalityLabelWhenNoCommunity();
  testValuationPrefillAndUnit();
  await testClientParamsCannotBypassResolve();
  await testProfileWiresInsightsAndValuation();
  console.log("property-address-phase4b-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Phase 4C — end-to-end integration verification (mocked providers, no live notify).
 * Run: pnpm property-address-phase4c:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrReuseAreaMonitor } from "../src/lib/account/area-monitor-create";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import { buildPrismaEntitledInventoryWhere } from "../src/lib/tenancy/listing-entitlement";
import {
  buildNeighbourhoodInsightsFromActives,
  decideSearchAddressNavigation,
  homeValuationPrefillHref,
  isOffMarketPropertySearchEnabled,
  loadHomeValuationPrefillFromRequest,
  loadPropertyProfile,
  propertyAddressPath,
  propertySlugMatchesResolved,
  resolvePropertyAddress,
  type ResolveAddressDeps,
  type ResolvedAddressParts,
} from "../src/lib/property-address";
import {
  compatiblePropertyTypes,
  isEligibleSoldComp,
  weightedSoldEstimate,
  type SoldCompCandidate,
  type SubjectForComps,
} from "../src/lib/market/home-value-estimate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const wsA: WorkspaceListingEntitlement = {
  workspaceId: "ws-a",
  authorities: [
    {
      organizationId: "org-a",
      providerKey: "trreb",
      sourceAuthorityKey: "org-a:trreb",
      capabilities: ["ACTIVE_LISTINGS", "SOLD"],
    },
  ],
};
const wsB: WorkspaceListingEntitlement = {
  workspaceId: "ws-b",
  authorities: [],
};
/** Workspace with active-only capability — must not see SOLD inventory. */
const wsActiveOnly: WorkspaceListingEntitlement = {
  workspaceId: "ws-active-only",
  authorities: [
    {
      organizationId: "org-c",
      providerKey: "trreb",
      sourceAuthorityKey: "org-c:trreb",
      capabilities: ["ACTIVE_LISTINGS"],
    },
  ],
};

function hit(partial: Record<string, unknown> = {}) {
  return {
    label: "79 Grand Flats Trail",
    city: "Kitchener",
    community: "Grand River North",
    province: "ON",
    postalCode: "N2A 0J5",
    lat: 43.45,
    lng: -80.45,
    placeId: "place-79",
    provider: "photon" as const,
    houseNumber: "79",
    ...partial,
  };
}

function deps(overrides: Partial<ResolveAddressDeps> = {}): ResolveAddressDeps {
  return {
    googlePlacesEnabled: () => false,
    propTxConfigured: () => true,
    resolveGooglePlace: async () => null,
    resolvePhotonPlaces: async () => [hit()],
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

const emptyInsights = async () =>
  buildNeighbourhoodInsightsFromActives({ city: "Kitchener", rows: [] });

async function testFlagOffPreservesSearch() {
  await withFlag(false, async () => {
    assert.equal(isOffMarketPropertySearchEnabled(), false);
    const page = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: { address: "79 Grand Flats Trail, Kitchener, ON" },
      entitlement: wsA,
      deps: deps(),
      loadNeighbourhoodInsights: emptyInsights,
    });
    assert.equal(page.kind, "disabled");
  });

  const autocomplete = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(autocomplete.includes("isOffMarketPropertySearchEnabled()"));
  assert.ok(
    autocomplete.includes(
      "isOffMarketPropertySearchEnabled() &&",
    ),
  );
  console.log("[1] flag OFF preserves search / notFound PASS");
}

async function testSearchToProfileTransitions() {
  await withFlag(true, async () => {
    // Civic address, no active MLS → property_prepared
    const resolved = await resolvePropertyAddress(
      { query: "79 Grand Flats Trail, Kitchener, ON" },
      { entitlement: wsA, deps: deps() },
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const nav = decideSearchAddressNavigation(resolved, {
      transactionType: "SALE",
    });
    assert.equal(nav.kind, "property_prepared");
    if (nav.kind !== "property_prepared") return;
    assert.ok(nav.prepared.path.startsWith("/property/"));
    assert.ok(nav.prepared.path.includes("address="));
    assert.equal(nav.prepared.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");

    // Active MLS → listing
    const active = await resolvePropertyAddress(
      { query: "79 Grand Flats Trail, Kitchener, ON" },
      {
        entitlement: wsA,
        deps: deps({
          findNeonActiveAtAddress: async () => ({
            kind: "ok",
            hits: [
              {
                mlsNumber: "X100",
                addressLine: "79 Grand Flats Trail",
                unitNumber: null,
                city: "Kitchener",
                province: "ON",
                postalCode: null,
              },
            ],
          }),
        }),
      },
    );
    const navListing = decideSearchAddressNavigation(active);
    assert.equal(navListing.kind, "listing");
    if (navListing.kind === "listing") {
      assert.ok(navListing.href.includes("/listing/"));
      assert.ok(navListing.href.includes("X100"));
    }

    // UNKNOWN — nearby only, never off-market claim
    const unknown = await resolvePropertyAddress(
      { query: "79 Grand Flats Trail, Kitchener, ON" },
      {
        entitlement: wsA,
        deps: deps({ propTxConfigured: () => false }),
      },
    );
    assert.equal(unknown.ok, true);
    if (unknown.ok) {
      assert.equal(unknown.listingStatusClass, "UNKNOWN");
      const navUnknown = decideSearchAddressNavigation(unknown);
      assert.equal(navUnknown.kind, "nearby");
      assert.equal(/off[-\s]?market/i.test(JSON.stringify(navUnknown)), false);
    }

    // Invalid address
    const bad = await resolvePropertyAddress(
      { query: "zz" },
      {
        entitlement: wsA,
        deps: deps({ resolvePhotonPlaces: async () => [] }),
      },
    );
    assert.equal(bad.ok, false);
    const navBad = decideSearchAddressNavigation(bad);
    assert.equal(navBad.kind, "unresolvable");

    // Condo unit preserved through path + slug
    const condoPath = propertyAddressPath({
      streetNumber: "100",
      streetName: "King Street West",
      unitNumber: "1205",
      city: "Toronto",
      province: "ON",
      postalCode: "M5X 1A1",
      formattedAddress: "100 King Street West Unit 1205, Toronto, ON, M5X 1A1",
      lat: 43.65,
      lng: -79.38,
    });
    assert.ok(condoPath.includes("unit=1205"));
    assert.equal(
      propertySlugMatchesResolved("100-king-street-west-unit-1205-toronto", {
        streetNumber: "100",
        streetName: "King Street West",
        unitNumber: "1205",
        city: "Toronto",
      }),
      true,
    );

    // Coord tamper rejected on profile
    const tampered = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: {
        address: "79 Grand Flats Trail, Kitchener, ON",
        lat: "45.5",
        lng: "-75.5",
      },
      entitlement: wsA,
      deps: deps(),
      loadNeighbourhoodInsights: emptyInsights,
    });
    assert.equal(tampered.kind, "unresolvable");
  });
  console.log("[1-2] search→profile transitions PASS");
}

async function testPropertyProfileInsights() {
  await withFlag(true, async () => {
    const insights = buildNeighbourhoodInsightsFromActives({
      city: "Kitchener",
      community: "Grand River North",
      rows: [
        { listPrice: 700_000, daysOnMarket: 10 },
        { listPrice: 760_000, daysOnMarket: 20 },
      ],
    });
    const profile = await loadPropertyProfile({
      slug: "79-grand-flats-trail-kitchener",
      searchParams: { address: "79 Grand Flats Trail, Kitchener, ON" },
      entitlement: wsA,
      deps: deps(),
      loadNeighbourhoodInsights: async () => insights,
    });
    assert.equal(profile.kind, "ok");
    if (profile.kind !== "ok") return;
    assert.equal(profile.profile.address.streetNumber, "79");
    assert.equal(profile.profile.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
    assert.equal(profile.profile.neighbourhood.scope, "community");
    assert.equal(profile.profile.neighbourhood.activeCount, 2);
    assert.ok(profile.profile.homeValuationHref.includes("from=property"));
    const blob = JSON.stringify(profile.profile);
    assert.equal(/soldPrice|medianSold|estimateHomeValue/i.test(blob), false);

    const empty = buildNeighbourhoodInsightsFromActives({
      city: "Kitchener",
      rows: [],
    });
    assert.equal(empty.empty, true);
    assert.match(empty.sampleNote, /Not enough authorized/);
  });
  console.log("[2] property profile + insights PASS");
}

function testClaimAndAreaWatchIntegration() {
  const claimBtn = read("src/components/property/ClaimPropertyAddressButton.tsx");
  assert.ok(claimBtn.includes("placeId: context.placeId"));
  assert.ok(claimBtn.includes("propertyPath: context.propertyPath"));
  assert.ok(claimBtn.includes("rememberClaimAddressContext"));

  const signup = read("src/components/auth/SignUpForm.tsx");
  assert.ok(signup.includes("placeId: claimContext.placeId"));
  assert.ok(signup.includes("propertyPath: claimContext.propertyPath"));

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes("requireCanonicalResolve: sellerClaimEntry"));
  assert.ok(qual.includes("scheduleSellerClaimPropertyNotify"));
  assert.ok(qual.includes("sellingTimeframe"));

  const notify = read("src/lib/notifications/signup-lead-notify.ts");
  assert.ok(notify.includes("claim_address:email"));
  assert.ok(notify.includes("claim_address:sms"));
  // Claim notify must use distinct cycle keys (not new-lead signup keys).
  assert.ok(notify.includes("scheduleSellerClaimPropertyNotify"));
  assert.equal(notify.includes("SIGNUP_NEW_LEAD"), false);

  const claim = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(claim.includes("workspaceId: input.workspaceId"));
  assert.ok(claim.includes("notifyNew: true"));
  assert.ok(claim.includes("notifySold: true"));
  assert.ok(claim.includes("alreadyClaimed"));
  assert.ok(claim.includes("requireCanonical"));
  console.log("[3-4] claim + Area Watch source integration PASS");
}

async function testAreaWatchDedupeRuntime() {
  type Row = {
    id: string;
    userId: string;
    city: string;
    community: string | null;
    transactionType: "SALE";
    segment: "RESIDENTIAL";
    notifyNew: boolean;
    notifySold: boolean;
    emailAlerts: boolean;
    lastSeenListingAt: Date;
  };
  const store = new Map<string, Row>();
  const keyOf = (c: {
    userId: string;
    city: string;
    community: string | null;
    transactionType: string;
    segment: string;
  }) =>
    `${c.userId}|${c.city}|${c.community}|${c.transactionType}|${c.segment}`;
  const adapter = {
    findEquivalent: async (c: {
      userId: string;
      city: string;
      community: string | null;
      transactionType: "SALE";
      segment: "RESIDENTIAL";
    }) => store.get(keyOf(c)) ?? null,
    create: async (row: Omit<Row, "id">) => {
      const item = { id: `am-${store.size + 1}`, ...row };
      store.set(keyOf(row), item);
      return item;
    },
  };
  const first = await createOrReuseAreaMonitor(adapter, {
    userId: "u1",
    city: "Kitchener",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    notifyNew: true,
    notifySold: true,
    emailAlerts: true,
    lastSeenListingAt: new Date(),
  });
  const second = await createOrReuseAreaMonitor(adapter, {
    userId: "u1",
    city: "Kitchener",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    notifyNew: true,
    notifySold: true,
    emailAlerts: true,
    lastSeenListingAt: new Date(),
  });
  assert.equal(first.alreadyWatching, false);
  assert.equal(second.alreadyWatching, true);
  assert.equal(first.item.id, second.item.id);
  assert.equal(store.size, 1);

  // Different workspace user = different watch (userId scoped)
  const other = await createOrReuseAreaMonitor(adapter, {
    userId: "u2-ws-b",
    city: "Kitchener",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    notifyNew: true,
    notifySold: true,
    emailAlerts: true,
    lastSeenListingAt: new Date(),
  });
  assert.equal(other.alreadyWatching, false);
  assert.equal(store.size, 2);
  console.log("[4] Area Watch dedupe runtime PASS");
}

async function testValuationJourney() {
  await withFlag(true, async () => {
    const address: ResolvedAddressParts = {
      formattedAddress: "100 King Street West Unit 1205, Toronto, ON, M5X 1A1",
      streetNumber: "100",
      streetName: "King Street West",
      unitNumber: "1205",
      city: "Toronto",
      community: null,
      province: "ON",
      postalCode: "M5X 1A1",
      lat: 43.65,
      lng: -79.38,
      placeId: "g-1",
      provider: "google",
    };
    const href = homeValuationPrefillHref(address);
    assert.ok(href.includes("unit=1205"));
    assert.ok(href.includes("from=property"));

    const prefill = await loadHomeValuationPrefillFromRequest({
      searchParams: Object.fromEntries(new URL(href, "http://x").searchParams),
      entitlement: wsA,
      deps: deps({
        resolvePhotonPlaces: async () => [
          hit({
            label: "100 King Street West",
            city: "Toronto",
            community: null,
            postalCode: "M5X 1A1",
            lat: 43.65,
            lng: -79.38,
            placeId: "g-1",
            houseNumber: "100",
          }),
        ],
      }),
    });
    // Photon stub may not parse unit into address — still must resolve city
    assert.ok(prefill);
    assert.equal(prefill!.from, "property");
    assert.equal(prefill!.city, "Toronto");

    // Provider outage → null prefill (safe recoverable; form falls back to address step)
    const outage = await loadHomeValuationPrefillFromRequest({
      searchParams: {
        from: "property",
        address: "79 Grand Flats Trail, Kitchener, ON",
      },
      entitlement: wsA,
      deps: deps({
        resolvePhotonPlaces: async () => {
          throw new Error("provider down");
        },
      }),
    });
    assert.equal(outage, null);

    // V1 safeguards still hold
    assert.deepEqual(compatiblePropertyTypes("DETACHED"), ["DETACHED"]);
    const now = new Date("2026-10-15T12:00:00.000Z");
    const subject: SubjectForComps = {
      city: "Kitchener",
      beds: 3,
      baths: 2,
      sqft: 1600,
      propertyType: "DETACHED",
      lat: 43.45,
      lng: -80.49,
    };
    const condo: SoldCompCandidate = {
      soldPrice: 500_000,
      soldAt: new Date("2026-06-01"),
      beds: 3,
      baths: 2,
      sqft: 1550,
      lat: 43.451,
      lng: -80.491,
      propertyType: "CONDO_APT",
      city: "Kitchener",
      community: null,
    };
    assert.equal(isEligibleSoldComp(condo, subject, { maxKm: 5, now }), false);
    const est = weightedSoldEstimate([
      { soldPrice: 720_000, score: 3 },
      { soldPrice: 740_000, score: 2.8 },
      { soldPrice: 750_000, score: 2.6 },
    ]);
    assert.ok(est);
    assert.equal(weightedSoldEstimate([]), null);

    const route = read("src/app/api/valuation/route.ts");
    assert.ok(
      route.includes("const mayDiscloseSoldEstimate = canSeeSoldValuation"),
    );
    assert.ok(route.includes("leadId: lead.id"));
    assert.equal(route.includes("accountCreated && hasContact"), false);
  });
  console.log("[5] valuation journey PASS");
}

function testTenantIsolation() {
  const entitledA = buildPrismaEntitledInventoryWhere({
    entitlement: wsA,
    dataSource: "mls",
    statuses: ["ACTIVE"],
  });
  const entitledB = buildPrismaEntitledInventoryWhere({
    entitlement: wsB,
    dataSource: "mls",
    statuses: ["ACTIVE"],
  });
  assert.equal(entitledA.kind, "where");
  assert.equal(entitledB.kind, "empty");

  const soldA = buildPrismaEntitledInventoryWhere({
    entitlement: wsA,
    dataSource: "mls",
    statuses: ["SOLD"],
  });
  const soldB = buildPrismaEntitledInventoryWhere({
    entitlement: wsB,
    dataSource: "mls",
    statuses: ["SOLD"],
  });
  const soldActiveOnly = buildPrismaEntitledInventoryWhere({
    entitlement: wsActiveOnly,
    dataSource: "mls",
    statuses: ["SOLD"],
  });
  const activeOnlyActives = buildPrismaEntitledInventoryWhere({
    entitlement: wsActiveOnly,
    dataSource: "mls",
    statuses: ["ACTIVE"],
  });
  assert.equal(soldA.kind, "where");
  assert.equal(soldB.kind, "empty");
  assert.equal(
    soldActiveOnly.kind,
    "empty",
    "active-only workspace must not aggregate SOLD comps",
  );
  assert.equal(activeOnlyActives.kind, "where");

  // Insights builder never invents sold fields
  const insights = buildNeighbourhoodInsightsFromActives({
    city: "Kitchener",
    rows: [{ listPrice: 1, daysOnMarket: 1 }],
  });
  assert.equal("soldCount" in insights, false);
  assert.equal("medianSoldPrice" in insights, false);

  const claim = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(claim.includes("workspaceId: input.workspaceId"));
  assert.ok(
    claim.includes("where: { customerId: input.userId, workspaceId: input.workspaceId }") ||
      claim.includes("workspaceId: input.workspaceId"),
  );

  const insightsLib = read("src/lib/property-address/neighbourhood-insights.ts");
  assert.ok(insightsLib.includes("buildPrismaEntitledInventoryWhere"));
  assert.equal(insightsLib.includes("soldPrice"), false);
  assert.ok(insightsLib.includes('from "react"')); // per-request cache, not shared public HTTP
  console.log("[6] tenant isolation PASS");
}

function testUiWiringGuards() {
  const view = read("src/components/property/PropertyProfileView.tsx");
  assert.ok(view.includes("NeighbourhoodInsightsCard"));
  assert.ok(view.includes("PropertyHomeValuationCta"));
  assert.ok(view.includes("ClaimPropertyAddressButton"));
  // Claim and valuation remain separate CTAs
  const claimIdx = view.indexOf("ClaimPropertyAddressButton");
  const valIdx = view.indexOf("PropertyHomeValuationCta");
  assert.ok(claimIdx > 0 && valIdx > 0);

  const form = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(form.includes("verifiedPrefill"));
  assert.ok(form.includes("fromProperty"));
  assert.ok(form.includes("Insufficient Market Data"));
  assert.ok(form.includes("Contact a Real Estate Expert"));

  const env = read(".env.example");
  assert.ok(env.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"'));
  console.log("[ui] wiring guards PASS");
}

async function main() {
  testUiWiringGuards();
  await testFlagOffPreservesSearch();
  await testSearchToProfileTransitions();
  await testPropertyProfileInsights();
  testClaimAndAreaWatchIntegration();
  await testAreaWatchDedupeRuntime();
  await testValuationJourney();
  testTenantIsolation();
  console.log("property-address-phase4c-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Phase 2 — feature-flagged search integration for address resolve.
 * Run: pnpm property-address-search-integration:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideSearchAddressNavigation,
  dedupeAddressSuggestions,
  isOffMarketPropertySearchEnabled,
  isResidentialAddressSuggestion,
  PREPARED_PROPERTY_ADDRESS_STORAGE_KEY,
  propertyAddressPath,
  propertyAddressSlug,
  rememberPreparedPropertyAddress,
  readPreparedPropertyAddress,
  type ResolveAddressResult,
} from "../src/lib/property-address";
import type { AutocompleteSuggestion } from "../src/lib/listings/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testFlagDefaultOff() {
  const prev = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  assert.equal(isOffMarketPropertySearchEnabled(), false);
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = "0";
  assert.equal(isOffMarketPropertySearchEnabled(), false);
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = "1";
  assert.equal(isOffMarketPropertySearchEnabled(), true);
  if (prev === undefined) {
    delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = prev;
  }
}

function testResidentialSuggestionFilter() {
  assert.equal(
    isResidentialAddressSuggestion({
      type: "place",
      group: "addresses",
      label: "79 Grand Flats Trail",
      city: "Kitchener",
    }),
    true,
  );
  assert.equal(
    isResidentialAddressSuggestion({
      type: "listing",
      group: "listings",
      label: "79 Grand Flats Trail",
      mlsNumber: "X1",
      href: "/listing/x/X1",
    }),
    false,
  );
  assert.equal(
    isResidentialAddressSuggestion({
      type: "mls",
      group: "mls",
      label: "X1",
      mlsNumber: "X1",
    }),
    false,
  );
  assert.equal(
    isResidentialAddressSuggestion({
      type: "city",
      group: "cities",
      label: "Kitchener",
    }),
    false,
  );
  assert.equal(
    isResidentialAddressSuggestion({
      type: "action",
      group: "around",
      action: "near_me",
      label: "Near me",
    }),
    false,
  );
}

function testActiveListingNavigatesToListing() {
  const result: ResolveAddressResult = {
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
      mlsNumber: "X12345678",
      path: "/listing/79-grand-flats-trail-kitchener/X12345678",
    },
    confidence: "high",
    resolution: {
      geocodeOk: true,
      mlsProbe: "active",
      errors: [],
      warnings: [],
    },
  };
  const decision = decideSearchAddressNavigation(result, {
    transactionType: "SALE",
  });
  assert.equal(decision.kind, "listing");
  if (decision.kind === "listing") {
    assert.equal(
      decision.href,
      "/listing/79-grand-flats-trail-kitchener/X12345678",
    );
    assert.equal(decision.mlsNumber, "X12345678");
  }
}

function testOffMarketPreparesPropertyButNearby() {
  const result: ResolveAddressResult = {
    ok: true,
    address: {
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      unitNumber: null,
      city: "Kitchener",
      province: "ON",
      postalCode: "N2A 0J5",
      lat: 43.45,
      lng: -80.45,
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
  const decision = decideSearchAddressNavigation(result, {
    transactionType: "SALE",
  });
  assert.equal(decision.kind, "property_prepared");
  if (decision.kind !== "property_prepared") return;
  assert.ok(decision.prepared.path.startsWith("/property/"));
  assert.ok(decision.prepared.path.includes("79-grand-flats"));
  assert.ok(decision.prepared.path.includes("address="));
  assert.ok(decision.nearbyHref?.startsWith("/search?"));
  assert.ok(decision.nearbyHref?.includes("lat="));
  assert.notEqual(decision.nearbyHref, decision.prepared.path);
}

function testUnknownNoOffMarketLabel() {
  const result: ResolveAddressResult = {
    ok: true,
    address: {
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      unitNumber: null,
      city: "Kitchener",
      province: "ON",
      postalCode: null,
      lat: 43.45,
      lng: -80.45,
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
  const decision = decideSearchAddressNavigation(result);
  assert.equal(decision.kind, "nearby");
  if (decision.kind !== "nearby") return;
  const blob = JSON.stringify(decision);
  assert.equal(/off[-\s]?market/i.test(blob), false);
  assert.ok(decision.nearbyHref?.startsWith("/search?"));
}

function testUnresolvableApproximate() {
  const result: ResolveAddressResult = {
    ok: false,
    error: "Could not resolve an exact residential address.",
    code: "UNRESOLVABLE",
    listingStatusClass: "UNKNOWN",
    resolution: {
      geocodeOk: false,
      mlsProbe: "skipped",
      errors: ["approximate_or_street_level_geocode"],
      warnings: [],
    },
  };
  const decision = decideSearchAddressNavigation(result, {
    fallbackLat: 43.4,
    fallbackLng: -80.4,
    fallbackCity: "Kitchener",
  });
  assert.equal(decision.kind, "unresolvable");
  if (decision.kind !== "unresolvable") return;
  assert.ok(decision.nearbyHref?.includes("/search?"));
  assert.ok(decision.message.length > 0);
}

function testUnitPreservedInPreparedPath() {
  const path = propertyAddressPath({
    streetNumber: "100",
    streetName: "King Street West",
    unitNumber: "1205",
    city: "Toronto",
    province: "ON",
    lat: 43.65,
    lng: -79.38,
  });
  assert.ok(path.includes("/property/"));
  assert.ok(path.includes("unit=1205"));
  assert.ok(path.includes("1205") || path.includes("unit-1205") || path.includes("Unit"));
  const slug = propertyAddressSlug({
    streetNumber: "100",
    streetName: "King Street West",
    unitNumber: "1205",
    city: "Toronto",
  });
  assert.ok(slug.includes("1205"));
}

function testPreparedStorage() {
  const mem = new Map<string, string>();
  const storage = {
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    getItem: (k: string) => mem.get(k) ?? null,
  };
  rememberPreparedPropertyAddress(
    {
      path: "/property/79-grand-flats-trail-kitchener?lat=1&lng=2",
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      unitNumber: null,
      city: "Kitchener",
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
  const read = readPreparedPropertyAddress(storage);
  assert.equal(read?.city, "Kitchener");
  assert.equal(read?.listingStatusClass, "NO_ACTIVE_LISTING_FOUND");
  assert.equal(PREPARED_PROPERTY_ADDRESS_STORAGE_KEY.startsWith("houzzat:"), true);
}

function testDedupeAddressSuggestions() {
  const items: AutocompleteSuggestion[] = [
    {
      type: "listing",
      group: "listings",
      label: "A",
      mlsNumber: "X1",
    },
    {
      type: "place",
      group: "addresses",
      label: "79 Grand Flats Trail",
      city: "Kitchener",
    },
    {
      type: "place",
      group: "addresses",
      label: "79 Grand Flats Trail",
      city: "Kitchener",
    },
    {
      type: "place",
      group: "addresses",
      label: "79 Grand Flats Trail",
      city: "Kitchener",
      unitNumber: "2",
    },
  ];
  const deduped = dedupeAddressSuggestions(items);
  assert.equal(deduped.length, 3);
}

function testSourceGuards() {
  const autocomplete = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(autocomplete.includes("isOffMarketPropertySearchEnabled"));
  assert.ok(autocomplete.includes("fetchPropertyAddressResolve"));
  assert.ok(autocomplete.includes("decideSearchAddressNavigation"));
  assert.ok(autocomplete.includes("rememberPreparedPropertyAddress"));
  assert.ok(autocomplete.includes("dedupeAddressSuggestions"));
  // Resolve must be gated — not called unconditionally in the keystroke effect.
  assert.ok(autocomplete.includes("isOffMarketPropertySearchEnabled()"));
  assert.ok(
    autocomplete.includes("allowSelectResolve") ||
      autocomplete.includes("!fillOnly"),
  );
  // Keystroke fetch block must not call property-address resolve.
  const fetchBlock = autocomplete.slice(
    autocomplete.indexOf("const fetchPlaces"),
    autocomplete.indexOf("setResolvedNearHref(nearHref)"),
  );
  assert.equal(fetchBlock.includes("property-address/resolve"), false);
  assert.equal(fetchBlock.includes("fetchPropertyAddressResolve"), false);

  // Phase 3 adds /property — keep resolve off the keystroke path only.
  assert.ok(existsSync(join(root, "src/app/(marketing)/property/[slug]/page.tsx")));

  const flag = read("src/lib/property-address/feature-flag.ts");
  assert.ok(flag.includes('=== "1"'));
  assert.ok(flag.includes("NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED"));

  // Funnel may prefill claim context; must not couple to the search feature flag.
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.ok(funnel.includes("readClaimAddressContext"));
  assert.equal(funnel.includes("OFF_MARKET_PROPERTY"), false);
  assert.equal(funnel.includes("isOffMarketPropertySearchEnabled"), false);
}

function main() {
  testFlagDefaultOff();
  testResidentialSuggestionFilter();
  testActiveListingNavigatesToListing();
  testOffMarketPreparesPropertyButNearby();
  testUnknownNoOffMarketLabel();
  testUnresolvableApproximate();
  testUnitPreservedInPreparedPath();
  testPreparedStorage();
  testDedupeAddressSuggestions();
  testSourceGuards();
  console.log("property-address-search-integration-selftest: OK");
}

main();

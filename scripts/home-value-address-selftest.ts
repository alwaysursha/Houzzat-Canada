/**
 * Home Valuation address verification UX — hermetic regression tests.
 * Run: pnpm home-value-address:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VALUATION_ADDRESS_RESELECT_MESSAGE,
  VALUATION_ADDRESS_UNVERIFIED_MESSAGE,
  addressQueryMatchesVerified,
  isVerifiedValuationLocation,
  verifiedLocationFromResolve,
  verifiedLocationFromSuggestion,
} from "../src/lib/market/home-value-address";
import type { ResolveAddressResult } from "../src/lib/property-address/resolve-address";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testSelectSuggestionVerified() {
  const ok = verifiedLocationFromSuggestion({
    type: "place",
    group: "addresses",
    label: "79 Grand Flats Trail",
    city: "Kitchener",
    province: "ON",
    houseNumber: "79",
    lat: 43.4,
    lng: -80.5,
    placeId: "abc",
  });
  assert.ok(ok);
  assert.equal(ok!.city, "Kitchener");
  assert.equal(ok!.streetNumber, "79");
  assert.ok(ok!.address.includes("79 Grand Flats Trail"));
  assert.ok(ok!.address.includes("Kitchener"));
  console.log("[select] verified suggestion PASS");
}

function testSelectStreetCentroidRejected() {
  const streetOnly = verifiedLocationFromSuggestion({
    type: "place",
    group: "addresses",
    label: "Grand Flats Trail",
    city: "Kitchener",
    province: "ON",
    houseNumber: null,
    lat: 43.4,
    lng: -80.5,
  });
  assert.equal(streetOnly, null, "street centroid must not verify");

  const missingCoords = verifiedLocationFromSuggestion({
    type: "place",
    label: "79 Grand Flats Trail",
    city: "Kitchener",
    province: "ON",
    houseNumber: "79",
  });
  assert.equal(missingCoords, null, "missing coords must not verify");

  const missingCity = verifiedLocationFromSuggestion({
    type: "place",
    label: "79 Grand Flats Trail",
    houseNumber: "79",
    lat: 43.4,
    lng: -80.5,
  });
  assert.equal(missingCity, null, "missing city must not verify");
  console.log("[select] incomplete / street-level rejected PASS");
}

function testTypingWithoutSelectHelpers() {
  assert.equal(
    isVerifiedValuationLocation({
      city: "",
      lat: undefined,
      lng: undefined,
      label: "79 Grand Flats Trail, Kitchener, Ontario",
    }),
    false,
  );
  assert.equal(
    isVerifiedValuationLocation({
      city: "Kitchener",
      lat: 43.4,
      lng: -80.5,
      label: "79 Grand Flats Trail, Kitchener, Ontario",
    }),
    true,
  );
  console.log("[type] typing alone is unverified until resolve PASS");
}

function testResolveAcceptance() {
  const ok: ResolveAddressResult = {
    ok: true,
    address: {
      formattedAddress: "79 Grand Flats Trail, Kitchener, ON",
      streetNumber: "79",
      streetName: "Grand Flats Trail",
      unitNumber: null,
      city: "Kitchener",
      community: null,
      province: "ON",
      postalCode: null,
      lat: 43.4,
      lng: -80.5,
      placeId: "p1",
      provider: "google",
    },
    listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
    activeListing: null,
    confidence: "medium",
    resolution: {
      geocodeOk: true,
      mlsProbe: "none",
      errors: [],
      warnings: [],
    },
  };
  const verified = verifiedLocationFromResolve(ok);
  assert.ok(verified);
  assert.equal(verified!.city, "Kitchener");

  const low: ResolveAddressResult = { ...ok, confidence: "low" };
  assert.equal(verifiedLocationFromResolve(low), null);

  const noCivic: ResolveAddressResult = {
    ...ok,
    address: { ...ok.address, streetNumber: null },
  };
  assert.equal(verifiedLocationFromResolve(noCivic), null);

  const fail: ResolveAddressResult = {
    ok: false,
    error: "Could not resolve",
    code: "UNRESOLVABLE",
    listingStatusClass: "UNKNOWN",
    resolution: {
      geocodeOk: false,
      mlsProbe: "skipped",
      errors: ["approximate_or_street_level_geocode"],
      warnings: [],
    },
  };
  assert.equal(verifiedLocationFromResolve(fail), null);
  console.log("[resolve] accept precise / reject low & street PASS");
}

function testBackNavigationPreservesMatch() {
  assert.ok(
    addressQueryMatchesVerified(
      "79 Grand Flats Trail, Kitchener, ON",
      "79 Grand Flats Trail, Kitchener, ON",
    ),
  );
  // Prefix match keeps verification when autocomplete trims/extends the line.
  assert.ok(
    addressQueryMatchesVerified(
      "79 Grand Flats Trail, Kitchener, ON",
      "79 Grand Flats Trail, Kitchener, ON N2A",
    ),
  );
  assert.equal(
    addressQueryMatchesVerified(
      "12 Other St, Kitchener, ON",
      "79 Grand Flats Trail, Kitchener, ON",
    ),
    false,
  );
  console.log("[nav] verified match / edit invalidation PASS");
}

function testFormWiring() {
  const form = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(form.includes("ensureVerifiedLocation"));
  assert.ok(form.includes("fetchPropertyAddressResolve"));
  assert.ok(form.includes("verifiedLocationFromSuggestion"));
  assert.ok(form.includes("verifiedLocationFromResolve"));
  assert.ok(form.includes("locationVerified"));
  assert.ok(form.includes("clearVerifiedLocation"));
  assert.ok(form.includes("onAddressQueryChange"));
  assert.ok(form.includes("VALUATION_ADDRESS_RESELECT_MESSAGE"));
  assert.ok(form.includes("VALUATION_ADDRESS_UNVERIFIED_MESSAGE"));
  assert.ok(form.includes("Waiting for a verified address"));
  // Must not advance address submit without verification attempt.
  assert.ok(form.includes("await ensureVerifiedLocation()"));
  // Back from features must not clear verification implicitly.
  assert.ok(form.includes('setStep("address")'));
  assert.ok(form.includes("Location verified"));
  console.log("[form] wiring PASS");
}

function testAutocompleteCivicFallback() {
  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("needsCivicFallback"));
  assert.ok(ac.includes('source === "google"'));
  assert.ok(ac.includes("fetchPropertyAddressResolve"));
  assert.ok(ac.includes("houseNumber?.trim()"));
  console.log("[autocomplete] google fillOnly civic fallback PASS");
}

function testMessagesStable() {
  assert.ok(VALUATION_ADDRESS_RESELECT_MESSAGE.length > 20);
  assert.ok(VALUATION_ADDRESS_UNVERIFIED_MESSAGE.length > 20);
  assert.equal(
    VALUATION_ADDRESS_RESELECT_MESSAGE.toLowerCase().includes("invent"),
    false,
  );
  console.log("[copy] messages PASS");
}

function main() {
  testSelectSuggestionVerified();
  testSelectStreetCentroidRejected();
  testTypingWithoutSelectHelpers();
  testResolveAcceptance();
  testBackNavigationPreservesMatch();
  testFormWiring();
  testAutocompleteCivicFallback();
  testMessagesStable();
  console.log("home-value-address-selftest: OK");
}

main();

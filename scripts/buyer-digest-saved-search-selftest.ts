/**
 * Explicit SavedSearch stays the digest criteria.
 * Run: pnpm buyer-digest:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buyerIntentDisplaySource } from "../src/lib/agent/buyer-intent";
import {
  planBuyerDigest,
  savedSearchDigestCursorUpdate,
} from "../src/lib/email/digests/buyer-digest-plan";

const EXPLICIT = {
  city: "Toronto",
  community: "The Beaches",
  minPrice: "800000",
  maxPrice: "1200000",
  minBeds: "3",
  minBaths: "2",
  propertyTypes: "DETACHED",
  openHouseOnly: "1",
  sort: "price_asc",
  transactionType: "SALE",
};

const BROWSE = {
  city: "Ottawa",
  community: "Kanata",
  minPrice: "400000",
  maxPrice: "600000",
  minBeds: "1",
  propertyTypes: "CONDO_APT",
  transactionType: "LEASE",
};

function explicitPlan() {
  return planBuyerDigest({
    primary: {
      id: "search-1",
      query: EXPLICIT,
      emailAlerts: true,
      lastAlertedAt: null,
    },
    browseQuery: BROWSE,
    browseName: "Ottawa rentals",
    browseUsable: true,
  });
}

function testExplicitQueryIsNotRewritten() {
  const plan = explicitPlan();
  assert.equal(plan.action, "match_stored");
  if (plan.action !== "match_stored") return;
  assert.equal(plan.writeQuery, false);
  assert.deepEqual(plan.query, EXPLICIT);
  assert.equal(plan.query.city, "Toronto");
  assert.equal(plan.query.community, "The Beaches");
  assert.equal(plan.query.minPrice, "800000");
  assert.equal(plan.query.maxPrice, "1200000");
  assert.equal(plan.query.minBeds, "3");
  assert.equal(plan.query.propertyTypes, "DETACHED");
  assert.equal(plan.query.minBaths, "2");
  assert.equal(plan.query.openHouseOnly, "1");
  assert.equal(plan.query.sort, "price_asc");
  assert.notEqual(plan.query.city, BROWSE.city);
}

function testCursorStillAdvancesWithoutTouchingQuery() {
  const now = new Date("2026-09-28T12:00:00.000Z");
  const update = savedSearchDigestCursorUpdate(now);
  assert.deepEqual(update, { lastAlertedAt: now });
  assert.equal("query" in update, false);
  assert.equal("name" in update, false);
}

function testBrowseOnlyStillCreatesWhenNoPrimary() {
  const plan = planBuyerDigest({
    primary: null,
    browseQuery: BROWSE,
    browseName: "Ottawa rentals",
    browseUsable: true,
  });
  assert.equal(plan.action, "create_from_browse");
  if (plan.action !== "create_from_browse") return;
  assert.equal(plan.writeQuery, true);
  assert.deepEqual(plan.query, BROWSE);
}

function testLookingForStillShowsBothSignals() {
  assert.deepEqual(
    buyerIntentDisplaySource({ fromSaved: true, fromBrowse: true }),
    { source: "mixed", sourceLabel: "Saved + browsing" },
  );
  assert.deepEqual(
    buyerIntentDisplaySource({ fromSaved: true, fromBrowse: false }),
    { source: "saved", sourceLabel: "Saved search" },
  );
  assert.deepEqual(
    buyerIntentDisplaySource({ fromSaved: false, fromBrowse: true }),
    { source: "inferred", sourceLabel: "From browsing" },
  );
}

function testMonitorsStayIndependent() {
  const digest = readFileSync("src/lib/email/digests/buyer.ts", "utf8");
  const monitors = readFileSync("src/lib/account/monitors.ts", "utf8");
  const areaRoute = readFileSync(
    "src/app/api/account/area-monitors/route.ts",
    "utf8",
  );
  assert.equal(digest.includes("areaMonitor"), false);
  assert.equal(digest.includes("propertyMonitor"), false);
  assert.equal(digest.includes("syncPrimarySavedSearch"), false);
  assert.ok(monitors.includes("existingAreaAlertMls"));
  assert.ok(areaRoute.includes("alreadyWatching"));
}

function main() {
  testExplicitQueryIsNotRewritten();
  testCursorStillAdvancesWithoutTouchingQuery();
  testBrowseOnlyStillCreatesWhenNoPrimary();
  testLookingForStillShowsBothSignals();
  testMonitorsStayIndependent();
  console.log("buyer-digest saved-search selftest passed");
}

main();

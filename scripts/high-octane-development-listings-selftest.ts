/**
 * HIGH OCTANE development listing mode. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-development-listings-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "../src/lib/tenancy/templates/high-octane-preview-fixture";
import {
  HIGH_OCTANE_DEVELOPMENT_LISTINGS_DISABLE,
  HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE,
  decideHighOctaneDevelopmentListingAccess,
  decideHighOctaneDevelopmentListingSave,
  highOctaneDevelopmentListingDetail,
  isHighOctaneDevelopmentListingMls,
  searchHighOctaneDevelopmentListings,
} from "../src/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const on = { HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on", NODE_ENV: "development" };
const saad = {
  email: HIGH_OCTANE_PREVIEW_FIXTURE.email,
  masterAdminActive: false,
  highOctaneMembershipActive: true,
};
const master = {
  email: "teamalisyed@gmail.com",
  masterAdminActive: true,
  highOctaneMembershipActive: false,
};

const enabled = decideHighOctaneDevelopmentListingAccess({
  env: on,
  workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  actor: master,
});
assert.equal(enabled.serveFixtures, true);
assert.equal(enabled.trrebBorrowAuthorized, false);
assert.equal(enabled.source, "development-fixture");
assert.equal(enabled.disableSwitch, HIGH_OCTANE_DEVELOPMENT_LISTINGS_DISABLE);

assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "production", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: master,
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "development", VERCEL_ENV: "production", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: master,
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "development" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: master,
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: on,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: null,
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: on,
    workspaceSlug: "houzzat",
    actor: master,
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: on,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: { ...saad, highOctaneMembershipActive: false },
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: on,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: saad,
  }).serveFixtures,
  true,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: on,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: {
      email: "visitor@example.com",
      masterAdminActive: false,
      highOctaneMembershipActive: true,
    },
  }).serveFixtures,
  false,
);

const cards = searchHighOctaneDevelopmentListings({ sort: "newest", limit: 3 });
assert.equal(cards.length, 3);
assert.equal(cards.every((card) => card.isMock), true);
assert.equal(
  cards.every((card) => card.dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE),
  true,
);
assert.equal(cards.every((card) => card.organizationId == null), true);
const niagaraFalls = searchHighOctaneDevelopmentListings({ city: "Niagara Falls" });
assert.equal(niagaraFalls.length, 2);
assert.equal(niagaraFalls.every((card) => card.city === "Niagara Falls"), true);
assert.equal(searchHighOctaneDevelopmentListings({ status: "SOLD" }).length, 0);
assert.equal(
  searchHighOctaneDevelopmentListings({ q: "ITSODEMO1003" })[0]?.city,
  "Niagara-on-the-Lake",
);

const detail = highOctaneDevelopmentListingDetail("itsodemo1003");
assert.ok(detail);
assert.equal(detail.mlsNumber, "ITSODEMO1003");
assert.equal(detail.providerKey, null);
assert.equal(detail.media.length, 2);
assert.equal(detail.description?.includes("Niagara-on-the-Lake"), true);
assert.equal(detail.description?.includes("DEMO PROPERTY"), false);
assert.equal(isHighOctaneDevelopmentListingMls("X12935628"), false);
assert.equal(highOctaneDevelopmentListingDetail("X12935628"), null);
assert.equal(isHighOctaneDevelopmentListingMls("HODEV1001"), false);

assert.equal(
  decideHighOctaneDevelopmentListingSave({
    fullCustomer: false,
    serveFixtures: true,
    mlsNumber: "ITSODEMO1001",
  }),
  "registration-required",
);
assert.equal(
  decideHighOctaneDevelopmentListingSave({
    fullCustomer: true,
    serveFixtures: false,
    mlsNumber: "ITSODEMO1001",
  }),
  "not-found",
);
assert.equal(
  decideHighOctaneDevelopmentListingSave({
    fullCustomer: true,
    serveFixtures: true,
    mlsNumber: "ITSODEMO1001",
  }),
  "save-fixture",
);
assert.equal(
  decideHighOctaneDevelopmentListingSave({
    fullCustomer: true,
    serveFixtures: true,
    mlsNumber: "X12935628",
  }),
  "use-database",
);

const saved = readFileSync(join(root, "src/app/api/saved-listings/route.ts"), "utf8");
const registrationAt = saved.indexOf("requireFullCustomerUser");
const fixtureAt = saved.indexOf("save-fixture");
assert.ok(registrationAt >= 0 && fixtureAt > registrationAt);

const search = readFileSync(join(root, "src/app/api/listings/search/route.ts"), "utf8");
assert.equal(search.includes("isHighOctaneStagingSnapshotVisible"), true);
assert.equal(search.includes("searchParams.get(\"HIGH_OCTANE_DEVELOPMENT_LISTINGS\")"), false);
assert.equal(search.includes("highOctaneWithoutOwnEntitlement"), true);
assert.equal(search.includes("lookupPropTxOnDemand"), true);

const homeRails = readFileSync(join(root, "src/app/api/listings/home-rails/route.ts"), "utf8");
assert.equal(homeRails.includes("isHighOctaneStagingSnapshotVisible"), true);
assert.equal(homeRails.includes("private, no-store"), true);

const detailRoute = readFileSync(
  join(root, "src/app/(marketing)/listing/[...parts]/listing-operational.tsx"),
  "utf8",
);
assert.equal(detailRoute.includes("isHighOctaneStagingSnapshotVisible"), true);
assert.equal(detailRoute.includes("serveFixtures"), true);

const featured = readFileSync(
  join(root, "src/components/templates/royal-collection-one/RoyalCollectionFeatured.tsx"),
  "utf8",
);
assert.equal(featured.includes("No listings are published on this site yet."), true);
assert.equal(featured.includes("preserveEmpty"), true);

console.log("high-octane-development-listings-selftest: ok");

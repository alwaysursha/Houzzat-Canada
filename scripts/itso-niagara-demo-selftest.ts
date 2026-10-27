/**
 * ITSO RESO demo mapping. No database and no live ITSO calls.
 * Run: pnpm exec tsx scripts/itso-niagara-demo-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapResoListingPackage } from "../src/lib/listings/itso/map-reso-listing";
import {
  NIAGARA_DEMO_CLOSED_LISTING,
  NIAGARA_DEMO_LISTINGS,
} from "../src/lib/listings/itso/niagara-demo-listings";
import {
  ITSO_LIVE_SOURCE_UNAVAILABLE,
  ITSO_PROVIDER_KEY,
  evaluateItsoLiveSource,
  selectItsoListingSource,
} from "../src/lib/listings/itso/itso-sources";
import {
  decideHighOctaneDevelopmentListingAccess,
  highOctaneDevelopmentListingCards,
  highOctaneDevelopmentListingDetail,
  searchHighOctaneDevelopmentListings,
} from "../src/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cities = [
  "Niagara Falls",
  "Niagara-on-the-Lake",
  "St. Catharines",
  "Welland",
  "Thorold",
  "Grimsby",
  "Fort Erie",
];

assert.ok(NIAGARA_DEMO_LISTINGS.length >= 12 && NIAGARA_DEMO_LISTINGS.length <= 15);
for (const city of cities) {
  assert.ok(
    NIAGARA_DEMO_LISTINGS.some((record) => record.property.City === city),
    city,
  );
}

const cards = highOctaneDevelopmentListingCards();
assert.equal(cards.length, NIAGARA_DEMO_LISTINGS.length);
assert.equal(cards.every((card) => card.isMock && card.soldPrice == null), true);
assert.equal(cards.every((card) => card.brokerageName === "Demo Property Brokerage"), true);
const showcase = cards.find((card) => card.mlsNumber === "ITSODEMO1001");
const illustrated = cards.filter((card) => card.mlsNumber !== "ITSODEMO1001");
assert.equal(showcase?.imageUrls.length, 5);
assert.equal(
  showcase?.primaryImageUrl,
  "/media/royal-collection/high-octane/itso-demo-1001/01-exterior.webp",
);
assert.deepEqual(showcase?.imageUrls, [
  "/media/royal-collection/high-octane/itso-demo-1001/01-exterior.webp",
  "/media/royal-collection/high-octane/itso-demo-1001/02-living-room.webp",
  "/media/royal-collection/high-octane/itso-demo-1001/03-kitchen.webp",
  "/media/royal-collection/high-octane/itso-demo-1001/04-primary-bedroom.webp",
  "/media/royal-collection/high-octane/itso-demo-1001/05-rear-patio.webp",
]);
assert.equal(
  illustrated.every((card) => card.primaryImageUrl?.startsWith("data:image/svg+xml,")),
  true,
);
assert.equal(
  new Set(cards.map((card) => card.propertyType)).has("DETACHED") &&
    new Set(cards.map((card) => card.propertyType)).has("TOWNHOUSE") &&
    new Set(cards.map((card) => card.propertyType)).has("CONDO_APT"),
  true,
);

const decoded = decodeURIComponent(
  illustrated[0]?.primaryImageUrl?.slice("data:image/svg+xml,".length) ?? "",
);
const showcaseDetail = highOctaneDevelopmentListingDetail("ITSODEMO1001");
assert.ok(showcaseDetail);
assert.equal(showcaseDetail.media.length, 5);
assert.equal(showcaseDetail.media[0]?.isPrimary, true);
assert.equal(showcaseDetail.media.slice(1).every((photo) => photo.isPrimary === false), true);
assert.equal(showcaseDetail.description.includes("Niagara Falls"), true);
assert.equal(showcaseDetail.description.includes("DEMO PROPERTY"), false);
assert.equal(decoded.includes("DEMO PROPERTY"), true);
assert.equal(decoded.includes("<image"), false);

const detail = highOctaneDevelopmentListingDetail("ITSODEMO1011");
assert.ok(detail);
assert.equal(detail.city, "Grimsby");
assert.equal(detail.media.length, 2);
assert.equal(detail.media[0]?.isPrimary, true);
assert.equal(detail.description.includes("Grimsby"), true);
assert.equal(detail.description.includes("DEMO PROPERTY"), false);
assert.equal(detail.soldPrice, null);
assert.equal(detail.organizationId, null);
assert.equal(detail.providerKey, null);
const facts = detail.facts as { waterfront?: boolean; listAgentFullName?: string };
assert.equal(facts.waterfront, true);
assert.equal(facts.listAgentFullName, "Riley Demo");

const idxClosed = mapResoListingPackage(NIAGARA_DEMO_CLOSED_LISTING, "idx");
const vowClosed = mapResoListingPackage(NIAGARA_DEMO_CLOSED_LISTING, "vow");
assert.equal(idxClosed.card.soldPrice, null);
assert.equal(idxClosed.detail.soldPrice, null);
assert.equal(idxClosed.vowPrivateRemarks, null);
assert.equal(idxClosed.detail.description.includes("VOW ONLY"), false);
assert.equal(vowClosed.detail.soldPrice, 595000);
assert.equal(vowClosed.vowPrivateRemarks?.includes("VOW ONLY"), true);
assert.equal(vowClosed.detail.description.includes("VOW ONLY"), false);
assert.equal(highOctaneDevelopmentListingDetail("ITSODEMO1901"), null);

assert.equal(searchHighOctaneDevelopmentListings({ propertyType: "TOWNHOUSE" }).length, 3);
assert.equal(searchHighOctaneDevelopmentListings({ minPrice: 2000000 }).length, 1);
assert.equal(searchHighOctaneDevelopmentListings({ openHouseOnly: true }).length, 2);
assert.equal(
  searchHighOctaneDevelopmentListings({ west: -79.3, east: -79.0, south: 43.0, north: 43.2 }).some(
    (card) => card.city === "Fort Erie",
  ),
  false,
);

const readyLive = {
  credentialRef: "opaque-ref",
  feedType: "idx" as const,
  connectionStatus: "ACTIVE" as const,
  entitlementActive: true,
  metadataConfirmed: true,
};
assert.equal(selectItsoListingSource({ demoEnabled: true, live: readyLive }), "live");
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "development", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: { email: "teamalisyed@gmail.com", masterAdminActive: true, highOctaneMembershipActive: false },
    live: readyLive,
  }).serveFixtures,
  false,
);
assert.equal(selectItsoListingSource({ demoEnabled: true }), "demo");
assert.equal(selectItsoListingSource({ demoEnabled: false }), "none");
assert.equal(
  selectItsoListingSource({ demoEnabled: true, requested: "disabled" }),
  "none",
);
assert.equal(
  selectItsoListingSource({ demoEnabled: true, requested: "live" }),
  "none",
);
assert.equal(
  selectItsoListingSource({ demoEnabled: true, requested: "live", live: readyLive }),
  "live",
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "development", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: { email: "teamalisyed@gmail.com", masterAdminActive: true, highOctaneMembershipActive: false },
    requested: "disabled",
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "production", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: { email: "teamalisyed@gmail.com", masterAdminActive: true, highOctaneMembershipActive: false },
    requested: "demo",
  }).serveFixtures,
  false,
);
const blocked = evaluateItsoLiveSource(ITSO_LIVE_SOURCE_UNAVAILABLE);
assert.equal(blocked.available, false);
assert.equal(blocked.trrebBorrowAuthorized, false);
assert.equal(blocked.providerKey, ITSO_PROVIDER_KEY);
assert.equal(blocked.providerKey === "proptx", false);

const featured = readFileSync(
  join(root, "src/components/templates/royal-collection-one/RoyalCollectionFeatured.tsx"),
  "utf8",
);
assert.equal(featured.includes("HIGH_OCTANE_DEMO_CARD_LABEL"), true);
for (const file of [
  "src/components/listings/SearchResultCard.tsx",
  "src/components/listings/ListingDetailView.tsx",
  "src/components/listings/ListingMapView.tsx",
]) {
  assert.equal(
    readFileSync(join(root, file), "utf8").includes("highOctaneDevelopmentListingBadge"),
    true,
    file,
  );
}
const sourcePanel = readFileSync(
  join(root, "src/components/platform/PlatformItsoListingSources.tsx"),
  "utf8",
);
assert.equal(sourcePanel.includes("ITSO Live"), false);
assert.equal(sourcePanel.includes("PropTx IDX"), true);
assert.equal(sourcePanel.includes("PropTx VOW"), true);
assert.equal(
  readFileSync(
    join(root, "src/components/platform/PlatformItsoListingSources.tsx"),
    "utf8",
  ).includes("Disabled"),
  true,
);
assert.equal(
  readFileSync(join(root, "src/lib/listings/itso/itso-sources.ts"), "utf8").includes("proptx"),
  false,
);

console.log("itso-niagara-demo-selftest: ok");

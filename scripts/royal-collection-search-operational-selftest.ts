/**
 * Royal Collection operational search card contract.
 * Does not read a database or request a listing.
 * Run: pnpm exec tsx scripts/royal-collection-search-operational-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { highOctaneStagingPropertyConceptAllowed } from "../src/lib/tenancy/templates/high-octane-staging-property-concept";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import { royalCollectionSearchCardFacts } from "../src/lib/tenancy/templates/royal-collection-search-card";

const root = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(root, "..", path), "utf8");

const stagingReady = {
  NODE_ENV: "development",
  STAGING_DATABASE_URL: "postgresql://staging.example/neondb",
  DATABASE_URL: "postgresql://production.example/neondb",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
};

const forbiddenMls = ["X12935628", "X13744972", "X13717936", "N13526934", "X13542440"];

const complete = royalCollectionSearchCardFacts({
  addressLine: "000 Illustration Lane",
  city: "Fictional Harbour",
  province: "ON",
  listPrice: 13_500_000,
  beds: 5,
  baths: 6,
  sqft: 8400,
  propertyType: "DETACHED",
  brokerageName: "Fictional Harbour Realty",
  primaryImageUrl: "/images/home-preview/hero-luxury-residence.jpg",
  transactionType: "SALE",
});
assert.equal(complete.street, "000 Illustration Lane");
assert.equal(complete.city?.includes("Fictional Harbour"), true);
assert.equal(complete.price?.includes("13,500,000"), true);
assert.equal(complete.beds, "5");
assert.equal(complete.baths, "6");
assert.equal(complete.sqft, "8,400 sqft");
assert.equal(complete.propertyType, "Detached");
assert.equal(complete.brokerage, "Fictional Harbour Realty");
assert.equal(complete.photoUrl?.startsWith("/images/"), true);

const missing = royalCollectionSearchCardFacts({
  addressLine: "000 Illustration Lane",
  city: "Fictional Harbour",
  beds: 4,
  baths: 3,
  propertyType: "DETACHED",
  brokerageName: "   ",
  primaryImageUrl: "  ",
  listPrice: 0,
});
assert.equal(missing.price, null);
assert.equal(missing.sqft, null);
assert.equal(missing.brokerage, null);
assert.equal(missing.photoUrl, null);
assert.equal(missing.beds, "4");
assert.equal(missing.baths, "3");

const commercial = royalCollectionSearchCardFacts({
  addressLine: "000 Illustration Lane",
  city: "Fictional Harbour",
  beds: 5,
  baths: 2,
  segment: "COMMERCIAL",
  propertyType: "OFFICE",
});
assert.equal(commercial.beds, null);
assert.equal(commercial.baths, null);
assert.equal(commercial.propertyType, "Office");

const card = read("src/components/listings/SearchResultCard.tsx");
const royalStart = card.indexOf("if (royal && royalFacts)");
const royalEnd = card.indexOf("search-result-photo");
const royalBranch = card.slice(royalStart, royalEnd);
assert.equal(royalStart > 0 && royalEnd > royalStart, true);
assert.equal(card.includes("const path = listingPath(listing)"), true);
assert.equal(royalBranch.includes("href={path}"), true);
assert.equal(royalBranch.includes("Listed by"), true);
assert.equal(royalBranch.includes("Photograph not on file"), true);
assert.equal(royalBranch.includes("Price not on file"), true);
assert.equal(royalBranch.includes("/design/"), false);
assert.equal(royalBranch.includes("/api/listings"), false);
assert.equal(card.includes("brokerage stays on listing detail"), true);

const searchPage = read("src/app/(marketing)/search/page.tsx");
assert.equal(searchPage.includes("isHighOctaneConceptFixture"), true);
assert.equal(searchPage.includes("RoyalCollectionSearchDemonstration"), true);
assert.equal(searchPage.includes('await import("./search-operational")'), true);
assert.equal(searchPage.includes("RoyalCollectionSyntheticSearch"), false);

const operational = read("src/app/(marketing)/search/search-operational.tsx");
assert.equal(operational.includes("SearchExperience"), true);
assert.equal(operational.includes("RoyalCollectionSyntheticSearch"), false);
assert.equal(operational.includes("/design/search"), false);

const harness = read("src/app/(marketing)/design/search/page.tsx");
assert.equal(harness.includes("highOctaneStagingPropertyConceptAllowed"), true);
assert.equal(harness.includes("notFound"), true);
assert.equal(harness.includes("prisma"), false);
assert.equal(harness.includes("/api/listings"), false);
assert.equal(harness.includes("loadListingForDetailPage"), false);
assert.equal(harness.includes("SearchExperience"), false);

const sample = read("src/components/templates/royal-collection-one/RoyalCollectionSyntheticSearch.tsx");
assert.equal(sample.includes("SYNTHETIC TEST DATA — NOT MLS LISTINGS"), true);
assert.equal(sample.includes("Photograph not on file"), true);
assert.equal(sample.includes("Listed by"), true);
assert.equal(sample.includes("Price not on file"), true);
assert.equal(sample.includes("Save disabled"), true);
assert.equal(sample.includes("fetch("), false);
assert.equal(sample.includes("/api/"), false);
assert.equal(sample.includes("prisma"), false);
assert.equal(sample.includes("listingPath"), false);
assert.equal(sample.includes("/listing/"), false);
assert.equal(sample.includes("/design/property"), false);

const touched = [card, searchPage, operational, harness, sample].join("\n");
for (const mls of forbiddenMls) {
  assert.equal(touched.includes(mls), false, mls);
}

assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: stagingReady,
  }),
  true,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: "houzzat",
    env: stagingReady,
  }),
  false,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: { ...stagingReady, NODE_ENV: "production" },
  }),
  false,
);

console.log("royal-collection-search-operational-selftest: ok");

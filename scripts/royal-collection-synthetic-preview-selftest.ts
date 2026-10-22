/**
 * Synthetic Royal Collection preview contract.
 * Does not read a database or request a listing.
 * Run: pnpm exec tsx scripts/royal-collection-synthetic-preview-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import { buildRoyalCollectionListingModel } from "../src/lib/tenancy/templates/royal-collection-property-model";
import { selectRoyalCollectionOperationalPresentation } from "../src/lib/tenancy/templates/royal-collection-operational-listing";
import {
  ROYAL_COLLECTION_SYNTHETIC_BANNER,
  buildRoyalCollectionSyntheticPreview,
  resolveRoyalCollectionSyntheticCase,
  royalCollectionSyntheticListingSource,
} from "../src/lib/tenancy/templates/royal-collection-synthetic-preview";

const root = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(root, "..", path), "utf8");

const stagingReady = {
  NODE_ENV: "development",
  STAGING_DATABASE_URL: "postgresql://staging.example/neondb",
  DATABASE_URL: "postgresql://production.example/neondb",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
};

const site = {
  agentName: "Saad Qureshi",
  brandName: "HIGH OCTANE Real Estate",
  brokerageName: "Right at Home Realty Brokerage",
  phone: "289-501-7755",
  email: "saad@highoctaneniagara.ca",
};

const forbiddenMls = ["X12935628", "X13744972", "X13717936", "N13526934", "X13542440"];

assert.equal(resolveRoyalCollectionSyntheticCase(undefined), "complete");
assert.equal(resolveRoyalCollectionSyntheticCase([]), "complete");
assert.equal(resolveRoyalCollectionSyntheticCase(["single"]), "single");
assert.equal(resolveRoyalCollectionSyntheticCase(["none"]), "none");
assert.equal(resolveRoyalCollectionSyntheticCase(["sparse"]), "sparse");
assert.equal(resolveRoyalCollectionSyntheticCase(["X12935628"]), null);
assert.equal(resolveRoyalCollectionSyntheticCase(["complete", "extra"]), null);

const complete = buildRoyalCollectionSyntheticPreview("complete");
const completeText = JSON.stringify(complete);
assert.equal(complete.kind, "listing");
assert.equal(complete.kicker, ROYAL_COLLECTION_SYNTHETIC_BANNER);
assert.equal(completeText.includes("13,500,000"), true);
assert.equal(completeText.includes("$13.5 million"), true);
assert.equal(completeText.includes("Illustrative"), true);
assert.equal(completeText.includes("000 Illustration Lane"), true);
assert.equal(completeText.includes("5"), true);
assert.equal(complete.frames.length, 3);
assert.equal(complete.frames.every((frame) => frame.src.startsWith("/images/")), true);
assert.equal(complete.rooms?.rows.some((row) => row.value === "24 x 18"), true);
assert.equal(complete.overview?.paragraphs[0]?.includes("Illustrative description"), true);
assert.equal(complete.highlights?.items.some((item) => item.copy.includes("Illustrative")), true);
assert.equal(complete.attribution?.paragraphs[0]?.includes("Listed by Fictional Harbour Realty"), true);
assert.equal(
  complete.attribution?.paragraphs[0]?.includes("website brokerage is not the listing brokerage"),
  true,
);
assert.equal(complete.contact.agentName, "Saad Qureshi");
assert.equal(complete.contact.brandName, "HIGH OCTANE Real Estate");
assert.equal(complete.contact.brokerageName, "Right at Home Realty Brokerage");
assert.equal(complete.contact.phone, "289-501-7755");
assert.equal(completeText.includes("unsplash"), false);
assert.equal(completeText.includes("HIGH OCTANE's listing"), false);

assert.equal(buildRoyalCollectionSyntheticPreview("single").frames.length, 1);
assert.equal(buildRoyalCollectionSyntheticPreview("none").frames.length, 0);

const sparse = buildRoyalCollectionSyntheticPreview("sparse");
const sparseText = JSON.stringify(sparse);
assert.equal(sparse.facts.some((fact) => fact.label === "Asking"), false);
assert.equal(sparse.facts.some((fact) => fact.label === "Interior"), false);
assert.equal(sparse.facts.some((fact) => fact.label === "Lot"), false);
assert.equal(sparse.rooms, null);
assert.equal(sparse.overview, null);
assert.equal(sparse.highlights, null);
assert.equal(sparse.location, null);
assert.equal(sparse.frames.length, 0);
assert.equal(sparseText.includes("13,500,000"), false);
assert.equal(sparse.kicker, ROYAL_COLLECTION_SYNTHETIC_BANNER);
assert.equal(sparse.attribution?.paragraphs[0]?.includes("Fictional Harbour Realty"), true);

const source = royalCollectionSyntheticListingSource("complete");
const anonymous = buildRoyalCollectionListingModel({
  listing: source,
  photos: complete.frames.map((frame) => ({ url: frame.src })),
  viewer: { signedIn: false, detailsLocked: false },
  site,
});
const anonymousText = JSON.stringify(anonymous);
assert.equal(anonymous.kind, "withheld");
assert.equal(anonymousText.includes("000 Illustration Lane"), false);
assert.equal(anonymousText.includes("13,500,000"), false);
assert.equal(anonymousText.includes("hero-luxury"), false);
assert.equal(anonymousText.includes("Fictional Harbour Realty"), false);
assert.equal(anonymousText.includes("SAMPLE-NOT-MLS"), false);
assert.equal(anonymousText.includes("Illustrative description"), false);

const locked = buildRoyalCollectionListingModel({
  listing: source,
  photos: complete.frames.map((frame) => ({ url: frame.src })),
  viewer: { signedIn: true, detailsLocked: true },
  site,
});
const lockedText = JSON.stringify(locked);
assert.equal(lockedText.includes("000 Illustration Lane"), false);
assert.equal(lockedText.includes("hero-luxury"), false);
assert.equal(lockedText.includes("Illustrative description"), false);
assert.equal(locked.rooms, null);
assert.equal(locked.facts.some((fact) => fact.label === "City"), true);
assert.equal(locked.attribution?.paragraphs[0]?.includes("Fictional Harbour Realty"), true);

assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: "houzzat",
    listingFound: true,
    env: stagingReady,
  }),
  "standard",
);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: "another-tenant",
    listingFound: true,
    env: stagingReady,
  }),
  "standard",
);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    listingFound: true,
    env: { ...stagingReady, NODE_ENV: "production" },
  }),
  "standard",
);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    listingFound: true,
    env: stagingReady,
  }),
  "royal-collection",
);

const operational = read("src/app/(marketing)/listing/[...parts]/listing-operational.tsx");
const listingPage = read("src/app/(marketing)/listing/[...parts]/page.tsx");
const harnessPage = read(
  "src/app/(marketing)/design/property/synthetic/[[...case]]/page.tsx",
);
const harnessView = read(
  "src/components/templates/royal-collection-one/RoyalCollectionSyntheticPreview.tsx",
);
const harnessModel = read(
  "src/lib/tenancy/templates/royal-collection-synthetic-preview.ts",
);
const conceptPage = read("src/app/(marketing)/design/property/page.tsx");

assert.ok(operational.includes("loadListingForDetailPage"));
assert.ok(operational.includes("<ListingDetailView"));
assert.ok(
  operational.indexOf("if (!listing) notFound()") <
    operational.indexOf("selectRoyalCollectionOperationalPresentation({"),
);
assert.equal(operational.includes("RoyalCollectionSyntheticPreview"), false);
assert.equal(operational.includes("design/property/synthetic"), false);
assert.equal(operational.includes("SAMPLE-NOT-MLS"), false);
assert.equal(listingPage.includes("RoyalCollectionSyntheticPreview"), false);
assert.equal(listingPage.includes("design/property/synthetic"), false);
assert.ok(conceptPage.includes("RoyalCollectionPropertyDemonstration"));
assert.equal(conceptPage.includes("RoyalCollectionSyntheticPreview"), false);

assert.ok(harnessPage.includes("highOctaneStagingPropertyConceptAllowed"));
assert.ok(harnessPage.includes("notFound"));
assert.equal(harnessPage.includes("searchParams"), false);
assert.equal(harnessPage.includes("loadListingForDetailPage"), false);
assert.equal(harnessPage.includes("prisma"), false);
assert.equal(harnessPage.includes("ViewingRequestPanel"), false);
assert.equal(harnessPage.includes("ListingAccessGate"), false);
assert.equal(harnessView.includes("ViewingRequestPanel"), false);
assert.equal(harnessView.includes("ListingAccessGate"), false);
assert.equal(harnessView.includes("disabled"), true);
assert.equal(harnessModel.includes("prisma."), false);
assert.equal(harnessModel.includes('from "@/lib/prisma"'), false);
assert.equal(harnessModel.includes("fetch("), false);

for (const file of [operational, listingPage, harnessPage, harnessView, harnessModel]) {
  for (const mls of forbiddenMls) assert.equal(file.includes(mls), false);
}

console.log("royal-collection-synthetic-preview-selftest: ok");

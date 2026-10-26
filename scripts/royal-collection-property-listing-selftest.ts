/**
 * Royal Collection operational property model.
 * Synthetic listings only. Does not read a database.
 * Run: pnpm exec tsx scripts/royal-collection-property-listing-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import {
  royalListingGalleryLayout,
  royalListingGalleryTileCount,
} from "../src/lib/tenancy/templates/royal-collection-gallery-layout";
import { buildRoyalCollectionListingModel } from "../src/lib/tenancy/templates/royal-collection-property-model";
import { selectRoyalCollectionOperationalPresentation } from "../src/lib/tenancy/templates/royal-collection-operational-listing";
import type { RoyalCollectionListingSource } from "../src/lib/tenancy/templates/royal-collection-property-model";

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

function listing(overrides: Partial<RoyalCollectionListingSource> = {}): RoyalCollectionListingSource {
  return {
    mlsNumber: "SYNTH100",
    addressLine: "14 Hidden Cedar",
    city: "Niagara Falls",
    community: "Example Heights",
    province: "ON",
    postalCode: "L2E 1A1",
    listPrice: 1250000,
    beds: 4,
    baths: 3,
    propertyType: "DETACHED",
    sqft: 3200,
    parkingSpaces: 2,
    description: "A recorded description.\n\nSecond paragraph.",
    lat: 43.1,
    lng: -79.1,
    brokerageName: "North Shore Realty",
    transactionType: "SALE",
    facts: {
      lotSizeArea: 40,
      lotSizeUnits: "ft",
      interiorFeatures: ["Stone counters"],
      exteriorFeatures: ["Covered porch"],
    },
    rooms: [
      { roomType: "Kitchen", roomLevel: "Main", dimensions: "12 x 14" },
      { roomType: "Primary bedroom", dimensions: "16 x 18" },
    ],
    ...overrides,
  };
}

const photos = [
  { url: "https://example.test/one.jpg" },
  { url: "https://example.test/two.jpg" },
  { url: "https://example.test/three.jpg" },
];

function fact(model: { facts: readonly { label: string; value: string }[] }, label: string) {
  return model.facts.find((row) => row.label === label)?.value ?? null;
}

assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    listingFound: false,
    env: stagingReady,
  }),
  "not-found",
);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    listingFound: true,
    env: stagingReady,
  }),
  "royal-collection",
);
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
    env: { ...stagingReady, HIGH_OCTANE_STAGING: undefined },
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

const complete = buildRoyalCollectionListingModel({
  listing: listing(),
  photos,
  viewer: { signedIn: true, detailsLocked: false },
  site,
});
assert.equal(complete.kind, "listing");
assert.equal(fact(complete, "Address")?.includes("14 Hidden Cedar"), true);
assert.equal(fact(complete, "City"), "Niagara Falls");
assert.equal(fact(complete, "Asking")?.includes("1,250,000"), true);
assert.equal(fact(complete, "Bedrooms"), "4");
assert.equal(fact(complete, "Bathrooms"), "3");
assert.equal(fact(complete, "Type"), "Detached");
assert.equal(fact(complete, "Interior")?.includes("3,200"), true);
assert.equal(fact(complete, "Lot"), "40 ft");
assert.equal(complete.frames.length, 3);
assert.equal(complete.overview?.paragraphs.length, 2);
assert.equal(complete.highlights?.items.length, 2);
assert.equal(complete.rooms?.rows.length, 2);
assert.equal(complete.location?.detail.includes("43.10000"), true);
assert.equal(complete.attribution?.paragraphs[0]?.includes("Listed by North Shore Realty"), true);
assert.equal(complete.attribution?.paragraphs[0]?.includes("website brokerage is not the listing brokerage"), true);
assert.equal(JSON.stringify(complete).includes("HIGH OCTANE's listing"), false);
assert.equal(complete.contact.agentName, "Saad Qureshi");
assert.equal(complete.contact.phone, "289-501-7755");
assert.equal(complete.contact.email, "saad@highoctaneniagara.ca");

const missing = buildRoyalCollectionListingModel({
  listing: listing({
    listPrice: null,
    sqft: null,
    facts: null,
    rooms: [],
    description: "   ",
    lat: null,
    lng: null,
    parkingSpaces: null,
    community: null,
  }),
  photos: [],
  viewer: { signedIn: true, detailsLocked: false },
  site,
});
assert.equal(fact(missing, "Asking"), null);
assert.equal(fact(missing, "Interior"), null);
assert.equal(fact(missing, "Lot"), null);
assert.equal(missing.frames.length, 0);
assert.equal(missing.rooms, null);
assert.equal(missing.overview, null);
assert.equal(missing.highlights, null);
assert.equal(missing.location, null);
assert.equal(missing.outdoor, null);
assert.equal(fact(missing, "Address")?.includes("14 Hidden Cedar"), true);

const onePhoto = buildRoyalCollectionListingModel({
  listing: listing(),
  photos: photos.slice(0, 1),
  viewer: { signedIn: true, detailsLocked: false },
  site,
});
assert.equal(onePhoto.frames.length, 1);

const anonymous = buildRoyalCollectionListingModel({
  listing: listing(),
  photos,
  viewer: { signedIn: false, detailsLocked: false },
  site,
});
const anonymousText = JSON.stringify(anonymous);
assert.equal(anonymous.kind, "withheld");
assert.equal(anonymous.frames.length, 0);
assert.equal(anonymousText.includes("14 Hidden Cedar"), false);
assert.equal(anonymousText.includes("1,250,000"), false);
assert.equal(anonymousText.includes("example.test"), false);
assert.equal(anonymousText.includes("North Shore Realty"), false);
assert.equal(anonymousText.includes("SYNTH100"), false);
assert.equal(anonymous.contact.agentName, "Saad Qureshi");

const locked = buildRoyalCollectionListingModel({
  listing: listing(),
  photos,
  viewer: { signedIn: true, detailsLocked: true },
  site,
});
const lockedText = JSON.stringify(locked);
assert.equal(lockedText.includes("14 Hidden Cedar"), false);
assert.equal(lockedText.includes("example.test"), false);
assert.equal(lockedText.includes("A recorded description"), false);
assert.equal(locked.rooms, null);
assert.equal(fact(locked, "City"), "Niagara Falls");
assert.equal(locked.attribution?.paragraphs[0]?.includes("North Shore Realty"), true);

const operational = read("src/app/(marketing)/listing/[...parts]/listing-operational.tsx");
assert.ok(operational.includes("if (!listing) notFound()"));
assert.ok(
  operational.indexOf("if (!listing) notFound()") <
    operational.indexOf("selectRoyalCollectionOperationalPresentation({"),
);
assert.ok(
  operational.indexOf("vowBlocked") <
    operational.indexOf("selectRoyalCollectionOperationalPresentation({"),
);
assert.ok(
  operational.indexOf("serializeListingDetailClientModel") <
    operational.indexOf("buildRoyalCollectionListingModel"),
);
assert.ok(operational.includes("listing: listingForClient"));
assert.ok(operational.includes("<ListingDetailView"));
assert.ok(operational.includes("<RoyalCollectionOperationalProperty"));

const renderer = read(
  "src/components/templates/royal-collection-one/RoyalCollectionOperationalProperty.tsx",
);
assert.equal(renderer.includes("loadListingForDetailPage"), false);
assert.equal(renderer.includes("prisma"), false);
assert.equal(renderer.includes("fetch("), false);
assert.ok(renderer.includes("ListingAccessGate"));
assert.ok(renderer.includes("ViewingRequestPanel"));

const modelSource = read("src/lib/tenancy/templates/royal-collection-property-model.ts");
const gateSource = read("src/lib/tenancy/templates/royal-collection-operational-listing.ts");
const viewSource = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPropertyView.tsx",
);
const gallerySource = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPropertyGallery.tsx",
);
for (const source of [modelSource, gateSource, viewSource, gallerySource, renderer, operational]) {
  assert.equal(source.includes("X12935628"), false);
  assert.equal(source.includes("X13744972"), false);
  assert.equal(source.includes("X13717936"), false);
  assert.equal(source.includes("N13526934"), false);
  assert.equal(source.includes("X13542440"), false);
}
assert.equal(modelSource.includes('from "@/lib/prisma"'), false);
assert.equal(modelSource.includes("prisma."), false);
assert.equal(modelSource.includes("fetch("), false);
assert.equal(viewSource.includes("loadListingForDetailPage"), false);
assert.ok(gallerySource.includes('presentation === "listing"'));
assert.ok(gallerySource.includes("ArrowLeft"));
assert.ok(gallerySource.includes("data-rc-allow"));
assert.ok(gallerySource.includes("No photograph is part of this concept."));
assert.ok(gallerySource.includes("View All Photos"));
assert.ok(gallerySource.includes("Previous"));
assert.ok(gallerySource.includes("Escape"));
assert.ok(gallerySource.includes("data-gallery-layout"));
assert.equal(gallerySource.includes("unsplash"), false);
assert.equal(gallerySource.includes("demoPropertyImageUrl"), false);
assert.equal(royalListingGalleryLayout(0), "none");
assert.equal(royalListingGalleryLayout(1), "one");
assert.equal(royalListingGalleryLayout(2), "two");
assert.equal(royalListingGalleryLayout(3), "three");
assert.equal(royalListingGalleryLayout(4), "four");
assert.equal(royalListingGalleryLayout(5), "five");
assert.equal(royalListingGalleryLayout(12), "five");
assert.equal(royalListingGalleryTileCount(0), 0);
assert.equal(royalListingGalleryTileCount(2), 2);
assert.equal(royalListingGalleryTileCount(4), 4);
assert.equal(royalListingGalleryTileCount(12), 5);

const concept = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPropertyDemonstration.tsx",
);
assert.ok(concept.includes("Design Concept — Not an MLS Listing"));
assert.equal(concept.includes("ViewingRequestPanel"), false);
assert.equal(concept.includes("ListingAccessGate"), false);
assert.equal(concept.includes("loadListingForDetailPage"), false);

const css = read("src/components/templates/royal-collection-one/royal-property.module.css");
assert.ok(css.includes("prefers-reduced-motion"));
assert.ok(css.includes("min-height: 44px"));
assert.ok(css.includes("--mobile-bottom-nav"));

console.log("royal-collection-property-listing-selftest: ok");

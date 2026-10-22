/**
 * Deterministic display samples for the staging property harness.
 * These objects are not listings, and this module does not query a database.
 */
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import {
  buildRoyalCollectionListingModel,
  type RoyalCollectionListingSource,
  type RoyalCollectionPropertyModel,
} from "@/lib/tenancy/templates/royal-collection-property-model";

export const ROYAL_COLLECTION_SYNTHETIC_BANNER =
  "SYNTHETIC TEST DATA — NOT AN MLS LISTING" as const;

export const ROYAL_COLLECTION_SYNTHETIC_CASES = [
  "complete",
  "single",
  "none",
  "sparse",
] as const;

export type RoyalCollectionSyntheticCase =
  (typeof ROYAL_COLLECTION_SYNTHETIC_CASES)[number];

const LOCAL_STUDIES = [
  {
    url: "/images/home-preview/hero-luxury-residence.jpg",
    label: "Illustrative study 1",
  },
  {
    url: "/images/home-preview/hero-luxury-home.jpg",
    label: "Illustrative study 2",
  },
  {
    url: "/images/agent-signature-sell-architecture.jpg",
    label: "Illustrative study 3",
  },
] as const;

const SITE = {
  agentName: HIGH_OCTANE_PREVIEW_FIXTURE.agentName,
  brandName: HIGH_OCTANE_PREVIEW_FIXTURE.brandName,
  brokerageName: HIGH_OCTANE_PREVIEW_FIXTURE.brokerageName,
  phone: HIGH_OCTANE_PREVIEW_FIXTURE.phone,
  email: HIGH_OCTANE_PREVIEW_FIXTURE.email,
};

export function resolveRoyalCollectionSyntheticCase(
  parts: readonly string[] | undefined,
): RoyalCollectionSyntheticCase | null {
  if (!parts || parts.length === 0) return "complete";
  if (parts.length !== 1) return null;
  const value = parts[0];
  if (
    value === "complete" ||
    value === "single" ||
    value === "none" ||
    value === "sparse"
  ) {
    return value;
  }
  return null;
}

export function royalCollectionSyntheticListingSource(
  caseId: RoyalCollectionSyntheticCase,
): RoyalCollectionListingSource {
  if (caseId === "sparse") {
    return {
      mlsNumber: "SAMPLE-NOT-MLS",
      addressLine: "000 Illustration Lane",
      city: "Fictional Harbour",
      province: "ON",
      beds: 5,
      baths: 6,
      propertyType: "DETACHED",
      brokerageName: "Fictional Harbour Realty",
      transactionType: "SALE",
    };
  }
  return {
    mlsNumber: "SAMPLE-NOT-MLS",
    addressLine: "000 Illustration Lane",
    city: "Fictional Harbour",
    community: "Sample Shore",
    province: "ON",
    postalCode: "A0A 0A0",
    listPrice: 13_500_000,
    beds: 5,
    baths: 6,
    propertyType: "DETACHED",
    sqft: 8400,
    parkingSpaces: 3,
    description:
      "Illustrative description of a fictional residence. This paragraph is not a listing remark.",
    brokerageName: "Fictional Harbour Realty",
    transactionType: "SALE",
    facts: {
      lotSizeArea: 120,
      lotSizeUnits: "ft",
      interiorFeatures: ["Illustrative stone hall"],
      exteriorFeatures: ["Illustrative garden court"],
    },
    rooms: [
      { roomType: "Great room", roomLevel: "Main", dimensions: "24 x 18" },
      { roomType: "Primary suite", roomLevel: "Second", dimensions: "20 x 16" },
    ],
  };
}

function studiesFor(caseId: RoyalCollectionSyntheticCase) {
  if (caseId === "single") return LOCAL_STUDIES.slice(0, 1);
  if (caseId === "none" || caseId === "sparse") return [];
  return LOCAL_STUDIES;
}

/**
 * Build a visible sample. The signed-in flag only fills the display model.
 * It does not read a session and it does not grant listing access.
 */
export function buildRoyalCollectionSyntheticPreview(
  caseId: RoyalCollectionSyntheticCase,
): RoyalCollectionPropertyModel {
  const model = buildRoyalCollectionListingModel({
    listing: royalCollectionSyntheticListingSource(caseId),
    photos: studiesFor(caseId),
    viewer: { signedIn: true, detailsLocked: false },
    site: SITE,
  });
  const lede =
    caseId === "sparse"
      ? "Optional price, size, rooms, description, features, and photographs are omitted on purpose. Every remaining fact is illustrative."
      : "Illustrative test price of $13.5 million. Every fact on this page is synthetic.";
  return {
    ...model,
    kicker: ROYAL_COLLECTION_SYNTHETIC_BANNER,
    title: "The illustration residence.",
    lede,
    facts: [
      { label: "Sample", value: "Illustrative — not an MLS record" },
      ...model.facts,
    ],
  };
}

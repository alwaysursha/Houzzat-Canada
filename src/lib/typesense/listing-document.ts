import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";

export type ListingForTypesense = {
  mlsNumber: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  province: string;
  status: string;
  segment: string;
  transactionType: string;
  propertyType: string;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  listedAt: Date;
  updatedAtMls: Date;
  daysOnMarket: number;
  brokerageName: string;
  lat: number;
  lng: number;
  facts?: unknown;
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
  /** Upcoming open houses (already filtered to endsAt >= now). */
  openHouses?: Array<{ startsAt: Date; endsAt: Date }>;
};

/** Document shape matching the Typesense `listings` collection schema. */
export type TypesenseListingDocument = {
  id: string;
  mlsNumber: string;
  addressLine: string;
  unitNumber?: string;
  city: string;
  community?: string;
  postalCode?: string;
  province: string;
  status: string;
  segment: string;
  transactionType: string;
  propertyType: string;
  listPrice: number;
  soldPrice?: number;
  beds: number;
  /** Display beds e.g. "3+3"; optional until collection schema is patched. */
  bedsLabel?: string;
  baths: number;
  /** PropTx LivingAreaRange when exact sqft is unavailable. */
  livingAreaRange?: string;
  sqft?: number;
  parkingSpaces: number;
  listedAt: number;
  updatedAtMls: number;
  daysOnMarket: number;
  brokerageName?: string;
  coverImageUrl?: string;
  location: [number, number];
  /** Upcoming OH start times (unix seconds). Empty when none. */
  openHouseStartsAt: number[];
  openHouseEndsAt: number[];
  /** Soonest upcoming start; 0 when none (excluded by filters). */
  nextOpenHouseStartsAt: number;
};

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function pickCoverImageUrl(
  media: ListingForTypesense["media"],
): string | undefined {
  const primary = media.find((m) => m.isPrimary);
  const first = media[0];
  const url = (primary ?? first)?.url?.trim();
  return url || undefined;
}

const MAX_OPEN_HOUSES = 8;

export function listingToTypesenseDocument(
  listing: ListingForTypesense,
): TypesenseListingDocument {
  const coverImageUrl = pickCoverImageUrl(listing.media);
  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = (listing.openHouses ?? [])
    .filter((oh) => toUnixSeconds(oh.endsAt) >= nowSec)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_OPEN_HOUSES);
  const openHouseStartsAt = upcoming.map((oh) => toUnixSeconds(oh.startsAt));
  const openHouseEndsAt = upcoming.map((oh) => toUnixSeconds(oh.endsAt));

  const doc: TypesenseListingDocument = {
    id: listing.mlsNumber,
    mlsNumber: listing.mlsNumber,
    addressLine: listing.addressLine,
    city: listing.city,
    province: listing.province,
    status: listing.status,
    segment: listing.segment,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    listPrice: listing.listPrice,
    beds: listing.beds,
    baths: listing.baths,
    parkingSpaces: listing.parkingSpaces,
    listedAt: toUnixSeconds(listing.listedAt),
    updatedAtMls: toUnixSeconds(listing.updatedAtMls),
    daysOnMarket: listing.daysOnMarket,
    location: [listing.lat, listing.lng],
    openHouseStartsAt,
    openHouseEndsAt,
    nextOpenHouseStartsAt: openHouseStartsAt[0] ?? 0,
  };

  if (listing.unitNumber) doc.unitNumber = listing.unitNumber;
  if (listing.community) doc.community = listing.community;
  if (listing.postalCode) doc.postalCode = listing.postalCode;
  if (listing.soldPrice != null) doc.soldPrice = listing.soldPrice;
  if (listing.sqft != null) doc.sqft = listing.sqft;
  if (listing.brokerageName) doc.brokerageName = listing.brokerageName;
  if (coverImageUrl) doc.coverImageUrl = coverImageUrl;

  const facts = parseListingFacts(listing.facts);
  const bedsLabel = formatBedsPlusLabel(listing.beds, facts);
  if (bedsLabel) doc.bedsLabel = bedsLabel;
  const livingAreaRange = facts?.livingAreaRange?.trim();
  if (livingAreaRange) doc.livingAreaRange = livingAreaRange;

  return doc;
}

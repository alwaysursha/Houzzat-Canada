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
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
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
  baths: number;
  sqft?: number;
  parkingSpaces: number;
  listedAt: number;
  updatedAtMls: number;
  daysOnMarket: number;
  brokerageName?: string;
  coverImageUrl?: string;
  location: [number, number];
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

export function listingToTypesenseDocument(
  listing: ListingForTypesense,
): TypesenseListingDocument {
  const coverImageUrl = pickCoverImageUrl(listing.media);
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
  };

  if (listing.unitNumber) doc.unitNumber = listing.unitNumber;
  if (listing.community) doc.community = listing.community;
  if (listing.postalCode) doc.postalCode = listing.postalCode;
  if (listing.soldPrice != null) doc.soldPrice = listing.soldPrice;
  if (listing.sqft != null) doc.sqft = listing.sqft;
  if (listing.brokerageName) doc.brokerageName = listing.brokerageName;
  if (coverImageUrl) doc.coverImageUrl = coverImageUrl;

  return doc;
}

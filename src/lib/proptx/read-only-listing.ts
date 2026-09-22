import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
  Prisma,
} from "@prisma/client";
import type { ListingCard, ListingDetail } from "@/lib/listings/types";
import {
  mapPropertyToListingResult,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";

type ReadablePropTxListing = {
  mlsNumber: string;
  listingKey: string | null;
  status: ListingStatus;
  segment: ListingSegment;
  transactionType: ListingTransactionType;
  propertyType: PropertyType;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  yearBuilt: number | null;
  taxes: number | null;
  maintenanceFee: number | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  province: string;
  lat: number;
  lng: number;
  description: string;
  brokerageName: string;
  facts: Prisma.JsonValue;
  listedAt: Date;
  soldAt: Date | null;
  updatedAtMls: Date;
  daysOnMarket: number;
};

function readablePropTxListing(row: PropTxProperty): ReadablePropTxListing | null {
  const mapped = mapPropertyToListingResult(row);
  if (!mapped.ok) return null;
  const data = mapped.data;
  if (
    !data.mlsNumber ||
    !data.status ||
    !data.segment ||
    !data.transactionType ||
    !data.propertyType ||
    data.listPrice == null ||
    data.beds == null ||
    data.baths == null ||
    data.parkingSpaces == null ||
    !data.addressLine ||
    !data.city ||
    !data.province ||
    !data.brokerageName ||
    data.lat == null ||
    data.lng == null ||
    data.daysOnMarket == null ||
    !(data.listedAt instanceof Date)
  ) {
    return null;
  }
  return {
    mlsNumber: data.mlsNumber,
    listingKey: data.listingKey ?? null,
    status: data.status,
    segment: data.segment,
    transactionType: data.transactionType,
    propertyType: data.propertyType,
    listPrice: data.listPrice,
    soldPrice: data.soldPrice ?? null,
    beds: data.beds,
    baths: data.baths,
    sqft: data.sqft ?? null,
    parkingSpaces: data.parkingSpaces,
    yearBuilt: data.yearBuilt ?? null,
    taxes: data.taxes ?? null,
    maintenanceFee: data.maintenanceFee ?? null,
    addressLine: data.addressLine,
    unitNumber: data.unitNumber ?? null,
    city: data.city,
    community: data.community ?? null,
    postalCode: data.postalCode ?? null,
    province: data.province,
    lat: data.lat,
    lng: data.lng,
    description: data.description ?? "",
    brokerageName: data.brokerageName,
    facts: jsonValue(data.facts),
    listedAt: data.listedAt,
    soldAt: data.soldAt instanceof Date ? data.soldAt : null,
    updatedAtMls:
      data.updatedAtMls instanceof Date ? data.updatedAtMls : data.listedAt,
    daysOnMarket: data.daysOnMarket,
  };
}

function jsonValue(value: unknown): Prisma.JsonValue {
  if (value == null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value as Prisma.JsonArray;
  if (typeof value === "object") return value as Prisma.JsonObject;
  return null;
}

/** Search card from a PropTx row. Nothing is written. */
export function listingCardFromPropTx(row: PropTxProperty): ListingCard | null {
  const data = readablePropTxListing(row);
  if (!data) return null;
  return {
    mlsNumber: data.mlsNumber,
    status: data.status,
    segment: data.segment,
    transactionType: data.transactionType,
    propertyType: data.propertyType,
    listPrice: data.listPrice,
    soldPrice: data.soldPrice ?? null,
    beds: data.beds,
    baths: data.baths,
    sqft: data.sqft ?? null,
    parkingSpaces: data.parkingSpaces,
    addressLine: data.addressLine,
    unitNumber: data.unitNumber ?? null,
    city: data.city,
    community: data.community ?? null,
    postalCode: data.postalCode ?? null,
    province: data.province,
    brokerageName: data.brokerageName,
    lat: data.lat,
    lng: data.lng,
    primaryImageUrl: null,
    imageUrls: [],
    openHouses: [],
    daysOnMarket: data.daysOnMarket,
    listedAt: data.listedAt.toISOString(),
    updatedAtMls: data.updatedAtMls.toISOString(),
    soldAt: data.soldAt ? data.soldAt.toISOString() : null,
    isMock: false,
    dataSource: "mls",
  };
}

/**
 * In-memory listing for a detail miss. Not inserted.
 * Photos stay empty; the live gallery route still reads PropTx for saved rows.
 */
export function transientListingDetailFromPropTx(
  row: PropTxProperty,
  provenance?: { organizationId: string | null; providerKey: string | null },
): ListingDetail | null {
  const data = readablePropTxListing(row);
  if (!data) return null;
  return {
    id: `live:${data.mlsNumber}`,
    mlsNumber: data.mlsNumber,
    listingKey: data.listingKey ?? null,
    status: data.status,
    segment: data.segment,
    transactionType: data.transactionType,
    dataSource: "mls",
    propertyType: data.propertyType,
    listPrice: data.listPrice,
    soldPrice: data.soldPrice ?? null,
    beds: data.beds,
    baths: data.baths,
    sqft: data.sqft ?? null,
    parkingSpaces: data.parkingSpaces,
    yearBuilt: data.yearBuilt ?? null,
    taxes: data.taxes ?? null,
    maintenanceFee: data.maintenanceFee ?? null,
    addressLine: data.addressLine,
    unitNumber: data.unitNumber ?? null,
    city: data.city,
    community: data.community ?? null,
    postalCode: data.postalCode ?? null,
    province: data.province,
    lat: data.lat,
    lng: data.lng,
    description: data.description ?? "",
    brokerageName: data.brokerageName,
    facts: data.facts,
    listedAt: data.listedAt,
    soldAt: data.soldAt,
    updatedAtMls: data.updatedAtMls,
    photosChangeTimestamp: null,
    mediaSourceTimestamp: null,
    mediaSyncedAt: null,
    daysOnMarket: data.daysOnMarket,
    addressHistoryEnrichedAt: null,
    isMock: false,
    organizationId: provenance?.organizationId ?? null,
    providerKey: provenance?.providerKey ?? null,
    ownerUserId: null,
    ownerStatus: null,
    listedUntil: null,
    ownerReviewedAt: null,
    ownerReviewedById: null,
    ownerReviewNote: null,
    createdAt: data.listedAt,
    updatedAt: data.listedAt,
    media: [],
    openHouses: [],
    history: [],
    rooms: [],
  };
}

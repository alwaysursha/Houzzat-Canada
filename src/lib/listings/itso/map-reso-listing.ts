/**
 * Maps a RESO Property, Media, and OpenHouse package into the existing
 * HouzzatPRO listing card and detail. Royal Collection does not import this.
 */
import type { ListingFacts } from "@/lib/listings/facts";
import type { ListingCard, ListingDetail } from "@/lib/listings/types";
import type {
  ItsoDisplayAudience,
  ResoListingPackage,
  ResoPropertySubType,
  ResoStandardStatus,
} from "@/lib/listings/itso/reso-types";
import type { PropertyType } from "@prisma/client";

const AS_OF = Date.parse("2026-10-24T12:00:00.000Z");

export type ItsoMappedListing = {
  card: ListingCard;
  detail: ListingDetail;
  /** Present only for a VOW audience. IDX results leave this null. */
  vowPrivateRemarks: string | null;
};

function propertyType(subtype: ResoPropertySubType): PropertyType {
  switch (subtype) {
    case "Single Family Residence":
      return "DETACHED";
    case "Townhouse":
      return "TOWNHOUSE";
    case "Condominium":
      return "CONDO_APT";
    default: {
      const unknown: never = subtype;
      return unknown;
    }
  }
}

function listingStatus(status: ResoStandardStatus): ListingCard["status"] {
  switch (status) {
    case "Active":
      return "ACTIVE";
    case "Pending":
      return "SOLD_CONDITIONAL";
    case "Closed":
      return "SOLD";
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

function daysOnMarket(listedAt: string): number {
  const listed = Date.parse(listedAt);
  if (!Number.isFinite(listed)) return 0;
  return Math.max(0, Math.round((AS_OF - listed) / 86_400_000));
}

function sortedMedia(record: ResoListingPackage) {
  return [...record.media].sort((a, b) => a.Order - b.Order);
}

export function mapResoListingPackage(
  record: ResoListingPackage,
  audience: ItsoDisplayAudience,
): ItsoMappedListing {
  const property = record.property;
  const status = listingStatus(property.StandardStatus);
  const photos = sortedMedia(record);
  const imageUrls = photos.map((photo) => photo.MediaURL);
  const vow = audience === "vow";
  const soldPrice = vow ? (property.ClosePrice ?? null) : null;
  const listedAt = property.OnMarketDate ?? property.ListingContractDate;
  const openHouses = record.openHouses.map((openHouse) => ({
    startsAt: openHouse.OpenHouseStartTime,
    endsAt: openHouse.OpenHouseEndTime,
  }));
  const card: ListingCard = {
    mlsNumber: property.ListingId,
    status,
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    propertyType: propertyType(property.PropertySubType),
    listPrice: property.ListPrice,
    soldPrice,
    beds: property.BedroomsTotal,
    baths: property.BathroomsTotalInteger,
    sqft: property.LivingArea,
    parkingSpaces: property.ParkingTotal,
    addressLine: [property.StreetNumber, property.StreetName, property.StreetSuffix]
      .filter(Boolean)
      .join(" "),
    unitNumber: property.UnitNumber ?? null,
    city: property.City,
    community: null,
    postalCode: property.PostalCode,
    province: property.StateOrProvince,
    brokerageName: property.ListOfficeName,
    lat: property.Latitude,
    lng: property.Longitude,
    primaryImageUrl: imageUrls[0] ?? null,
    imageUrls,
    openHouses,
    daysOnMarket: daysOnMarket(listedAt),
    listedAt,
    updatedAtMls: property.ModificationTimestamp,
    soldAt: vow && property.StandardStatus === "Closed" ? property.ModificationTimestamp : null,
    isMock: true,
    dataSource: "high-octane-development",
  };
  const facts: ListingFacts = {
    waterfront: property.WaterfrontYN ?? null,
    architecturalStyle: property.ArchitecturalStyle ?? null,
    interiorFeatures: property.InteriorFeatures ?? null,
    exteriorFeatures: property.ExteriorFeatures ?? null,
    lotSizeArea: property.LotSizeArea ?? null,
    lotSizeUnits: property.LotSizeUnits ?? null,
    listAgentFullName: property.ListAgentFullName,
    propertySubType: property.PropertySubType,
    propertyClass: property.PropertyType,
    standardStatus: property.StandardStatus,
    bathsTotal: property.BathroomsTotalInteger,
  };
  const id = `itso-demo-${property.ListingKey}`;
  const listedDate = new Date(listedAt);
  const modified = new Date(property.ModificationTimestamp);
  const detail: ListingDetail = {
    id,
    mlsNumber: card.mlsNumber,
    listingKey: property.ListingKey,
    status,
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    dataSource: "high-octane-development",
    propertyType: card.propertyType,
    listPrice: card.listPrice,
    soldPrice,
    beds: card.beds,
    baths: card.baths,
    sqft: card.sqft,
    parkingSpaces: card.parkingSpaces,
    yearBuilt: property.YearBuilt ?? null,
    taxes: null,
    maintenanceFee: null,
    addressLine: card.addressLine,
    unitNumber: card.unitNumber,
    city: card.city,
    community: card.community,
    postalCode: card.postalCode,
    province: card.province,
    lat: card.lat,
    lng: card.lng,
    description: property.PublicRemarks,
    brokerageName: card.brokerageName,
    facts,
    listedAt: listedDate,
    soldAt: card.soldAt ? new Date(card.soldAt) : null,
    updatedAtMls: modified,
    photosChangeTimestamp: null,
    mediaSourceTimestamp: null,
    mediaSyncedAt: null,
    daysOnMarket: card.daysOnMarket,
    addressHistoryEnrichedAt: null,
    isMock: true,
    organizationId: null,
    providerKey: null,
    ownerUserId: null,
    ownerStatus: null,
    listedUntil: null,
    ownerReviewedAt: null,
    ownerReviewedById: null,
    ownerReviewNote: null,
    createdAt: listedDate,
    updatedAt: modified,
    media: photos.map((photo, index) => ({
      id: photo.MediaKey,
      listingId: id,
      url: photo.MediaURL,
      sortOrder: photo.Order,
      isPrimary: photo.PreferredPhotoYN === true || index === 0,
    })),
    openHouses: record.openHouses.map((openHouse) => ({
      id: openHouse.OpenHouseKey,
      listingId: id,
      startsAt: new Date(openHouse.OpenHouseStartTime),
      endsAt: new Date(openHouse.OpenHouseEndTime),
      notes: openHouse.OpenHouseRemarks ?? null,
    })),
    history: [],
    rooms: [],
  };
  switch (audience) {
    case "idx":
      return { card, detail, vowPrivateRemarks: null };
    case "vow":
      return {
        card,
        detail,
        vowPrivateRemarks: property.PrivateRemarks ?? null,
      };
    default: {
      const unknown: never = audience;
      return unknown;
    }
  }
}

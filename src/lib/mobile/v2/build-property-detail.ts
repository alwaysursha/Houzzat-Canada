/**
 * Stage 5.4 — Mobile v2 property detail DTO builder.
 * Consumer ListingDetailView / panel payload parity for agents (full MLS access).
 */

import {
  daysOnMarketFromListedAt,
  formatListingAddressOneLine,
  formatListingTiming,
  formatListPrice,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import {
  buildMobilePropertyFeatureSections,
  formatListingSqftLabel,
  formatBedsPlusLabel,
  parseListingFacts,
} from "@/lib/listings/facts";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import type { ListingDetail } from "@/lib/listings/types";
import type { ListingStatus } from "@prisma/client";

export type MobilePropertyFactRow = {
  label: string;
  value: string;
};

export type MobilePropertyFactSection = {
  id: string;
  title: string;
  rows: MobilePropertyFactRow[];
};

export type MobilePropertyDetailDto = {
  mlsNumber: string;
  listingId: string;
  status: string;
  transactionType: string;
  segment: string | null;
  propertyType: string;
  propertyTypeLabel: string;
  statusLabel: string;
  listPrice: number;
  soldPrice: number | null;
  priceLabel: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  province: string | null;
  postalCode: string | null;
  beds: number;
  baths: number;
  bedsLabel: string | null;
  sqftLabel: string | null;
  parkingSpaces: number;
  daysOnMarket: number;
  timingLabel: string;
  listedAt: string;
  soldAt: string | null;
  description: string;
  brokerageName: string | null;
  brokeragePhone: string | null;
  agentName: string | null;
  agentCellPhone: string | null;
  taxes: number | null;
  maintenanceFee: number | null;
  yearBuilt: number | null;
  lat: number;
  lng: number;
  imageUrls: string[];
  primaryImageUrl: string | null;
  openHouses: { startsAt: string; endsAt: string }[];
  featureSections: MobilePropertyFactSection[];
  mlsDisclaimer: string;
};

const MLS_DISCLAIMER =
  "MLS®, Multiple Listing Service® and the associated logos are owned or controlled by The Canadian Real Estate Association (CREA) and are used under license. Listing information is provided by TRREB members via PropTx (IDX) and is believed to be reliable but not guaranteed.";

export function buildMobilePropertyDetailDto(
  listing: ListingDetail,
): MobilePropertyDetailDto {
  const facts = parseListingFacts(listing.facts);
  const photos = resolveListingGalleryPhotos(listing);
  const imageUrls = photos
    .map((p) => p.url)
    .filter(Boolean)
    .slice(0, 15);

  const domInput = {
    listedAt: listing.listedAt,
    soldAt: listing.soldAt,
    status: listing.status,
    daysOnMarket: listing.daysOnMarket,
    transactionType: listing.transactionType,
    updatedAtMls: listing.updatedAtMls,
  };

  return {
    mlsNumber: listing.mlsNumber,
    listingId: listing.id,
    status: listing.status,
    transactionType: listing.transactionType,
    segment: listing.segment ?? null,
    propertyType: listing.propertyType,
    propertyTypeLabel: propertyTypeLabel(listing.propertyType),
    statusLabel: listingStatusLabel(listing.status, listing.transactionType),
    listPrice: listing.listPrice,
    soldPrice: listing.soldPrice,
    priceLabel: formatListPrice(listing.listPrice, listing.transactionType),
    addressLine: formatListingAddressOneLine(listing),
    unitNumber: listing.unitNumber,
    city: listing.city,
    community: listing.community,
    province: listing.province,
    postalCode: listing.postalCode,
    beds: listing.beds,
    baths: listing.baths,
    bedsLabel: formatBedsPlusLabel(listing.beds, facts),
    sqftLabel: formatListingSqftLabel({
      sqft: listing.sqft,
      livingAreaRange: facts?.livingAreaRange,
      unit: "SqFt",
    }),
    parkingSpaces: listing.parkingSpaces,
    daysOnMarket: daysOnMarketFromListedAt(domInput),
    timingLabel: formatListingTiming(domInput),
    listedAt:
      typeof listing.listedAt === "string"
        ? listing.listedAt
        : listing.listedAt.toISOString(),
    soldAt: listing.soldAt
      ? typeof listing.soldAt === "string"
        ? listing.soldAt
        : listing.soldAt.toISOString()
      : null,
    description: listing.description?.trim() ?? "",
    brokerageName: listing.brokerageName,
    brokeragePhone: facts?.listOfficePhone?.trim() || null,
    agentName: facts?.listAgentFullName?.trim() || null,
    agentCellPhone: facts?.listAgentDirectPhone?.trim() || null,
    taxes: listing.taxes,
    maintenanceFee: listing.maintenanceFee,
    yearBuilt: listing.yearBuilt,
    lat: listing.lat,
    lng: listing.lng,
    imageUrls,
    primaryImageUrl: imageUrls[0] ?? null,
    openHouses: listing.openHouses.map((oh) => ({
      startsAt: oh.startsAt.toISOString(),
      endsAt: oh.endsAt.toISOString(),
    })),
    featureSections: buildMobilePropertyFeatureSections({
      facts,
      propertyTypeLabel: propertyTypeLabel(listing.propertyType),
      city: listing.city,
      parkingSpaces: listing.parkingSpaces,
      beds: listing.beds,
      baths: listing.baths,
      taxes: listing.taxes,
      statusLabel: listingStatusLabel(listing.status, listing.transactionType),
    }),
    mlsDisclaimer: MLS_DISCLAIMER,
  };
}

/** Enrich search card with canonical consumer timing/DOM fields. */
export function enrichListingCardForMobile<
  T extends {
    mlsNumber: string;
    status: ListingStatus;
    transactionType: string;
    listedAt: string;
    soldAt: string | null;
    daysOnMarket: number;
    updatedAtMls?: string | null;
  },
>(item: T): T & { daysOnMarket: number; timingLabel: string } {
  const domInput = {
    listedAt: item.listedAt,
    soldAt: item.soldAt,
    status: item.status,
    daysOnMarket: item.daysOnMarket,
    transactionType: item.transactionType,
    updatedAtMls: item.updatedAtMls ?? null,
  };
  const daysOnMarket = daysOnMarketFromListedAt(domInput);
  return {
    ...item,
    daysOnMarket,
    timingLabel: formatListingTiming(domInput),
  };
}

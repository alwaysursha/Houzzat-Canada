/**
 * Visible facts for a Royal Collection search card.
 * The caller supplies an already-authorized result. This module does not search.
 */
import type { PropertyType } from "@prisma/client";
import {
  formatListPrice,
  formatListingAddress,
  formatListingBedsLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { formatListingSqftLabel } from "@/lib/listings/facts";

export type RoyalCollectionSearchCardSource = {
  listPrice?: number | null;
  beds?: number | null;
  bedsLabel?: string | null;
  baths?: number | null;
  sqft?: number | null;
  livingAreaRange?: string | null;
  propertyType?: PropertyType | null;
  brokerageName?: string | null;
  primaryImageUrl?: string | null;
  addressLine?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  transactionType?: string | null;
  segment?: string | null;
};

export type RoyalCollectionSearchCardFacts = {
  street: string | null;
  city: string | null;
  price: string | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  propertyType: string | null;
  brokerage: string | null;
  photoUrl: string | null;
};

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function countLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Omit a fact when the authorized result did not supply it.
 * A blank brokerage is not replaced with the website brokerage.
 */
export function royalCollectionSearchCardFacts(
  listing: RoyalCollectionSearchCardSource,
): RoyalCollectionSearchCardFacts {
  const [street, cityLine] = formatListingAddress({
    addressLine: listing.addressLine ?? "",
    unitNumber: listing.unitNumber,
    city: listing.city ?? "",
    province: listing.province,
    postalCode: listing.postalCode,
  });
  const commercial = listing.segment === "COMMERCIAL";
  const price =
    listing.listPrice != null &&
    Number.isFinite(listing.listPrice) &&
    listing.listPrice > 0
      ? formatListPrice(listing.listPrice, listing.transactionType ?? "SALE")
      : null;
  return {
    street: clean(street),
    city: clean(cityLine),
    price,
    beds: commercial ? null : listing.beds == null ? null : formatListingBedsLabel({
      beds: listing.beds,
      bedsLabel: listing.bedsLabel,
    }),
    baths: commercial ? null : countLabel(listing.baths),
    sqft: formatListingSqftLabel({
      sqft: listing.sqft,
      livingAreaRange: listing.livingAreaRange,
    }),
    propertyType: listing.propertyType ? propertyTypeLabel(listing.propertyType) : null,
    brokerage: clean(listing.brokerageName),
    photoUrl: clean(listing.primaryImageUrl),
  };
}

import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";

export const LISTING_PROVIDER =
  process.env.LISTING_PROVIDER === "proptx" ? "proptx" : "mock";

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Sale = CAD total; Lease = CAD per month. */
export function formatListPrice(
  amount: number,
  transactionType: ListingTransactionType | string = "SALE",
) {
  const base = formatPrice(amount);
  return transactionType === "LEASE" ? `${base}/mo` : base;
}

export function formatBedsBaths(beds: number, baths: number) {
  const bedLabel = Number.isInteger(beds) ? String(beds) : beds.toFixed(1);
  const bathLabel = Number.isInteger(baths) ? String(baths) : baths.toFixed(1);
  return `${bedLabel} bed · ${bathLabel} bath`;
}

export function formatDaysAgo(daysOnMarket: number) {
  if (daysOnMarket <= 0) return "Today";
  if (daysOnMarket === 1) return "1 day ago";
  return `${daysOnMarket} days ago`;
}

export function listingStatusLabel(
  status: ListingStatus,
  transactionType: ListingTransactionType | string = "SALE",
) {
  switch (status) {
    case "ACTIVE":
      return transactionType === "LEASE" ? "For Lease" : "For Sale";
    case "SOLD":
      return "Sold";
    case "LEASED":
      return "Leased";
    case "SUSPENDED":
      return "Suspended";
    case "EXPIRED":
      return "Expired";
    case "TERMINATED":
      return "Terminated";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function isClosedListingStatus(status: ListingStatus) {
  return status === "SOLD" || status === "LEASED";
}

export function closedPriceLabel(status: ListingStatus) {
  return status === "LEASED" ? "Leased" : "Sold";
}

export function formatListingAddress(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}) {
  const street = listing.unitNumber
    ? `${listing.addressLine} Unit ${listing.unitNumber}`
    : listing.addressLine;

  const cityLine = [
    listing.city,
    [listing.province?.trim() || "ON", listing.postalCode?.trim()]
      .filter(Boolean)
      .join(" "),
  ].join(", ");

  return [street, cityLine];
}

export function propertyTypeLabel(type: PropertyType) {
  switch (type) {
    case "DETACHED":
      return "Detached";
    case "SEMI_DETACHED":
      return "Semi-detached";
    case "TOWNHOUSE":
      return "Townhouse";
    case "CONDO_APT":
      return "Condo apt";
    case "CONDO_TOWNHOUSE":
      return "Condo townhouse";
    case "MULTIPLEX":
      return "Multiplex";
    case "VACANT_LAND":
      return "Vacant land";
    case "OFFICE":
      return "Office";
    case "RETAIL":
      return "Retail";
    case "INDUSTRIAL":
      return "Industrial";
    case "MIXED_USE":
      return "Mixed use";
    case "OTHER":
      return "Other";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function segmentLabel(
  segment: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string,
) {
  switch (segment) {
    case "RESIDENTIAL":
      return "Residential";
    case "COMMERCIAL":
      return "Commercial";
    case "PRE_CONSTRUCTION":
      return "Pre-construction";
    default:
      return segment;
  }
}

export function transactionTypeLabel(
  transactionType: ListingTransactionType | string,
) {
  switch (transactionType) {
    case "SALE":
      return "Sale";
    case "LEASE":
      return "Lease";
    default:
      return transactionType;
  }
}

export function formatOpenHouseChip(startsAt: string | Date, _endsAt?: string | Date) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  return start.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

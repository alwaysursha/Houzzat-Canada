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

/** Relative age from a timestamp (prefer over raw days-on-market). */
export function formatRelativeAge(from: Date | string) {
  const start = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return null;

  const ms = Date.now() - start.getTime();
  if (ms < 0) return "just now";

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/**
 * Days on market from MLS list date (ListingContractDate / listedAt).
 * Active → now − listedAt; sold/leased → soldAt − listedAt.
 */
export function daysOnMarketFromListedAt(input: {
  listedAt?: Date | string | null;
  soldAt?: Date | string | null;
  status?: ListingStatus | string | null;
  /** Fallback when listedAt is missing (legacy stored DOM). */
  daysOnMarket?: number | null;
}): number {
  const listedRaw = input.listedAt;
  if (listedRaw) {
    const listed =
      typeof listedRaw === "string" ? new Date(listedRaw) : listedRaw;
    if (!Number.isNaN(listed.getTime())) {
      const closed =
        input.status === "SOLD" ||
        input.status === "LEASED" ||
        input.status === "EXPIRED" ||
        input.status === "TERMINATED";
      let end = new Date();
      if (closed && input.soldAt) {
        const sold =
          typeof input.soldAt === "string"
            ? new Date(input.soldAt)
            : input.soldAt;
        if (!Number.isNaN(sold.getTime())) end = sold;
      }
      return Math.max(
        0,
        Math.floor((end.getTime() - listed.getTime()) / 86_400_000),
      );
    }
  }
  const fallback = input.daysOnMarket;
  return fallback != null && Number.isFinite(fallback)
    ? Math.max(0, Math.round(fallback))
    : 0;
}

/** @deprecated Prefer formatListingTiming — kept for callers that only have DOM. */
export function formatDaysAgo(daysOnMarket: number) {
  if (daysOnMarket <= 0) return "just now";
  if (daysOnMarket === 1) return "1 day ago";
  return `${daysOnMarket} days ago`;
}

export function formatClosedOnDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function listingStatusLabel(
  status: ListingStatus,
  transactionType: ListingTransactionType | string = "SALE",
) {
  switch (status) {
    case "ACTIVE":
      return transactionType === "LEASE" ? "For Lease" : "For Sale";
    case "SOLD":
      return transactionType === "LEASE" ? "Leased" : "Sold";
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

/** Pill / tag background for listing status badges (site-wide). */
export function listingStatusBadgeClass(status: ListingStatus) {
  switch (status) {
    case "SOLD":
    case "LEASED":
      return "bg-danger text-white";
    case "ACTIVE":
      return "bg-canopy text-white";
    case "SUSPENDED":
    case "EXPIRED":
    case "TERMINATED":
      return "bg-danger text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Text accent for “Sold For” / “Leased For” prices (danger red site-wide). */
export function closedPriceAccentClass(
  status: ListingStatus,
  _transactionType: ListingTransactionType | string = "SALE",
  _tone: "light" | "dark" = "light",
) {
  void status;
  void _transactionType;
  void _tone;
  return "text-danger";
}

export function closedPriceLabel(
  status: ListingStatus,
  transactionType: ListingTransactionType | string = "SALE",
) {
  if (status === "LEASED" || transactionType === "LEASE") return "Leased";
  return "Sold";
}

/**
 * Site-wide listing timing label:
 * - Active → "Added … ago" from MLS listedAt (ListingContractDate)
 * - Sold/Leased → "Sold on …" / "Leased on …"
 */
export function formatListingTiming(listing: {
  status: ListingStatus;
  transactionType: ListingTransactionType | string;
  listedAt?: Date | string | null;
  soldAt?: Date | string | null;
  daysOnMarket?: number | null;
}) {
  if (isClosedListingStatus(listing.status)) {
    const verb =
      listing.status === "LEASED" || listing.transactionType === "LEASE"
        ? "Leased"
        : "Sold";
    const when = listing.soldAt ?? listing.listedAt;
    if (when) {
      const formatted = formatClosedOnDate(when);
      if (formatted) return `${verb} on ${formatted}`;
    }
    return verb;
  }

  if (listing.listedAt) {
    const age = formatRelativeAge(listing.listedAt);
    if (age) return age === "just now" ? "Added just now" : `Added ${age}`;
  }

  const dom = daysOnMarketFromListedAt(listing);
  if (dom <= 0) return "Added just now";
  return `Added ${formatDaysAgo(dom)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canadianPostalPattern(postal: string) {
  const compact = postal.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return escapeRegExp(postal.trim());
  }
  return `${compact.slice(0, 3)}\\s*${compact.slice(3)}`;
}

/**
 * Street + locality lines for cards / map popups.
 * AMPRE UnparsedAddress often already includes city/province/postal — strip those
 * so we don't render "… Brampton, ON L6Z 3V7" twice.
 */
export function formatListingAddress(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}): [string, string] {
  const city = listing.city.trim();
  const province = (listing.province?.trim() || "ON").toUpperCase();
  const postal = listing.postalCode?.trim() || null;
  const unit = listing.unitNumber?.trim() || null;

  let street = listing.addressLine.trim().replace(/,+\s*$/g, "");

  // Drop trailing ", City, ON A1A 1A1" (and loose variants) from UnparsedAddress.
  if (city) {
    const postalPart = postal
      ? `(?:,?\\s*${canadianPostalPattern(postal)})?`
      : `(?:,?\\s*[A-Z]\\d[A-Z]\\s*\\d[A-Z]\\d)?`;
    const localityTail = new RegExp(
      `,\\s*${escapeRegExp(city)}\\s*,?\\s*${escapeRegExp(province)}${postalPart}\\s*$`,
      "i",
    );
    street = street.replace(localityTail, "").replace(/,+\s*$/g, "").trim();

    // Also drop a bare trailing ", City"
    street = street
      .replace(new RegExp(`,\\s*${escapeRegExp(city)}\\s*$`, "i"), "")
      .replace(/,+\s*$/g, "")
      .trim();
  }

  // Drop a trailing postal that survived without city (truncated UnparsedAddress).
  if (postal) {
    street = street
      .replace(new RegExp(`,?\\s*${canadianPostalPattern(postal)}\\s*$`, "i"), "")
      .replace(/,+\s*$/g, "")
      .trim();
  }

  // Avoid "Unit 1205" when the street already ends with that unit token.
  if (unit) {
    const unitAlready =
      new RegExp(`\\b(?:unit\\s*)?${escapeRegExp(unit)}\\b`, "i").test(street) ||
      new RegExp(`\\b${escapeRegExp(unit)}\\s*$`, "i").test(street);
    if (!unitAlready) {
      street = `${street} Unit ${unit}`;
    }
  }

  if (!street) {
    street = listing.addressLine.trim().replace(/,+\s*$/g, "") || city;
  }

  const cityLine = [city, [province, postal].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return [street, cityLine];
}

/** Single-line address for titles, share text, breadcrumbs. */
export function formatListingAddressOneLine(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}) {
  return formatListingAddress(listing).join(", ");
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

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

/** Compact CAD for tight mobile UI — e.g. $899K, $1.2M */
export function formatPriceCompact(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const millions = amount / 1_000_000;
    const text =
      Math.abs(millions - Math.round(millions)) < 0.05
        ? Math.round(millions).toString()
        : millions.toFixed(1).replace(/\.0$/, "");
    return `$${text}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(amount / 1_000).toLocaleString("en-CA")}K`;
  }
  return formatPrice(amount);
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

/** Card/map beds text — prefers "3+3" when above/below grade is known. */
export function formatListingBedsLabel(listing: {
  beds: number;
  bedsLabel?: string | null;
}): string {
  const label = listing.bedsLabel?.trim();
  if (label) return label;
  return Number.isInteger(listing.beds)
    ? String(listing.beds)
    : listing.beds.toFixed(1);
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
 * - Active → "Added … ago" from MLS list time (`listedAt`)
 * - Sold/Leased → "Sold on …" / "Leased on …"
 *
 * When `listedAt` is date-only (midnight UTC), prefer same-day `updatedAtMls`
 * so same-day listings don't all read as "1 day ago" after 8pm ET.
 */
export function resolveListingAddedAt(listing: {
  listedAt?: Date | string | null;
  updatedAtMls?: Date | string | null;
}): Date | null {
  if (!listing.listedAt) return null;
  const listed =
    typeof listing.listedAt === "string"
      ? new Date(listing.listedAt)
      : listing.listedAt;
  if (Number.isNaN(listed.getTime())) return null;

  const isMidnightUtc =
    listed.getUTCHours() === 0 &&
    listed.getUTCMinutes() === 0 &&
    listed.getUTCSeconds() === 0 &&
    listed.getUTCMilliseconds() === 0;
  if (!isMidnightUtc || !listing.updatedAtMls) return listed;

  const updated =
    typeof listing.updatedAtMls === "string"
      ? new Date(listing.updatedAtMls)
      : listing.updatedAtMls;
  if (Number.isNaN(updated.getTime())) return listed;

  const sameDay =
    listed.getUTCFullYear() === updated.getUTCFullYear() &&
    listed.getUTCMonth() === updated.getUTCMonth() &&
    listed.getUTCDate() === updated.getUTCDate();
  return sameDay ? updated : listed;
}

export function formatListingTiming(listing: {
  status: ListingStatus;
  transactionType: ListingTransactionType | string;
  listedAt?: Date | string | null;
  updatedAtMls?: Date | string | null;
  soldAt?: Date | string | null;
  daysOnMarket?: number | null;
}) {
  if (isClosedListingStatus(listing.status)) {
    const verb =
      listing.status === "LEASED" || listing.transactionType === "LEASE"
        ? "Leased"
        : "Sold";
    // Never fall back to listedAt — that made null soldAt look like old list dates.
    if (listing.soldAt) {
      const when =
        typeof listing.soldAt === "string"
          ? new Date(listing.soldAt)
          : listing.soldAt;
      // Guard: never show a future closing date as "Sold on …"
      if (
        !Number.isNaN(when.getTime()) &&
        when.getTime() <= Date.now() + 86_400_000
      ) {
        const formatted = formatClosedOnDate(when);
        if (formatted) return `${verb} on ${formatted}`;
      }
    }
    return verb;
  }

  const addedAt = resolveListingAddedAt(listing);
  if (addedAt) {
    const age = formatRelativeAge(addedAt);
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

const STREET_TYPE_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bBoulevard\b/gi, "Blvd"],
  [/\bStreet\b/gi, "St"],
  [/\bAvenue\b/gi, "Ave"],
  [/\bRoad\b/gi, "Rd"],
  [/\bDrive\b/gi, "Dr"],
  [/\bCrescent\b/gi, "Cres"],
  [/\bCourt\b/gi, "Ct"],
  [/\bPlace\b/gi, "Pl"],
  [/\bTerrace\b/gi, "Ter"],
  [/\bLane\b/gi, "Ln"],
  [/\bCircle\b/gi, "Cir"],
  [/\bHighway\b/gi, "Hwy"],
  [/\bParkway\b/gi, "Pkwy"],
  [/\bSquare\b/gi, "Sq"],
  [/\bGardens\b/gi, "Gdns"],
];

function abbreviateStreetTypes(street: string): string {
  let next = street;
  for (const [pattern, abbr] of STREET_TYPE_ABBREVIATIONS) {
    next = next.replace(pattern, abbr);
  }
  return next.replace(/\s+/g, " ").trim();
}

/**
 * Compact search/detail address parts:
 * street: `PH7-2565 Erin Centre Blvd`
 * locality: `Mississauga - Central Erin Mills`
 */
export function formatListingAddressSearchParts(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  community?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): { street: string; locality: string | null } {
  const city = listing.city.trim();
  const community = listing.community?.trim() || null;
  const unit = listing.unitNumber?.trim() || null;

  // Reuse locality stripping, then drop a trailing unit token so we can prefix it.
  let [street] = formatListingAddress({
    ...listing,
    unitNumber: null,
  });

  if (unit) {
    street = street
      .replace(
        new RegExp(
          `(?:,?\\s*)(?:unit\\s*)?${escapeRegExp(unit)}\\s*$`,
          "i",
        ),
        "",
      )
      .replace(/,+\s*$/g, "")
      .trim();
  }

  street = abbreviateStreetTypes(street);
  if (!street) {
    street = city || listing.addressLine.trim();
  }

  const withUnit = unit ? `${unit}-${street}` : street;
  const locality =
    city && community ? `${city} - ${community}` : city || community;

  return { street: withUnit, locality };
}

/**
 * Compact search/autocomplete address:
 * `PH7-2565 Erin Centre Blvd, Mississauga - Central Erin Mills`
 */
export function formatListingAddressSearchLine(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  community?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): string {
  const { street, locality } = formatListingAddressSearchParts(listing);
  return locality ? `${street}, ${locality}` : street;
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

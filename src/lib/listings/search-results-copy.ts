import type { PropertyType } from "@prisma/client";
import {
  formatPriceCompact,
  propertyTypeLabel,
} from "@/lib/listings/constants";

export type SearchResultsCopyInput = {
  transactionType: "SALE" | "LEASE" | "ALL";
  segment: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  city: string;
  community: string;
  /** Pipe-separated structured cities from the URL. Not free text. */
  cities: string;
  /** Pipe-separated structured communities from the URL. */
  communities: string;
  /** Free-text query. Never treated as a city. */
  q: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  minBaths: string;
  propertyTypes: PropertyType[];
  openHouseOnly: boolean;
  statuses: string[];
  total: number;
  pending: boolean;
};

export type SearchResultChipKey =
  | "transaction"
  | "price"
  | "beds"
  | "baths"
  | "types"
  | "openHouse"
  | "segment"
  | "place"
  | "city"
  | "community"
  | "query"
  | "status";

export type SearchResultChip = {
  key: SearchResultChipKey;
  label: string;
  clearable: boolean;
  /** Set for one structured city so the chip can be removed on its own. */
  city?: string;
};

export type SearchResultsCopy = {
  title: string;
  supporting: string;
  /**
   * Prominent mobile count line, e.g. "247 Homes for Sale".
   * Uses the canonical `total` from search pagination — never invented.
   */
  countHeadline: string;
  chips: SearchResultChip[];
};

function splitList(raw: string): string[] {
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function money(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  return formatPriceCompact(amount);
}

function pricePhrase(
  minPrice: string,
  maxPrice: string,
  lease: boolean,
): string | null {
  const min = money(minPrice);
  const max = money(maxPrice);
  const suffix = lease ? "/mo" : "";
  if (min && max) return `${min}–${max}${suffix}`;
  if (max) return `Under ${max}${suffix}`;
  if (min) return `From ${min}${suffix}`;
  return null;
}

function joinedPlaces(places: string[]): string | null {
  if (places.length === 0) return null;
  if (places.length === 1) return places[0] ?? null;
  if (places.length === 2) return `${places[0]} and ${places[1]}`;
  if (places.length === 3) {
    return `${places[0]}, ${places[1]}, and ${places[2]}`;
  }
  return null;
}

/**
 * Structured place only. `q` is never folded into this.
 * A long list becomes a count so the heading does not invent a single city.
 */
function structuredPlace(input: SearchResultsCopyInput): {
  label: string;
  many: "cities" | "neighbourhoods" | null;
} | null {
  const cities = splitList(input.cities);
  const communities = splitList(input.communities);
  if (cities.length > 3) return { label: String(cities.length), many: "cities" };
  if (cities.length > 0) {
    const label = joinedPlaces(cities);
    return label ? { label, many: null } : null;
  }
  if (communities.length > 3) {
    return { label: String(communities.length), many: "neighbourhoods" };
  }
  if (communities.length > 0) {
    const label = joinedPlaces(communities);
    return label ? { label, many: null } : null;
  }
  const city = input.city.trim();
  const community = input.community.trim();
  if (community && city) return { label: `${community}, ${city}`, many: null };
  if (community) return { label: community, many: null };
  if (city) return { label: city, many: null };
  return null;
}

function noun(input: SearchResultsCopyInput): "Homes" | "Rentals" | "Properties" {
  if (input.segment === "COMMERCIAL") return "Properties";
  if (input.transactionType === "LEASE") return "Rentals";
  return "Homes";
}

function singular(word: "Homes" | "Rentals" | "Properties"): string {
  switch (word) {
    case "Homes":
      return "home";
    case "Rentals":
      return "rental";
    case "Properties":
      return "property";
    default: {
      const unexpected: never = word;
      return unexpected;
    }
  }
}

function transactionLabel(transactionType: SearchResultsCopyInput["transactionType"]): string {
  switch (transactionType) {
    case "LEASE":
      return "For Lease";
    case "ALL":
      return "Sale or lease";
    case "SALE":
      return "For Sale";
    default: {
      const unexpected: never = transactionType;
      return unexpected;
    }
  }
}

function statusLabel(statuses: string[], lease: boolean): string | null {
  const activeOnly = statuses.length === 1 && statuses[0] === "ACTIVE";
  if (statuses.length === 0 || activeOnly) return null;
  if (statuses.length > 1) return `${statuses.length} statuses`;
  switch (statuses[0]) {
    case "SOLD":
      return "Sold";
    case "LEASED":
      return "Leased";
    case "SOLD_CONDITIONAL":
      return lease ? "Lease conditional" : "Sold conditional";
    case "UNLISTED":
      return "Unlisted";
    default:
      return "Status";
  }
}

export function searchResultsCopy(input: SearchResultsCopyInput): SearchResultsCopy {
  const lease = input.transactionType === "LEASE";
  const subject = noun(input);
  const price = pricePhrase(input.minPrice, input.maxPrice, lease);
  const place = structuredPlace(input);
  const query = input.q.trim();
  const matchingQuery = !place && query ? ` matching “${query}”` : "";

  let title = subject;
  if (price) {
    title += ` ${price}`;
  } else if (!place && !matchingQuery && input.transactionType === "SALE" && input.segment !== "COMMERCIAL") {
    title += " for sale";
  }
  if (place?.many) {
    title += ` across ${place.label} ${place.many}`;
  } else if (place) {
    title += ` in ${place.label}`;
  }
  title += matchingQuery;

  const count = Math.max(0, Math.trunc(input.total));
  const countWord = count === 1 ? singular(subject) : subject.toLowerCase();
  const supporting = input.pending
    ? "Updating results"
    : `${count.toLocaleString("en-CA")} ${countWord} ${count === 1 ? "matches" : "match"} your search`;

  const countNoun =
    input.segment === "COMMERCIAL"
      ? count === 1
        ? "Property"
        : "Properties"
      : count === 1
        ? "Home"
        : "Homes";
  const countTxn =
    input.transactionType === "LEASE"
      ? "for Lease"
      : input.transactionType === "ALL"
        ? "for Sale or Lease"
        : "for Sale";
  const countHeadline = input.pending
    ? "Updating results"
    : `${count.toLocaleString("en-CA")} ${countNoun} ${countTxn}`;

  const chips: SearchResultChip[] = [];
  // Buy/Rent: always surface committed transaction; removable when not default Sale.
  chips.push({
    key: "transaction",
    label: transactionLabel(input.transactionType),
    clearable: input.transactionType !== "SALE",
  });
  if (input.segment === "COMMERCIAL") {
    chips.push({ key: "segment", label: "Commercial", clearable: true });
  } else if (input.segment === "ALL") {
    chips.push({ key: "segment", label: "All segments", clearable: true });
  }
  const listedCities = splitList(input.cities);
  const singleCity =
    listedCities.length === 0 &&
    !input.community.trim() &&
    splitList(input.communities).length === 0
      ? input.city.trim()
      : "";
  const cityNames = listedCities.length > 0 ? listedCities : singleCity ? [singleCity] : [];
  for (const name of cityNames) {
    chips.push({ key: "city", label: name, clearable: true, city: name });
  }
  const communityLabel = input.community.trim();
  if (communityLabel) {
    chips.push({
      key: "community",
      label: communityLabel,
      clearable: true,
    });
  }
  // Multi-community pipe (or community-only place) when no per-city chips cover it.
  if (place && cityNames.length === 0 && !communityLabel) {
    chips.push({
      key: "place",
      label: place.many ? `${place.label} ${place.many}` : place.label,
      clearable: true,
    });
  }
  if (query) {
    chips.push({ key: "query", label: `“${query}”`, clearable: true });
  }
  if (price) chips.push({ key: "price", label: price, clearable: true });
  const beds = input.minBeds.trim();
  if (beds) chips.push({ key: "beds", label: `${beds}+ Beds`, clearable: true });
  const baths = input.minBaths.trim();
  if (baths) chips.push({ key: "baths", label: `${baths}+ Baths`, clearable: true });
  if (input.propertyTypes.length === 1) {
    chips.push({
      key: "types",
      label: propertyTypeLabel(input.propertyTypes[0]!),
      clearable: true,
    });
  } else if (input.propertyTypes.length > 1) {
    chips.push({
      key: "types",
      label: `${input.propertyTypes.length} home types`,
      clearable: true,
    });
  }
  const status = statusLabel(input.statuses, lease);
  if (status) chips.push({ key: "status", label: status, clearable: true });
  if (input.openHouseOnly) {
    chips.push({ key: "openHouse", label: "Open houses", clearable: true });
  }

  return { title, supporting, countHeadline, chips };
}

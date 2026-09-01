/**
 * Stage 5.3 — unwrap Mobile v2 properties API envelopes.
 */

import type {
  MobileListingCard,
  PropertiesSearchData,
  ShortlistEmailData,
} from "../types/property";
import type { BackendEnvelope } from "../types/api";

export function unwrapPropertiesSearch(data: unknown): PropertiesSearchData {
  if (!data || typeof data !== "object") {
    return { listings: [], total: 0, nextCursor: null, limit: 60 };
  }
  const env = data as BackendEnvelope<PropertiesSearchData>;
  if (env.ok && env.data?.listings) {
    return {
      listings: env.data.listings as MobileListingCard[],
      total: env.data.total ?? env.data.listings.length,
      nextCursor: env.data.nextCursor ?? null,
      limit: env.data.limit ?? 60,
    };
  }
  if ("listings" in (data as object)) {
    const direct = data as PropertiesSearchData;
    return {
      listings: direct.listings ?? [],
      total: direct.total ?? direct.listings?.length ?? 0,
      nextCursor: direct.nextCursor ?? null,
      limit: direct.limit ?? 60,
    };
  }
  return { listings: [], total: 0, nextCursor: null, limit: 60 };
}

export function unwrapShortlistEmail(data: unknown): ShortlistEmailData | null {
  if (!data || typeof data !== "object") return null;
  const env = data as BackendEnvelope<ShortlistEmailData>;
  if (env.ok && env.data?.shareUrl) {
    return env.data;
  }
  const direct = data as Partial<ShortlistEmailData>;
  if (direct.shareUrl && direct.leadId) {
    return {
      shareUrl: direct.shareUrl,
      count: direct.count ?? 0,
      stubbed: direct.stubbed,
      leadId: direct.leadId,
    };
  }
  return null;
}

export function buildPropertiesSearchQuery(input: {
  q: string;
  filters: {
    transactionType: string;
    sort: string;
    minPrice: string;
    maxPrice: string;
    minBeds: string;
    minBaths: string;
    openHouseOnly: boolean;
    propertyTypes: string[];
  };
  cursor?: string | null;
}): string {
  const params = new URLSearchParams();
  const q = input.q.trim();
  if (q) params.set("q", q);
  params.set("transactionType", input.filters.transactionType);
  params.set("sort", input.filters.sort);
  params.set("limit", "60");
  params.set("status", "ACTIVE");
  if (input.filters.minPrice.trim()) {
    params.set("minPrice", input.filters.minPrice.trim());
  }
  if (input.filters.maxPrice.trim()) {
    params.set("maxPrice", input.filters.maxPrice.trim());
  }
  if (input.filters.minBeds.trim()) {
    params.set("minBeds", input.filters.minBeds.trim());
  }
  if (input.filters.minBaths.trim()) {
    params.set("minBaths", input.filters.minBaths.trim());
  }
  if (input.filters.openHouseOnly) {
    params.set("openHouseOnly", "1");
  }
  if (input.filters.propertyTypes.length > 0) {
    params.set("propertyTypes", input.filters.propertyTypes.join(","));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  const qs = params.toString();
  return qs ? `/properties/search?${qs}` : "/properties/search";
}

export function formatListingPrice(
  listPrice: number,
  transactionType: string,
): string {
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(listPrice);
  return transactionType === "LEASE" ? `${formatted}/mo` : formatted;
}

export function formatListingAddress(listing: MobileListingCard): string {
  const parts = [listing.addressLine];
  if (listing.unitNumber?.trim()) {
    parts[0] = `${listing.unitNumber.trim()} - ${listing.addressLine}`;
  }
  if (listing.city) parts.push(listing.city);
  return parts.filter(Boolean).join(", ");
}

export function formatListingBeds(listing: MobileListingCard): string {
  if (listing.bedsLabel?.trim()) return listing.bedsLabel;
  return String(listing.beds);
}

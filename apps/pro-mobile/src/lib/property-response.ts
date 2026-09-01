/**
 * Stage 5.3 — unwrap Mobile v2 properties API envelopes.
 */

import type {
  MobileListingCard,
  PropertiesSearchData,
  ShortlistEmailData,
} from "../types/property";
import type { BackendEnvelope } from "../types/api";
import { withQuery } from "./query-string";

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
  const q = input.q.trim();
  return withQuery("/properties/search", {
    q: q || undefined,
    transactionType: input.filters.transactionType,
    sort: input.filters.sort,
    limit: "60",
    status: "ACTIVE",
    minPrice: input.filters.minPrice.trim() || undefined,
    maxPrice: input.filters.maxPrice.trim() || undefined,
    minBeds: input.filters.minBeds.trim() || undefined,
    minBaths: input.filters.minBaths.trim() || undefined,
    openHouseOnly: input.filters.openHouseOnly ? "1" : undefined,
    propertyTypes:
      input.filters.propertyTypes.length > 0
        ? input.filters.propertyTypes.join(",")
        : undefined,
    cursor: input.cursor || undefined,
  });
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

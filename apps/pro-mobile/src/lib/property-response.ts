/**
 * Stage 5.3 — unwrap Mobile v2 properties API envelopes.
 */

import type {
  MobileListingCard,
  MobilePropertyDetail,
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
      notFound: env.data.notFound ?? [],
    };
  }
  if ("listings" in (data as object)) {
    const direct = data as PropertiesSearchData;
    return {
      listings: direct.listings ?? [],
      total: direct.total ?? direct.listings?.length ?? 0,
      nextCursor: direct.nextCursor ?? null,
      limit: direct.limit ?? 60,
      notFound: direct.notFound ?? [],
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
    mode: q ? "address" : undefined,
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

export function unwrapPropertyDetail(
  data: unknown,
): { detail: MobilePropertyDetail; saved: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const env = data as BackendEnvelope<{
    detail: MobilePropertyDetail;
    saved: boolean;
  }>;
  if (env.ok && env.data?.detail) {
    return {
      detail: normalizePropertyDetail(env.data.detail),
      saved: Boolean(env.data.saved),
    };
  }
  const direct = data as {
    detail?: MobilePropertyDetail;
    saved?: boolean;
  };
  if (direct.detail) {
    return {
      detail: normalizePropertyDetail(direct.detail),
      saved: Boolean(direct.saved),
    };
  }
  return null;
}

function normalizePropertyDetail(
  detail: MobilePropertyDetail,
): MobilePropertyDetail {
  return {
    ...detail,
    brokeragePhone: detail.brokeragePhone ?? null,
    agentName: detail.agentName ?? null,
    agentCellPhone: detail.agentCellPhone ?? null,
    featureSections: Array.isArray(detail.featureSections)
      ? detail.featureSections
      : [],
    shareUrl: detail.shareUrl ?? null,
    publicOrigin: detail.publicOrigin ?? null,
  };
}

export function unwrapSavedListingsBulk(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const env = data as BackendEnvelope<{ mlsNumbers: string[] }>;
  if (env.ok && Array.isArray(env.data?.mlsNumbers)) {
    return env.data.mlsNumbers;
  }
  const direct = data as { mlsNumbers?: string[] };
  return direct.mlsNumbers ?? [];
}

export interface ShortlistListData {
  listings: MobileListingCard[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export function unwrapShortlistList(data: unknown): ShortlistListData {
  const empty: ShortlistListData = {
    listings: [],
    total: 0,
    hasMore: false,
    limit: 60,
    offset: 0,
  };
  if (!data || typeof data !== "object") return empty;
  const env = data as BackendEnvelope<{
    listings?: MobileListingCard[];
    total?: number;
    hasMore?: boolean;
    limit?: number;
    offset?: number;
  }>;
  if (env.ok && env.data) {
    return {
      listings: (env.data.listings ?? []) as MobileListingCard[],
      total: env.data.total ?? env.data.listings?.length ?? 0,
      hasMore: Boolean(env.data.hasMore),
      limit: env.data.limit ?? 60,
      offset: env.data.offset ?? 0,
    };
  }
  const direct = data as Partial<ShortlistListData>;
  if (direct.listings) {
    return {
      listings: direct.listings,
      total: direct.total ?? direct.listings.length,
      hasMore: Boolean(direct.hasMore),
      limit: direct.limit ?? 60,
      offset: direct.offset ?? 0,
    };
  }
  return empty;
}

export function buildShortlistListQuery(opts?: {
  limit?: number;
  offset?: number;
}): string {
  return withQuery("/properties/saved", {
    enrich: "cards",
    limit: String(opts?.limit ?? 60),
    offset: String(opts?.offset ?? 0),
  });
}

/**
 * Stage 4.9 — Mobile v2 lead engagement loader.
 *
 * Canonical web source: loadLeadSummary engagement fields (CustomerProfile tab="engagement").
 * Reuses computeHotness, loadBuyerIntent, and the same Prisma bounds as web.
 */

import type { PropertyType } from "@prisma/client";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import { computeHotness } from "@/lib/agent/hotness";
import {
  hasUsableSearchCriteria,
  savedQueryToSearchHref,
} from "@/lib/agent/intent-to-search";
import {
  formatListingAddressOneLine,
  formatListingBedsLabel,
} from "@/lib/listings/constants";
import { getListingProvider } from "@/lib/listings/provider";
import type { ListingSearchParams } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";

const MATCH_LIMIT = 24;

export type MobileLeadEngagementMatch = {
  mlsNumber: string;
  address: string;
  listPrice: number | null;
  bedsLabel: string | null;
  imageUrl: string | null;
};

export type MobileLeadEngagementPayload = {
  hot: {
    hotness: number;
    views24h: number;
    distinctListings24h: number;
    isOnline: boolean;
    binge: boolean;
    lastSeenAt: string | null;
  };
  stats: {
    saves: number;
    alerts: number;
    emails: number;
    savedSearchCount: number;
  };
  lastTouchAt: string;
  rings: {
    emailOpens: number;
    emailClicks: number;
    alertOpens: number;
  };
  buyerIntent: Awaited<ReturnType<typeof loadBuyerIntent>>;
  savedSearches: Array<{
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    isHomepageActive: boolean;
    query: unknown;
  }>;
  savedListings: Array<{ id: string; mlsNumber: string }>;
  propertyMonitors: Array<{ id: string; mlsNumber: string }>;
  areaMonitors: Array<{ id: string; name: string; city: string }>;
  listingNotes: Array<{ id: string; mlsNumber: string; body: string }>;
  tours: Array<{
    id: string;
    name: string;
    status: string;
    stops: Array<{ mlsNumber: string }>;
  }>;
  alerts: Array<{ id: string; title: string; kind: string }>;
  matches: MobileLeadEngagementMatch[];
  matchesLoaded: boolean;
};

function savedQueryToListingSearchParams(query: unknown): ListingSearchParams | null {
  const href = savedQueryToSearchHref(query);
  const url = new URL(href, "https://local.test");
  const sp = url.searchParams;

  const propertyTypesParam = sp.get("propertyTypes");
  const propertyTypes = propertyTypesParam
    ? (propertyTypesParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as PropertyType[])
    : undefined;

  const communitiesParam = sp.get("communities");
  const communities = communitiesParam
    ? communitiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const citiesParam = sp.get("cities");
  const cities = citiesParam
    ? citiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const statusParam = sp.get("status") ?? "ACTIVE";
  const params: ListingSearchParams = {
    status: statusParam === "ALL" ? "ALL" : "ACTIVE",
    city: sp.get("city") ?? undefined,
    cities: cities?.length ? cities : undefined,
    community: sp.get("community") ?? undefined,
    communities: communities?.length ? communities : undefined,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
    maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
    minBeds: sp.get("minBeds") ? Number(sp.get("minBeds")) : undefined,
    minBaths: sp.get("minBaths") ? Number(sp.get("minBaths")) : undefined,
    transactionType:
      (sp.get("transactionType") as ListingSearchParams["transactionType"]) ??
      undefined,
    q: sp.get("q") ?? undefined,
  };

  const hasFilter = Boolean(
    params.city ||
      params.cities?.length ||
      params.community ||
      params.communities?.length ||
      params.propertyTypes?.length ||
      params.minPrice != null ||
      params.maxPrice != null ||
      params.minBeds != null ||
      params.transactionType ||
      params.q,
  );

  return hasFilter ? params : null;
}

async function loadMatchingListings(
  seedQuery: unknown,
  buyerIntentCriteria: Parameters<typeof hasUsableSearchCriteria>[0],
): Promise<MobileLeadEngagementMatch[]> {
  const activeQuery =
    seedQuery && typeof seedQuery === "object" && Object.keys(seedQuery).length
      ? seedQuery
      : null;

  if (!activeQuery && !hasUsableSearchCriteria(buyerIntentCriteria)) {
    return [];
  }

  const searchParams = savedQueryToListingSearchParams(activeQuery ?? {});
  if (!searchParams) return [];

  try {
    const provider = getListingProvider();
    const result = await provider.search({
      ...searchParams,
      limit: MATCH_LIMIT,
    });
    return result.items.slice(0, MATCH_LIMIT).map((card, index) => ({
      mlsNumber: card.mlsNumber,
      address: formatListingAddressOneLine(card),
      listPrice: card.listPrice ?? null,
      bedsLabel: formatListingBedsLabel(card) || null,
      // Cap remote photos in the DTO — native only renders a few images.
      imageUrl: index < 6 ? (card.imageUrls[0] ?? null) : null,
    }));
  } catch {
    return [];
  }
}

export async function loadLeadEngagement(
  leadId: string,
): Promise<MobileLeadEngagementPayload | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      customerId: true,
      status: true,
      score: true,
      createdAt: true,
      firstRespondedAt: true,
      updatedAt: true,
      contactConsentAt: true,
      customer: {
        select: { name: true, caslConsentAt: true },
      },
      emailLogs: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true },
      },
    },
  });

  if (!lead) return null;

  const hot = await computeHotness({
    leadId: lead.id,
    customerId: lead.customerId,
    status: lead.status,
    score: lead.score,
    createdAt: lead.createdAt,
    firstRespondedAt: lead.firstRespondedAt,
  });

  let savedListings: MobileLeadEngagementPayload["savedListings"] = [];
  let savedSearches: MobileLeadEngagementPayload["savedSearches"] = [];
  let propertyMonitors: MobileLeadEngagementPayload["propertyMonitors"] = [];
  let areaMonitors: MobileLeadEngagementPayload["areaMonitors"] = [];
  let listingNotes: MobileLeadEngagementPayload["listingNotes"] = [];
  let tours: MobileLeadEngagementPayload["tours"] = [];
  let alerts: MobileLeadEngagementPayload["alerts"] = [];

  if (lead.customerId) {
    const [saves, searches, props, areas, notes, viewingTours, customerAlerts] =
      await Promise.all([
        prisma.savedListing.findMany({
          where: { userId: lead.customerId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, mlsNumber: true },
        }),
        prisma.savedSearch.findMany({
          where: { userId: lead.customerId },
          orderBy: [
            { isHomepageActive: "desc" },
            { isPrimary: "desc" },
            { updatedAt: "desc" },
          ],
          take: 10,
          select: {
            id: true,
            name: true,
            emailAlerts: true,
            smsAlerts: true,
            isHomepageActive: true,
            query: true,
          },
        }),
        prisma.propertyMonitor.findMany({
          where: { userId: lead.customerId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, mlsNumber: true },
        }),
        prisma.areaMonitor.findMany({
          where: { userId: lead.customerId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, name: true, city: true },
        }),
        prisma.listingNote.findMany({
          where: { userId: lead.customerId },
          orderBy: { updatedAt: "desc" },
          take: 15,
          select: { id: true, mlsNumber: true, body: true },
        }),
        prisma.viewingTour.findMany({
          where: { userId: lead.customerId },
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: {
            stops: {
              orderBy: { sortOrder: "asc" },
              select: { mlsNumber: true },
            },
          },
        }),
        prisma.customerAlert.findMany({
          where: { userId: lead.customerId },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, title: true, kind: true },
        }),
      ]);

    savedListings = saves;
    savedSearches = searches;
    propertyMonitors = props;
    areaMonitors = areas;
    listingNotes = notes;
    tours = viewingTours.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      stops: t.stops,
    }));
    alerts = customerAlerts;
  }

  const buyerIntent = await loadBuyerIntent({
    customerId: lead.customerId,
    customerName: lead.customer?.name ?? null,
    savedSearches,
  });

  const emailCount = lead.emailLogs.length;
  const alertCount = alerts.length;
  const saveCount = savedListings.length;

  const openRate = Math.min(100, emailCount > 0 ? hot.hotness : 0);
  const clickRate = Math.min(
    100,
    Math.round(hot.views24h * 6 + saveCount * 10),
  );
  const alertRate = Math.min(100, alertCount > 0 ? 40 + alertCount * 8 : 0);

  const seedQuery = savedSearches[0]?.query ?? null;
  const matches = await loadMatchingListings(seedQuery, buyerIntent.criteria);

  const lastTouch = lead.firstRespondedAt || lead.updatedAt;

  return {
    hot: {
      hotness: hot.hotness,
      views24h: hot.views24h,
      distinctListings24h: hot.distinctListings24h,
      isOnline: hot.isOnline,
      binge: hot.binge,
      lastSeenAt: hot.lastSeenAt?.toISOString() ?? null,
    },
    stats: {
      saves: saveCount,
      alerts: alertCount,
      emails: emailCount,
      savedSearchCount: savedSearches.length,
    },
    lastTouchAt: lastTouch.toISOString(),
    rings: {
      emailOpens: openRate,
      emailClicks: clickRate,
      alertOpens: alertRate,
    },
    buyerIntent,
    savedSearches,
    savedListings,
    propertyMonitors,
    areaMonitors,
    listingNotes,
    tours,
    alerts,
    matches,
    matchesLoaded: true,
  };
}

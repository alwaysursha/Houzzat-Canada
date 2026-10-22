import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export type LeadDashboardEngagement = {
  saves: number;
  searches: number;
  inquiries: number;
  loginCount: number;
  openTaskCount: number;
  priceCity: string | null;
  phone: string | null;
  emailConsent: boolean;
};

/** Batch engagement stats for the CINC-style leads table. */
export async function loadLeadsDashboardEngagement(
  customerIds: string[],
  leadIds: string[],
): Promise<{
  byCustomer: Map<string, LeadDashboardEngagement>;
  taskCountByLead: Map<string, number>;
}> {
  const uniqueCustomers = [...new Set(customerIds.filter(Boolean))];
  const byCustomer = new Map<string, LeadDashboardEngagement>();
  const taskCountByLead = new Map<string, number>();

  if (leadIds.length > 0) {
    const taskGroups = await prisma.agentTask.groupBy({
      by: ["leadId"],
      where: { leadId: { in: leadIds }, status: "OPEN" },
      _count: { _all: true },
    });
    for (const g of taskGroups) {
      if (g.leadId) taskCountByLead.set(g.leadId, g._count._all);
    }
  }

  if (uniqueCustomers.length === 0) {
    return { byCustomer, taskCountByLead };
  }

  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  const [
    saves,
    searches,
    inquiries,
    logins,
    phones,
    searchEvents,
    listingViews,
  ] = await Promise.all([
    prisma.savedListing.groupBy({
      by: ["userId"],
      where: { userId: { in: uniqueCustomers } },
      _count: { _all: true },
    }),
    prisma.savedSearch.findMany({
      where: { userId: { in: uniqueCustomers } },
      orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
      select: { userId: true, query: true },
    }),
    prisma.lead.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: uniqueCustomers },
        source: {
          in: [
            "PROPERTY_INQUIRY",
            "SHOWING_REQUEST",
            "VIRTUAL_VIEWING",
            "HOME_VALUATION",
          ],
        },
      },
      _count: { _all: true },
    }),
    prisma.activityEvent.groupBy({
      by: ["userId"],
      where: {
        userId: { in: uniqueCustomers },
        type: { in: ["PAGE_VIEW", "LISTING_VIEW", "SEARCH"] },
      },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { id: { in: uniqueCustomers } },
      select: {
        id: true,
        phone: true,
        caslConsentAt: true,
      },
    }),
    prisma.activityEvent.findMany({
      where: {
        userId: { in: uniqueCustomers },
        type: "SEARCH",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(uniqueCustomers.length * 8, 400),
      select: { userId: true, path: true },
    }),
    prisma.listingView.findMany({
      where: {
        userId: { in: uniqueCustomers },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(uniqueCustomers.length * 10, 500),
      select: { userId: true, mlsNumber: true },
    }),
  ]);

  const saveMap = new Map(saves.map((s) => [s.userId, s._count._all]));
  const inquiryMap = new Map(
    inquiries
      .filter((i) => i.customerId)
      .map((i) => [i.customerId!, i._count._all]),
  );
  const loginMap = new Map(
    logins.filter((l) => l.userId).map((l) => [l.userId!, l._count._all]),
  );
  const phoneMap = new Map(
    phones.map((p) => [
      p.id,
      { phone: p.phone, consent: Boolean(p.caslConsentAt) },
    ]),
  );

  const searchCount = new Map<string, number>();
  const priceCity = new Map<string, string | null>();
  for (const s of searches) {
    searchCount.set(s.userId, (searchCount.get(s.userId) ?? 0) + 1);
    if (!priceCity.has(s.userId)) {
      priceCity.set(s.userId, formatPriceCity(s.query));
    }
  }

  // Fill gaps from SEARCH URL filters (most buyers never click Save Search).
  for (const ev of searchEvents) {
    if (!ev.userId) continue;
    if (priceCity.get(ev.userId)) continue;
    const label = formatPriceCityFromSearchPath(ev.path);
    if (label) priceCity.set(ev.userId, label);
  }

  // Last resort: city/price from homes they actually opened.
  const missingForViews = uniqueCustomers.filter((id) => !priceCity.get(id));
  if (missingForViews.length > 0 && listingViews.length > 0) {
    const missingSet = new Set(missingForViews);
    const mlsByUser = new Map<string, string[]>();
    for (const row of listingViews) {
      if (!row.userId || !missingSet.has(row.userId)) continue;
      const list = mlsByUser.get(row.userId) ?? [];
      if (list.length >= 8) continue;
      if (!list.includes(row.mlsNumber)) list.push(row.mlsNumber);
      mlsByUser.set(row.userId, list);
    }
    const allMls = [...new Set([...mlsByUser.values()].flat())];
    if (allMls.length > 0) {
      const listings = await prisma.listing.findMany({
        where: {
          AND: [{ mlsNumber: { in: allMls } }, excludeStagingSnapshotWhere()],
        },
        select: {
          mlsNumber: true,
          city: true,
          community: true,
        },
      });
      const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));
      for (const [userId, mlsList] of mlsByUser) {
        if (priceCity.get(userId)) continue;
        const cities: string[] = [];
        for (const mls of mlsList) {
          const listing = byMls.get(mls);
          if (!listing) continue;
          if (listing.city) cities.push(listing.city);
          else if (listing.community) cities.push(listing.community);
        }
        const place = modeString(cities);
        if (place) priceCity.set(userId, place);
      }
    }
  }

  for (const id of uniqueCustomers) {
    const contact = phoneMap.get(id);
    byCustomer.set(id, {
      saves: saveMap.get(id) ?? 0,
      searches: searchCount.get(id) ?? 0,
      inquiries: inquiryMap.get(id) ?? 0,
      loginCount: loginMap.get(id) ?? 0,
      openTaskCount: 0,
      priceCity: priceCity.get(id) ?? null,
      phone: contact?.phone ?? null,
      emailConsent: contact?.consent ?? false,
    });
  }

  return { byCustomer, taskCountByLead };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function asPlace(query: Record<string, unknown>): string | null {
  const city = typeof query.city === "string" ? query.city.trim() : "";
  if (city) return city;
  const cities =
    typeof query.cities === "string"
      ? query.cities
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];
  if (cities[0]) return cities[0];
  const community =
    typeof query.community === "string" ? query.community.trim() : "";
  return community || null;
}

function formatPriceCityParts(
  place: string | null,
  _min: number | null,
  _max: number | null,
): string | null {
  // Leads table shows place only — budget/beds live on the profile "Looking for" card.
  return place;
}

function formatPriceCity(query: unknown): string | null {
  const q = query as Record<string, unknown> | null;
  if (!q || typeof q !== "object") return null;
  return formatPriceCityParts(
    asPlace(q),
    asNumber(q.priceMin ?? q.minPrice),
    asNumber(q.priceMax ?? q.maxPrice),
  );
}

function formatPriceCityFromSearchPath(path: string | null): string | null {
  if (!path || !path.startsWith("/search")) return null;
  try {
    const url = new URL(path, "https://houzzat.local");
    const p = url.searchParams;
    const place =
      p.get("city")?.trim() ||
      p.get("cities")?.split(",")[0]?.trim() ||
      p.get("community")?.trim() ||
      p.get("communities")?.split(",")[0]?.trim() ||
      p.get("q")?.trim() ||
      null;
    return formatPriceCityParts(
      place,
      asNumber(p.get("minPrice")),
      asNumber(p.get("maxPrice")),
    );
  } catch {
    return null;
  }
}

function modeString(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

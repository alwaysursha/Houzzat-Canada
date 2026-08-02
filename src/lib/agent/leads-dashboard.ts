import { prisma } from "@/lib/prisma";

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

  const [saves, searches, inquiries, logins, phones] = await Promise.all([
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

function formatPriceCity(query: unknown): string | null {
  const q = query as Record<string, unknown> | null;
  if (!q || typeof q !== "object") return null;
  const city = typeof q.city === "string" ? q.city : null;
  const min =
    typeof q.priceMin === "number"
      ? q.priceMin
      : typeof q.minPrice === "number"
        ? q.minPrice
        : null;
  const max =
    typeof q.priceMax === "number"
      ? q.priceMax
      : typeof q.maxPrice === "number"
        ? q.maxPrice
        : null;

  const price =
    min != null && max != null
      ? `$ ${Math.round(min / 1000)}k - ${Math.round(max / 1000)}k`
      : max != null
        ? `$ ${Math.round(max / 1000)}k`
        : min != null
          ? `$ ${Math.round(min / 1000)}k+`
          : null;

  if (price && city) return `${price} ${city}`;
  if (price) return price;
  if (city) return city;
  return null;
}

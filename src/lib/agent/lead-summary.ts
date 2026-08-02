import type { LeadStatus } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { canAccessLead } from "@/lib/agent";
import { loadCustomerTimeline } from "@/lib/agent/customer-timeline";
import { computeHotness } from "@/lib/agent/hotness";
import type { InquiryTagValue } from "@/lib/agent/inquiry-tag";
import { prisma } from "@/lib/prisma";

export type LeadSummary = {
  lead: {
    id: string;
    status: LeadStatus;
    source: string;
    score: number;
    notes: string | null;
    listingMls: string | null;
    inquiryTag: InquiryTagValue | null;
    assignedAgentId: string | null;
    createdAt: string;
    statusChangedAt: string;
    firstRespondedAt: string | null;
    contactConsentAt: string | null;
    lostReason: string | null;
    winReason: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    customer: {
      id: string;
      name: string | null;
      email: string;
      phone: string | null;
      isBuyer: boolean;
      isSeller: boolean;
      emailVerified: string | null;
      caslConsentAt: string | null;
      homeAddress: string | null;
      emailUpdateRequestedAt: string | null;
      phoneUpdateRequestedAt: string | null;
    } | null;
    assignedAgent: { id: string; name: string | null; email: string } | null;
    adCampaign: { id: string; name: string } | null;
  };
  hot: {
    hotness: number;
    views24h: number;
    distinctListings24h: number;
    isOnline: boolean;
    binge: boolean;
    lastSeenAt: string | null;
    slaHoursOpen: number | null;
  };
  stats: {
    emails: number;
    alerts: number;
    saves: number;
    notes: number;
    openTasks: number;
  };
  permissions: {
    canSeeTeamLeads: boolean;
    canClaim: boolean;
    consented: boolean;
  };
  teamMembers: Array<{
    user: { id: string; name: string | null; email: string };
  }>;
  savedSearchLabel: string | null;
  savedListings: Array<{ id: string; mlsNumber: string }>;
  savedSearches: Array<{
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    query: unknown;
  }>;
  propertyMonitors: Array<{ id: string; mlsNumber: string }>;
  areaMonitors: Array<{
    id: string;
    name: string;
    city: string;
  }>;
  listingNotes: Array<{
    id: string;
    mlsNumber: string;
    body: string;
  }>;
  tours: Array<{
    id: string;
    name: string;
    status: string;
    stops: Array<{ mlsNumber: string }>;
  }>;
  alerts: Array<{
    id: string;
    title: string;
    kind: string;
  }>;
  timeline: Array<{
    id: string;
    source: string;
    type: string;
    title: string;
    body: string | null;
    mlsNumber: string | null;
    path: string | null;
    imageUrl: string | null;
    createdAt: string;
    noteId?: string | null;
    noteCategory?: "GENERAL" | "CALL" | null;
    pinned?: boolean;
    pinnedAt?: string | null;
  }>;
  tasks: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    body: string | null;
    dueAt: string;
    completedAt: string | null;
  }>;
  appointments: Array<{
    id: string;
    type: string;
    status: string;
    startsAt: string | null;
    listingMls: string | null;
    videoJoinUrl: string | null;
    notes: string | null;
  }>;
  emails: Array<{
    id: string;
    subject: string;
    body: string;
    toEmail: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    body: string;
    category: "GENERAL" | "CALL";
    pinned: boolean;
    pinnedAt: string | null;
    createdAt: string;
    author: { name: string | null; email: string };
  }>;
  nextReminder: { title: string; dueAt: string } | null;
  lastTouchAt: string;
};

function searchLabel(search: {
  name: string;
  query: unknown;
}): string {
  const q = search.query as Record<string, unknown> | null;
  const bits = [
    typeof q?.city === "string" ? q.city : null,
    typeof q?.bedsMin === "number" ? `${q.bedsMin}+ beds` : null,
    typeof q?.priceMax === "number"
      ? `to $${Number(q.priceMax).toLocaleString()}`
      : null,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(", ") : search.name || "Saved search";
}

export async function loadLeadSummary(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadSummary | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isBuyer: true,
          isSeller: true,
          emailVerified: true,
          caslConsentAt: true,
          homeAddress: true,
          emailUpdateRequestedAt: true,
          phoneUpdateRequestedAt: true,
        },
      },
      assignedAgent: {
        select: { id: true, name: true, email: true },
      },
      emailLogs: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          subject: true,
          body: true,
          toEmail: true,
          createdAt: true,
        },
      },
      leadNotes: {
        orderBy: [
          { pinned: "desc" },
          { pinnedAt: "desc" },
          { createdAt: "desc" },
        ],
        take: 30,
        include: {
          author: { select: { name: true, email: true } },
        },
      },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 40,
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          body: true,
          dueAt: true,
          completedAt: true,
        },
      },
      appointments: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          status: true,
          startsAt: true,
          listingMls: true,
          videoJoinUrl: true,
          notes: true,
        },
      },
      adCampaign: { select: { id: true, name: true } },
    },
  });

  if (!lead || !canAccessLead(ctx, lead)) return null;

  const [hot, timeline, teamMembers] = await Promise.all([
    computeHotness({
      leadId: lead.id,
      customerId: lead.customerId,
      status: lead.status,
      score: lead.score,
      createdAt: lead.createdAt,
      firstRespondedAt: lead.firstRespondedAt,
    }),
    loadCustomerTimeline({
      leadId: lead.id,
      customerId: lead.customerId,
      take: 100,
    }),
    ctx.canSeeTeamLeads
      ? ctx.isPlatformAdmin
        ? prisma.user
            .findMany({
              where: {
                role: { in: ["AGENT", "ADMIN"] },
                disabledAt: null,
              },
              select: { id: true, name: true, email: true },
              orderBy: [{ name: "asc" }, { email: "asc" }],
              take: 100,
            })
            .then((users) => users.map((user) => ({ user })))
        : prisma.organizationMembership.findMany({
            where: { organizationId: { in: ctx.organizationIds } },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          })
      : Promise.resolve([]),
  ]);

  let savedSearchLabel: string | null = null;
  let savedListings: LeadSummary["savedListings"] = [];
  let savedSearches: LeadSummary["savedSearches"] = [];
  let propertyMonitors: LeadSummary["propertyMonitors"] = [];
  let areaMonitors: LeadSummary["areaMonitors"] = [];
  let listingNotes: LeadSummary["listingNotes"] = [];
  let tours: LeadSummary["tours"] = [];
  let alerts: LeadSummary["alerts"] = [];

  if (lead.customerId) {
    const [
      primarySearch,
      saves,
      searches,
      props,
      areas,
      notes,
      viewingTours,
      customerAlerts,
    ] = await Promise.all([
      prisma.savedSearch.findFirst({
        where: { userId: lead.customerId },
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        select: { name: true, query: true },
      }),
      prisma.savedListing.findMany({
        where: { userId: lead.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, mlsNumber: true },
      }),
      prisma.savedSearch.findMany({
        where: { userId: lead.customerId },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          emailAlerts: true,
          smsAlerts: true,
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
    if (primarySearch) savedSearchLabel = searchLabel(primarySearch);
  }

  const openTasks = lead.tasks.filter((t) => t.status === "OPEN");
  const lastTouch = lead.firstRespondedAt || lead.updatedAt;
  const consented = Boolean(
    lead.contactConsentAt || lead.customer?.caslConsentAt,
  );

  return {
    lead: {
      id: lead.id,
      status: lead.status,
      source: lead.source,
      score: lead.score,
      notes: lead.notes,
      listingMls: lead.listingMls,
      inquiryTag: lead.inquiryTag,
      assignedAgentId: lead.assignedAgentId,
      createdAt: lead.createdAt.toISOString(),
      statusChangedAt: (
        lead.statusChangedAt ?? lead.createdAt
      ).toISOString(),
      firstRespondedAt: lead.firstRespondedAt?.toISOString() ?? null,
      contactConsentAt: lead.contactConsentAt?.toISOString() ?? null,
      lostReason: lead.lostReason,
      winReason: lead.winReason,
      utmSource: lead.utmSource,
      utmCampaign: lead.utmCampaign,
      utmContent: lead.utmContent,
      customer: lead.customer
        ? {
            ...lead.customer,
            emailVerified: lead.customer.emailVerified?.toISOString() ?? null,
            caslConsentAt: lead.customer.caslConsentAt?.toISOString() ?? null,
            emailUpdateRequestedAt:
              lead.customer.emailUpdateRequestedAt?.toISOString() ?? null,
            phoneUpdateRequestedAt:
              lead.customer.phoneUpdateRequestedAt?.toISOString() ?? null,
          }
        : null,
      assignedAgent: lead.assignedAgent,
      adCampaign: lead.adCampaign,
    },
    hot: {
      hotness: hot.hotness,
      views24h: hot.views24h,
      distinctListings24h: hot.distinctListings24h,
      isOnline: hot.isOnline,
      binge: hot.binge,
      lastSeenAt: hot.lastSeenAt?.toISOString() ?? null,
      slaHoursOpen: hot.slaHoursOpen,
    },
    stats: {
      emails: lead.emailLogs.length,
      alerts: alerts.length,
      saves: savedListings.length,
      notes: lead.leadNotes.length,
      openTasks: openTasks.length,
    },
    permissions: {
      canSeeTeamLeads: ctx.canSeeTeamLeads,
      canClaim: !lead.assignedAgentId,
      consented,
    },
    teamMembers: teamMembers.map((m) => ({ user: m.user })),
    savedSearchLabel,
    savedListings,
    savedSearches,
    propertyMonitors,
    areaMonitors,
    listingNotes,
    tours,
    alerts,
    timeline: timeline.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      pinnedAt: item.pinnedAt?.toISOString() ?? null,
    })),
    tasks: lead.tasks.map((t) => ({
      ...t,
      dueAt: t.dueAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
    appointments: lead.appointments.map((a) => ({
      ...a,
      startsAt: a.startsAt?.toISOString() ?? null,
    })),
    emails: lead.emailLogs.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    notes: lead.leadNotes.map((n) => ({
      id: n.id,
      body: n.body,
      category: n.category,
      pinned: n.pinned,
      pinnedAt: n.pinnedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      author: n.author,
    })),
    nextReminder: openTasks[0]
      ? {
          title: openTasks[0].title,
          dueAt: openTasks[0].dueAt.toISOString(),
        }
      : null,
    lastTouchAt: lastTouch.toISOString(),
  };
}

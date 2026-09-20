import type { LeadStatus } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { canAccessLead } from "@/lib/agent";
import { listAssignableCrmAgents } from "@/lib/agent/assignable-agents";
import {
  loadBuyerIntent,
  type BuyerIntentSnapshot,
} from "@/lib/agent/buyer-intent";
import {
  LEAD_PROFILE_EMAIL_LOG_SELECT,
  loadCustomerTimeline,
  type LeadProfileDomainCollections,
} from "@/lib/agent/customer-timeline";
import { computeHotness } from "@/lib/agent/hotness";
import type { InquiryTagValue } from "@/lib/agent/inquiry-tag";
import { displayedCrmClassification } from "@/lib/agent/lead-classification";
import { prisma } from "@/lib/prisma";

export type LeadProfileShell = {
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
      phoneE164: string | null;
      isBuyer: boolean;
      isSeller: boolean;
      purchaseTimeframe: string | null;
      emailVerified: string | null;
      createdAt: string;
      caslConsentAt: string | null;
      termsAcceptedAt: string | null;
      vowAcceptedAt: string | null;
      homeAddress: string | null;
      emailUpdateRequestedAt: string | null;
      phoneUpdateRequestedAt: string | null;
    } | null;
    assignedAgent: { id: string; name: string | null; email: string } | null;
    adCampaign: { id: string; name: string } | null;
  };
  permissions: {
    canSeeTeamLeads: boolean;
    /** Platform Admin only — assign / unassign / pond. */
    canAssignLeads: boolean;
    canClaim: boolean;
    consented: boolean;
  };
  teamMembers: Array<{
    user: { id: string; name: string | null; email: string };
  }>;
  savedSearchLabel: string | null;
  savedSearchQuery: unknown | null;
  lastTouchAt: string;
};

export type LeadProfileActivity = {
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
  /** Inferred or saved “what they’re looking for” for agents. */
  buyerIntent: BuyerIntentSnapshot;
  savedListings: Array<{ id: string; mlsNumber: string }>;
  savedSearches: Array<{
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    isHomepageActive: boolean;
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
    emailPreviewPath?: string | null;
    emailKind?: string | null;
    emailOpenedAt?: string | null;
    emailClickedAt?: string | null;
    emailOpenCount?: number;
    emailClickCount?: number;
    lastClickedUrl?: string | null;
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
    kind: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    openCount: number;
    clickCount: number;
    lastClickedUrl: string | null;
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
};

/** Merged client contract after first-paint + secondary activity. */
export type LeadSummary = LeadProfileShell & LeadProfileActivity;

const EMPTY_DOMAIN: LeadProfileDomainCollections = {
  savedListings: [],
  savedSearches: [],
  propertyMonitors: [],
  areaMonitors: [],
  listingNotes: [],
  tours: [],
  alerts: [],
};

export const LEAD_PROFILE_ACCESS_SELECT = {
  id: true,
  customerId: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  status: true,
  score: true,
  createdAt: true,
  firstRespondedAt: true,
  updatedAt: true,
} as const;

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

function mapLeadCustomer(
  customer: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    phoneE164: string | null;
    purchaseTimeframe: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    caslConsentAt: Date | null;
    termsAcceptedAt: Date | null;
    vowAcceptedAt: Date | null;
    homeAddress: string | null;
    emailUpdateRequestedAt: Date | null;
    phoneUpdateRequestedAt: Date | null;
  },
  lead: {
    isBuyer?: boolean | null;
    isSeller?: boolean | null;
    intent?: string | null;
  },
): LeadProfileShell["lead"]["customer"] {
  return {
    ...customer,
    ...displayedCrmClassification(lead),
    emailVerified: customer.emailVerified?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
    caslConsentAt: customer.caslConsentAt?.toISOString() ?? null,
    termsAcceptedAt: customer.termsAcceptedAt?.toISOString() ?? null,
    vowAcceptedAt: customer.vowAcceptedAt?.toISOString() ?? null,
    emailUpdateRequestedAt:
      customer.emailUpdateRequestedAt?.toISOString() ?? null,
    phoneUpdateRequestedAt:
      customer.phoneUpdateRequestedAt?.toISOString() ?? null,
  };
}

export async function findAccessibleLead(
  ctx: AgentOrgContext,
  leadId: string,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: LEAD_PROFILE_ACCESS_SELECT,
  });
  if (!lead || !canAccessLead(ctx, lead)) return null;
  return lead;
}

export function mergeLeadProfile(
  shell: LeadProfileShell,
  activity: LeadProfileActivity,
): LeadSummary {
  return { ...shell, ...activity };
}

/**
 * First-paint Lead Profile. Identity/contact/assignment only.
 * Does not load timeline, email history, hotness, or buyer-intent.
 */
export async function loadLeadSummary(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileShell | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      source: true,
      score: true,
      notes: true,
      listingMls: true,
      inquiryTag: true,
      assignedAgentId: true,
      organizationId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      statusChangedAt: true,
      firstRespondedAt: true,
      contactConsentAt: true,
      lostReason: true,
      winReason: true,
      utmSource: true,
      utmCampaign: true,
      utmContent: true,
      customerId: true,
      isBuyer: true,
      isSeller: true,
      intent: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneE164: true,
          purchaseTimeframe: true,
          emailVerified: true,
          createdAt: true,
          caslConsentAt: true,
          termsAcceptedAt: true,
          vowAcceptedAt: true,
          homeAddress: true,
          emailUpdateRequestedAt: true,
          phoneUpdateRequestedAt: true,
        },
      },
      assignedAgent: {
        select: { id: true, name: true, email: true },
      },
      adCampaign: { select: { id: true, name: true } },
    },
  });

  if (!lead || !canAccessLead(ctx, lead)) return null;

  const canAssignLeads = ctx.isPlatformAdmin;
  const [primarySearch, teamMembers] = await Promise.all([
    lead.customerId
      ? prisma.savedSearch.findFirst({
          where: { userId: lead.customerId },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          select: { name: true, query: true },
        })
      : Promise.resolve(null),
    canAssignLeads ? listAssignableCrmAgents(ctx) : Promise.resolve([]),
  ]);

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
      statusChangedAt: (lead.statusChangedAt ?? lead.createdAt).toISOString(),
      firstRespondedAt: lead.firstRespondedAt?.toISOString() ?? null,
      contactConsentAt: lead.contactConsentAt?.toISOString() ?? null,
      lostReason: lead.lostReason,
      winReason: lead.winReason,
      utmSource: lead.utmSource,
      utmCampaign: lead.utmCampaign,
      utmContent: lead.utmContent,
      customer: lead.customer ? mapLeadCustomer(lead.customer, lead) : null,
      assignedAgent: lead.assignedAgent,
      adCampaign: lead.adCampaign,
    },
    permissions: {
      canSeeTeamLeads: ctx.canSeeTeamLeads,
      canAssignLeads,
      canClaim: !lead.assignedAgentId,
      consented,
    },
    teamMembers: teamMembers.map((m) => ({ user: m.user })),
    savedSearchLabel: primarySearch ? searchLabel(primarySearch) : null,
    savedSearchQuery: primarySearch?.query ?? null,
    lastTouchAt: lastTouch.toISOString(),
  };
}

async function loadDomainCollections(
  customerId: string,
): Promise<LeadProfileDomainCollections> {
  const [saves, searches, props, areas, notes, viewingTours, customerAlerts] =
    await Promise.all([
      prisma.savedListing.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, mlsNumber: true, createdAt: true },
      }),
      prisma.savedSearch.findMany({
        where: { userId: customerId },
        orderBy: [
          { isHomepageActive: "desc" },
          { isPrimary: "desc" },
          { updatedAt: "desc" },
        ],
        take: 20,
        select: {
          id: true,
          name: true,
          emailAlerts: true,
          smsAlerts: true,
          isHomepageActive: true,
          query: true,
          createdAt: true,
        },
      }),
      prisma.propertyMonitor.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, mlsNumber: true, createdAt: true },
      }),
      prisma.areaMonitor.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          city: true,
          community: true,
          createdAt: true,
        },
      }),
      prisma.listingNote.findMany({
        where: { userId: customerId },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, mlsNumber: true, body: true, updatedAt: true },
      }),
      prisma.viewingTour.findMany({
        where: { userId: customerId },
        orderBy: { updatedAt: "desc" },
        take: 15,
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          stops: {
            orderBy: { sortOrder: "asc" },
            select: { mlsNumber: true },
          },
        },
      }),
      prisma.customerAlert.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          kind: true,
          body: true,
          mlsNumber: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    savedListings: saves,
    savedSearches: searches,
    propertyMonitors: props,
    areaMonitors: areas,
    listingNotes: notes,
    tours: viewingTours,
    alerts: customerAlerts,
  };
}

/**
 * Secondary Lead Profile CRM/engagement payload.
 * Independently authorizes via canAccessLead. Sequences large graphs
 * instead of hydrating timeline + hotness + buyer-intent together.
 */
export async function loadLeadProfileActivity(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileActivity | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      ...LEAD_PROFILE_ACCESS_SELECT,
      customer: { select: { name: true } },
    },
  });

  if (!lead || !canAccessLead(ctx, lead)) return null;

  const [emails, notes, tasks, appointments, domain] = await Promise.all([
    prisma.leadEmailLog.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: LEAD_PROFILE_EMAIL_LOG_SELECT,
    }),
    prisma.leadNote.findMany({
      where: { leadId: lead.id },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 40,
      select: {
        id: true,
        body: true,
        category: true,
        pinned: true,
        pinnedAt: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
    prisma.agentTask.findMany({
      where: { leadId: lead.id },
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
        createdAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        listingMls: true,
        videoJoinUrl: true,
        notes: true,
        createdAt: true,
      },
    }),
    lead.customerId
      ? loadDomainCollections(lead.customerId)
      : Promise.resolve(EMPTY_DOMAIN),
  ]);

  const timeline = await loadCustomerTimeline({
    leadId: lead.id,
    customerId: lead.customerId,
    take: 100,
    collections: {
      emails,
      notes,
      tasks,
      appointments,
    },
    domainCollections: domain,
  });

  const hot = await computeHotness({
    leadId: lead.id,
    customerId: lead.customerId,
    status: lead.status,
    score: lead.score,
    createdAt: lead.createdAt,
    firstRespondedAt: lead.firstRespondedAt,
  });

  const buyerIntent = await loadBuyerIntent({
    customerId: lead.customerId,
    customerName: lead.customer?.name ?? null,
    savedSearches: domain.savedSearches,
  });

  const profileNotes = notes.slice(0, 30);
  const profileAppointments = appointments.slice(0, 30);
  const openTasks = tasks.filter((t) => t.status === "OPEN");
  const savedListings = domain.savedListings.slice(0, 20).map((row) => ({
    id: row.id,
    mlsNumber: row.mlsNumber,
  }));
  const savedSearches = domain.savedSearches.slice(0, 10).map((row) => ({
    id: row.id,
    name: row.name,
    emailAlerts: row.emailAlerts,
    smsAlerts: row.smsAlerts,
    isHomepageActive: row.isHomepageActive,
    query: row.query,
  }));
  const propertyMonitors = domain.propertyMonitors.slice(0, 20).map((row) => ({
    id: row.id,
    mlsNumber: row.mlsNumber,
  }));
  const areaMonitors = domain.areaMonitors.slice(0, 10).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
  }));
  const listingNotes = domain.listingNotes.slice(0, 15).map((row) => ({
    id: row.id,
    mlsNumber: row.mlsNumber,
    body: row.body,
  }));
  const tours = domain.tours.slice(0, 8).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    stops: row.stops,
  }));
  const alerts = domain.alerts.slice(0, 15).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
  }));

  return {
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
      emails: emails.length,
      alerts: alerts.length,
      saves: savedListings.length,
      notes: profileNotes.length,
      openTasks: openTasks.length,
    },
    buyerIntent,
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
      emailOpenedAt: item.emailOpenedAt?.toISOString() ?? null,
      emailClickedAt: item.emailClickedAt?.toISOString() ?? null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      title: t.title,
      body: t.body,
      dueAt: t.dueAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
    appointments: profileAppointments.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      startsAt: a.startsAt?.toISOString() ?? null,
      listingMls: a.listingMls,
      videoJoinUrl: a.videoJoinUrl,
      notes: a.notes,
    })),
    emails: emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      body: e.body,
      toEmail: e.toEmail,
      kind: e.kind,
      openedAt: e.openedAt?.toISOString() ?? null,
      clickedAt: e.clickedAt?.toISOString() ?? null,
      openCount: e.openCount,
      clickCount: e.clickCount,
      lastClickedUrl: e.lastClickedUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    notes: profileNotes.map((n) => ({
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
  };
}

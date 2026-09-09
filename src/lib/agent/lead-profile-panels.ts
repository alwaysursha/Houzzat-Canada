import type { AgentOrgContext } from "@/lib/agent";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import { LEAD_PROFILE_EMAIL_LIST_SELECT } from "@/lib/agent/customer-timeline";
import { findAccessibleLead } from "@/lib/agent/lead-summary";
import { prisma } from "@/lib/prisma";

export type LeadProfileTasksPanel = {
  tasks: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    body: string | null;
    dueAt: string;
    completedAt: string | null;
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
};

export type LeadProfileAppointmentsPanel = {
  appointments: Array<{
    id: string;
    type: string;
    status: string;
    startsAt: string | null;
    listingMls: string | null;
    videoJoinUrl: string | null;
    notes: string | null;
  }>;
};

export type LeadProfileEmailsPanel = {
  emails: Array<{
    id: string;
    subject: string;
    toEmail: string;
    kind: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    openCount: number;
    clickCount: number;
    lastClickedUrl: string | null;
    createdAt: string;
  }>;
  hasMore: boolean;
};

export async function loadLeadProfileTasksPanel(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileTasksPanel | null> {
  const lead = await findAccessibleLead(ctx, leadId);
  if (!lead) return null;
  const [tasks, notes] = await Promise.all([
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
      },
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
  ]);
  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      title: t.title,
      body: t.body,
      dueAt: t.dueAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      category: n.category,
      pinned: n.pinned,
      pinnedAt: n.pinnedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      author: n.author,
    })),
  };
}

export async function loadLeadProfileAppointmentsPanel(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileAppointmentsPanel | null> {
  const lead = await findAccessibleLead(ctx, leadId);
  if (!lead) return null;
  const appointments = await prisma.appointment.findMany({
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
    },
  });
  return {
    appointments: appointments.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      startsAt: a.startsAt?.toISOString() ?? null,
      listingMls: a.listingMls,
      videoJoinUrl: a.videoJoinUrl,
      notes: a.notes,
    })),
  };
}

export async function loadLeadProfileEmailsPanel(
  ctx: AgentOrgContext,
  leadId: string,
  input?: { before?: Date | null; take?: number },
): Promise<LeadProfileEmailsPanel | null> {
  const lead = await findAccessibleLead(ctx, leadId);
  if (!lead) return null;
  const take = Math.min(Math.max(input?.take ?? 20, 1), 40);
  const emails = await prisma.leadEmailLog.findMany({
    where: {
      leadId: lead.id,
      ...(input?.before ? { createdAt: { lt: input.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    select: LEAD_PROFILE_EMAIL_LIST_SELECT,
  });
  const hasMore = emails.length > take;
  const page = emails.slice(0, take);
  return {
    emails: page.map((e) => ({
      id: e.id,
      subject: e.subject,
      toEmail: e.toEmail,
      kind: e.kind,
      openedAt: e.openedAt?.toISOString() ?? null,
      clickedAt: e.clickedAt?.toISOString() ?? null,
      openCount: e.openCount,
      clickCount: e.clickCount,
      lastClickedUrl: e.lastClickedUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    hasMore,
  };
}

export async function loadLeadProfileEngagementPanel(
  ctx: AgentOrgContext,
  leadId: string,
) {
  const lead = await findAccessibleLead(ctx, leadId);
  if (!lead) return null;
  const customerId = lead.customerId;
  if (!customerId) {
    return {
      buyerIntent: await loadBuyerIntent({
        customerId: null,
        customerName: null,
      }),
      savedListings: [],
      savedSearches: [],
      propertyMonitors: [],
      areaMonitors: [],
      listingNotes: [],
      tours: [],
      alerts: [],
    };
  }

  const [saves, searches, props, areas, notes, viewingTours, customerAlerts, customer] =
    await Promise.all([
      prisma.savedListing.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, mlsNumber: true },
      }),
      prisma.savedSearch.findMany({
        where: { userId: customerId },
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
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, mlsNumber: true },
      }),
      prisma.areaMonitor.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true, city: true },
      }),
      prisma.listingNote.findMany({
        where: { userId: customerId },
        orderBy: { updatedAt: "desc" },
        take: 15,
        select: { id: true, mlsNumber: true, body: true },
      }),
      prisma.viewingTour.findMany({
        where: { userId: customerId },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          status: true,
          stops: {
            orderBy: { sortOrder: "asc" },
            select: { mlsNumber: true },
          },
        },
      }),
      prisma.customerAlert.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, title: true, kind: true },
      }),
      prisma.user.findUnique({
        where: { id: customerId },
        select: { name: true },
      }),
    ]);

  const buyerIntent = await loadBuyerIntent({
    customerId,
    customerName: customer?.name ?? null,
    savedSearches: searches,
  });

  return {
    buyerIntent,
    savedListings: saves,
    savedSearches: searches,
    propertyMonitors: props,
    areaMonitors: areas,
    listingNotes: notes,
    tours: viewingTours,
    alerts: customerAlerts,
  };
}

export type LeadProfileEngagementPanel = NonNullable<
  Awaited<ReturnType<typeof loadLeadProfileEngagementPanel>>
>;

/**
 * Stage 3K.5.9.1 — extended workspace-scoped Command Centre loaders.
 */
import { liveSinceDate } from "@/lib/admin/activity";
import { prisma } from "@/lib/prisma";
import { getAdminMlsPulse } from "@/lib/proptx/sync-health";
import {
  tenantCommandCentreAppointmentWhere,
  tenantCommandCentreLeadWhere,
  tenantCommandCentreMemberWhere,
  tenantCommandCentreTaskWhere,
} from "@/lib/admin/tenant-command-centre-auth";

export type TenantCommandCentreStats = {
  workspaceId: string;
  leads24h: number;
  openLeads: number;
  openTasks: number;
  upcomingAppointments: number;
  teamMembers: number;
  agentMembers: number;
  buyerLeads: number;
  sellerLeads: number;
  byStatus: Array<{ status: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  recentLeadActivity: Array<{
    id: string;
    type: string;
    body: string | null;
    createdAt: Date;
    leadId: string;
  }>;
};

export type TenantAnalyticsSnapshot = {
  workspaceId: string;
  leads24h: number;
  leadsWeek: number;
  appointmentsWeek: number;
  openTasks: number;
  newLeads: number;
  contactedOrBetter: number;
  responseRate: number;
  bySource: Array<{ source: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
};

export type TenantPeopleSnapshot = {
  workspaceId: string;
  members: Array<{
    id: string;
    role: string;
    status: string;
    userId: string;
    email: string | null;
    name: string | null;
  }>;
  pendingInvites: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: Date;
  }>;
};

/** First-paint tenant HQ stats — all filtered by workspaceId. */
export async function loadTenantCommandCentreStats(
  workspaceId: string,
): Promise<TenantCommandCentreStats> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  const [
    leads24h,
    openLeads,
    openTasks,
    upcomingAppointments,
    teamMembers,
    agentMembers,
    buyerLeads,
    sellerLeads,
    byStatusRaw,
    bySourceRaw,
    recentLeadActivity,
  ] = await Promise.all([
    prisma.lead
      .count({
        where: {
          ...tenantCommandCentreLeadWhere(workspaceId),
          createdAt: { gte: dayAgo },
        },
      })
      .catch(() => 0),
    prisma.lead
      .count({
        where: {
          ...tenantCommandCentreLeadWhere(workspaceId),
          status: { notIn: ["PAST_CLIENT"] },
        },
      })
      .catch(() => 0),
    prisma.agentTask
      .count({
        where: {
          ...tenantCommandCentreTaskWhere(workspaceId),
          status: "OPEN",
        },
      })
      .catch(() => 0),
    prisma.appointment
      .count({
        where: {
          ...tenantCommandCentreAppointmentWhere(workspaceId),
          status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] },
          startsAt: { gte: now },
        },
      })
      .catch(() => 0),
    prisma.workspaceMember
      .count({ where: tenantCommandCentreMemberWhere(workspaceId) })
      .catch(() => 0),
    prisma.workspaceMember
      .count({
        where: {
          ...tenantCommandCentreMemberWhere(workspaceId),
          role: "AGENT",
        },
      })
      .catch(() => 0),
    prisma.lead
      .count({
        where: {
          ...tenantCommandCentreLeadWhere(workspaceId),
          intent: "BUYER",
        },
      })
      .catch(() => 0),
    prisma.lead
      .count({
        where: {
          ...tenantCommandCentreLeadWhere(workspaceId),
          intent: "SELLER",
        },
      })
      .catch(() => 0),
    prisma.lead
      .groupBy({
        by: ["status"],
        where: tenantCommandCentreLeadWhere(workspaceId),
        _count: { _all: true },
      })
      .catch(() => []),
    prisma.lead
      .groupBy({
        by: ["source"],
        where: tenantCommandCentreLeadWhere(workspaceId),
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
      })
      .catch(() => []),
    prisma.leadActivity
      .findMany({
        where: { lead: { workspaceId } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          type: true,
          body: true,
          createdAt: true,
          leadId: true,
        },
      })
      .catch(() => []),
  ]);

  return {
    workspaceId,
    leads24h,
    openLeads,
    openTasks,
    upcomingAppointments,
    teamMembers,
    agentMembers,
    buyerLeads,
    sellerLeads,
    byStatus: byStatusRaw.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    bySource: bySourceRaw.map((row) => ({
      source: row.source,
      count: row._count._all,
    })),
    recentLeadActivity,
  };
}

export async function loadTenantAnalyticsSnapshot(
  workspaceId: string,
): Promise<TenantAnalyticsSnapshot> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    leads24h,
    leadsWeek,
    appointmentsWeek,
    openTasks,
    newLeads,
    contactedOrBetter,
    bySourceRaw,
    byStatusRaw,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        ...tenantCommandCentreLeadWhere(workspaceId),
        createdAt: { gte: dayAgo },
      },
    }),
    prisma.lead.count({
      where: {
        ...tenantCommandCentreLeadWhere(workspaceId),
        createdAt: { gte: weekAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        ...tenantCommandCentreAppointmentWhere(workspaceId),
        createdAt: { gte: weekAgo },
      },
    }),
    prisma.agentTask.count({
      where: {
        ...tenantCommandCentreTaskWhere(workspaceId),
        status: "OPEN",
      },
    }),
    prisma.lead.count({
      where: {
        ...tenantCommandCentreLeadWhere(workspaceId),
        status: "NEW_LEAD",
      },
    }),
    prisma.lead.count({
      where: {
        ...tenantCommandCentreLeadWhere(workspaceId),
        status: {
          in: [
            "ATTEMPTED_CONTACT",
            "CONTACTED",
            "APPT_SET",
            "APPT_MET",
            "ACTIVE_CLIENT",
            "PENDING_CLIENT",
          ],
        },
      },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: tenantCommandCentreLeadWhere(workspaceId),
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: tenantCommandCentreLeadWhere(workspaceId),
      _count: { _all: true },
    }),
  ]);

  const responseRate =
    newLeads + contactedOrBetter > 0
      ? Math.round((contactedOrBetter / (newLeads + contactedOrBetter)) * 100)
      : 0;

  return {
    workspaceId,
    leads24h,
    leadsWeek,
    appointmentsWeek,
    openTasks,
    newLeads,
    contactedOrBetter,
    responseRate,
    bySource: bySourceRaw.map((row) => ({
      source: row.source,
      count: row._count._all,
    })),
    byStatus: byStatusRaw.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
  };
}

export async function loadTenantPeopleSnapshot(
  workspaceId: string,
): Promise<TenantPeopleSnapshot> {
  const [members, pendingInvites] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: tenantCommandCentreMemberWhere(workspaceId),
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        status: true,
        userId: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    workspaceId,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
    })),
    pendingInvites,
  };
}

/**
 * SHARED listing corpus pulse — aggregate inventory only.
 * Never returns tenant credentials or private feed config.
 */
export async function loadSharedMlsCorpusPulse() {
  return getAdminMlsPulse().catch(() => ({
    provider: "proptx" as const,
    listingCount: 0,
    message: "MLS pulse unavailable.",
  }));
}

/** Live visitor count is platform-global — not used on tenant HQ. */
export function tenantLiveVisitorUnsupportedSince() {
  return liveSinceDate();
}

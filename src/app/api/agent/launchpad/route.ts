import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { agentTaskTenantWhere, leadWhereForDesk, leadScopeWhere } from "@/lib/crm-read-scope";
import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";
import {
  loadLaunchpadAvgResponseMins,
  loadLaunchpadContactRequested,
  loadLaunchpadHotLeads,
  loadLaunchpadOnlineLeads,
} from "@/lib/agent/launchpad-deferred";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const desk = await resolveDeskView(ctx);
  const deskView = (ctx.canSeeTeamLeads ? "team" : "mine") as "mine" | "team";
  const focusAgentId = desk.deskAgentId;
  const deskLeadBase = leadWhereForDesk(ctx, focusAgentId);

  const followUpStatuses = [
    "ATTEMPTED_CONTACT",
    "CONTACTED",
    "PENDING_CLIENT",
  ] as LeadStatus[];
  const callNewLeadsWhere = { ...deskLeadBase, status: "NEW_LEAD" as const };
  const followUpLeadsWhere = {
    ...deskLeadBase,
    status: { in: followUpStatuses },
  };
  const assigneeFilter = focusAgentId
    ? { assigneeId: focusAgentId }
    : ctx.canSeeTeamLeads
      ? {}
      : { assigneeId: ctx.user.id };

  const leadPreviewSelect = {
    id: true,
    status: true,
    customer: { select: { name: true, email: true } },
  } as const;

  const [
    dueTodayTasks,
    overdueTaskCount,
    dueTodayCount,
    newLeadCount,
    contactedCount,
    callNewLeadsRaw,
    contactedLeadsRaw,
    openTasks,
    avgResponseMins,
    onlineLeads,
    hot,
    contactRequested,
  ] = await Promise.all([
    prisma.agentTask.findMany({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        dueAt: { lte: endOfDay },
        ...assigneeFilter,
      },
      orderBy: { dueAt: "asc" },
      take: 12,
      include: {
        lead: {
          select: {
            id: true,
            listingMls: true,
            source: true,
            notes: true,
            inquiryTag: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.agentTask.count({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        dueAt: { lt: now },
        ...assigneeFilter,
      },
    }),
    prisma.agentTask.count({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        dueAt: { gte: startOfDay, lte: endOfDay },
        ...assigneeFilter,
      },
    }),
    prisma.lead.count({ where: callNewLeadsWhere }),
    prisma.lead.count({ where: followUpLeadsWhere }),
    prisma.lead.findMany({
      where: callNewLeadsWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: leadPreviewSelect,
    }),
    prisma.lead.findMany({
      where: followUpLeadsWhere,
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: leadPreviewSelect,
    }),
    prisma.agentTask.findMany({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "OPEN",
        ...assigneeFilter,
      },
      orderBy: { dueAt: "asc" },
      take: 20,
      include: {
        lead: {
          select: {
            id: true,
            listingMls: true,
            notes: true,
            inquiryTag: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    }),
    loadLaunchpadAvgResponseMins({ ctx, focusAgentId }),
    loadLaunchpadOnlineLeads({ ctx, deskView, focusAgentId }),
    loadLaunchpadHotLeads(ctx),
    loadLaunchpadContactRequested({ ctx, focusAgentId }),
  ]);

  return NextResponse.json({
    ok: true,
    deskView,
    focusAgentId,
    dueTodayCount,
    overdueTaskCount,
    newLeadCount,
    contactedCount,
    callNewLeads: callNewLeadsRaw,
    contactedLeads: contactedLeadsRaw,
    openTasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      dueAt: t.dueAt.toISOString(),
      overdue: t.dueAt.getTime() < now.getTime(),
      lead: t.lead ? { id: t.lead.id, customer: t.lead.customer } : null,
    })),
    todoTasks: (dueTodayTasks.length ? dueTodayTasks : openTasks.slice(0, 8)).map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      type: t.type,
      dueAt: t.dueAt.toISOString(),
      lead: t.lead ? {
        id: t.lead.id,
        listingMls: t.lead.listingMls,
        notes: t.lead.notes,
        inquiryTag: t.lead.inquiryTag,
        customer: t.lead.customer,
      } : null,
    })),
    avgResponseMins,
    onlineLeads,
    hotCount: hot.hotCount,
    hotLeads: hot.hotLeads,
    contactRequested,
  });
}

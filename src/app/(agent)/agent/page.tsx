import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LeadStatus } from "@prisma/client";
import {
  LaunchpadDeferredContact,
  LaunchpadDeferredQuickModules,
} from "@/components/agent/LaunchpadDeferredSections";
import { LaunchpadTodoCarousel } from "@/components/agent/LaunchpadTodoCarousel";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import { DESK_AGENT_COOKIE, resolveDeskView } from "@/lib/agent/brokerage";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Launchpad · Agent CRM" };

export default async function AgentLaunchpadPage() {
  // cookies() before Prisma (Worker-safe); listTeamAgents is request-cached.
  const deskCookie =
    (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;

  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent");

  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const desk = await resolveDeskView({ ...ctx, deskCookie });
  const scopeMine = leadScopeWhere(ctx, "mine");
  const scopeTeam = leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
  const deskView = (ctx.canSeeTeamLeads ? "team" : "mine") as "mine" | "team";
  const focusAgentId = desk.deskAgentId;

  const followUpStatuses = [
    "ATTEMPTED_CONTACT",
    "CONTACTED",
    "PENDING_CLIENT",
  ] as LeadStatus[];
  const callNewLeadsWhere = focusAgentId
    ? {
        organizationId: ctx.organizationId,
        assignedAgentId: focusAgentId,
        status: "NEW_LEAD" as const,
      }
    : ctx.canSeeTeamLeads
      ? { ...scopeTeam, status: "NEW_LEAD" as const }
      : {
          ...scopeMine,
          status: "NEW_LEAD" as const,
          assignedAgentId: ctx.user.id,
        };
  const followUpLeadsWhere = focusAgentId
    ? {
        organizationId: ctx.organizationId,
        assignedAgentId: focusAgentId,
        status: { in: followUpStatuses },
      }
    : ctx.canSeeTeamLeads
      ? {
          ...scopeTeam,
          status: { in: followUpStatuses },
        }
      : {
          ...scopeMine,
          assignedAgentId: ctx.user.id,
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

  // Critical path only — first visible counts, previews, and todo carousel.
  const [
    dueTodayTasks,
    overdueTaskCount,
    dueTodayCount,
    newLeadCount,
    contactedCount,
    callNewLeadsRaw,
    contactedLeadsRaw,
    openTasks,
  ] = await Promise.all([
    prisma.agentTask.findMany({
      where: {
        organizationId: ctx.organizationId,
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
        organizationId: ctx.organizationId,
        status: "OPEN",
        dueAt: { lt: now },
        ...assigneeFilter,
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ctx.organizationId,
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
        organizationId: ctx.organizationId,
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
  ]);

  const dateLabel = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const todoRows = dueTodayTasks.length ? dueTodayTasks : openTasks.slice(0, 8);

  const moduleTasks = openTasks.slice(0, 40).map((task) => ({
    id: task.id,
    title: task.title,
    type: task.type,
    dueAt: task.dueAt.toISOString(),
    overdue: task.dueAt.getTime() < now.getTime(),
    lead: task.lead
      ? {
          id: task.lead.id,
          customer: task.lead.customer,
        }
      : null,
  }));

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#1e2a38] sm:text-[28px]">
          {dateLabel}
        </h1>
        <p className="mt-1 text-[13px] font-semibold text-[#2b6cb0] sm:font-medium">
          Today you have{" "}
          <span className="tabular-nums">{dueTodayCount}</span> task
          {dueTodayCount === 1 ? "" : "s"} due
          {overdueTaskCount > 0 ? (
            <>
              {" "}
              · <span className="tabular-nums">{overdueTaskCount}</span> overdue
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <aside className="order-1 min-w-0 space-y-3 xl:order-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[#1e2a38]">
              Quick Modules
            </h2>
            <Link
              href="/agent"
              className="text-[11px] font-bold uppercase tracking-wide text-canopy hover:underline"
            >
              Refresh
            </Link>
          </div>

          <LaunchpadDeferredQuickModules
            ctx={ctx}
            deskView={deskView}
            focusAgentId={focusAgentId}
            callNewCount={newLeadCount}
            callNewLeads={callNewLeadsRaw}
            contactedCount={contactedCount}
            contactedLeads={contactedLeadsRaw}
            overdueTaskCount={overdueTaskCount}
            dueTodayCount={dueTodayCount}
            tasks={moduleTasks}
          />
        </aside>

        <div className="order-2 min-w-0 space-y-4 xl:order-1">
          <LaunchpadTodoCarousel
            totalOpen={openTasks.length}
            tasks={todoRows.map((task) => ({
              id: task.id,
              title: task.title,
              body: task.body,
              type: task.type,
              dueAt: task.dueAt.toISOString(),
              lead: task.lead
                ? {
                    id: task.lead.id,
                    listingMls: task.lead.listingMls,
                    notes: task.lead.notes,
                    inquiryTag: task.lead.inquiryTag,
                    customer: task.lead.customer,
                  }
                : null,
            }))}
          />

          <LaunchpadDeferredContact ctx={ctx} focusAgentId={focusAgentId} />
        </div>
      </div>
    </div>
  );
}

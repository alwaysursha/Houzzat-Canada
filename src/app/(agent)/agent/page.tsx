import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeadStatus } from "@prisma/client";
import { ContactRequestedPanel } from "@/components/agent/ContactRequestedPanel";
import { LaunchpadTodoCarousel } from "@/components/agent/LaunchpadTodoCarousel";
import { QuickModulesPanel } from "@/components/agent/QuickModulesPanel";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { computeHotnessMap, findOnlineUserIds } from "@/lib/agent/hotness";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Launchpad · Agent CRM" };

export default async function AgentLaunchpadPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent");

  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const desk = await resolveDeskView(ctx);
  const scopeMine = leadScopeWhere(ctx, "mine");
  const scopeTeam = leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
  const deskView = ctx.canSeeTeamLeads ? "team" : "mine";

  // Team Leader viewing a specific agent → that agent's desk numbers.
  // Team overview → whole brokerage. Field agent → own desk.
  const focusAgentId = desk.deskAgentId;
  const followUpStatuses = [
    "ATTEMPTED_CONTACT",
    "CONTACTED",
    "PENDING_CLIENT",
  ] as LeadStatus[];
  const contactRequestedStatuses = [
    "NEW_LEAD",
    "ATTEMPTED_CONTACT",
    "CONTACTED",
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
  const contactRequestedWhere = {
    ...scopeTeam,
    status: { in: contactRequestedStatuses },
    inquiryTag: null,
    ...(focusAgentId ? { assignedAgentId: focusAgentId } : {}),
  };

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
    contactRequested,
    openTasks,
    recentLeads,
    respondedLeads,
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
      take: 40,
      select: leadPreviewSelect,
    }),
    prisma.lead.findMany({
      where: followUpLeadsWhere,
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: leadPreviewSelect,
    }),
    prisma.lead.findMany({
      where: contactRequestedWhere,
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            isBuyer: true,
            isSeller: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
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
    prisma.lead.findMany({
      where: scopeTeam,
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        customer: {
          select: { name: true, email: true, isBuyer: true, isSeller: true },
        },
      },
    }),
    // Response time = avg(NEW_LEAD → ATTEMPTED_CONTACT) for this desk.
    prisma.lead.findMany({
      where: {
        organizationId: ctx.organizationId,
        firstRespondedAt: { not: null },
        ...(focusAgentId
          ? { assignedAgentId: focusAgentId }
          : ctx.canSeeTeamLeads
            ? { assignedAgentId: { not: null } }
            : { assignedAgentId: ctx.user.id }),
      },
      select: { createdAt: true, firstRespondedAt: true },
      take: 2000,
    }),
  ]);

  const hotMap = await computeHotnessMap(
    recentLeads.map((l) => ({
      id: l.id,
      customerId: l.customerId,
      status: l.status,
      score: l.score,
      createdAt: l.createdAt,
      firstRespondedAt: l.firstRespondedAt,
    })),
  );

  const responseMins = respondedLeads
    .map((l) => {
      if (!l.firstRespondedAt) return null;
      const mins =
        (l.firstRespondedAt.getTime() - l.createdAt.getTime()) / 60_000;
      return mins >= 0 ? mins : null;
    })
    .filter((n): n is number => n != null);
  const avgResponseMins =
    responseMins.length === 0
      ? 0
      : Math.round(
          responseMins.reduce((sum, n) => sum + n, 0) / responseMins.length,
        );

  const onlineUserIds = await findOnlineUserIds();
  const onlineLeadsRaw =
    onlineUserIds.length === 0
      ? []
      : await prisma.lead.findMany({
          where: {
            ...leadScopeWhere(ctx, deskView),
            customerId: { in: onlineUserIds },
            ...(focusAgentId ? { assignedAgentId: focusAgentId } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            status: true,
            customerId: true,
            score: true,
            createdAt: true,
            firstRespondedAt: true,
            customer: { select: { name: true, email: true } },
          },
        });
  const onlineHotMap = await computeHotnessMap(
    onlineLeadsRaw.map((l) => ({
      id: l.id,
      customerId: l.customerId,
      status: l.status,
      score: l.score,
      createdAt: l.createdAt,
      firstRespondedAt: l.firstRespondedAt,
    })),
  );
  const onlineLeads = onlineLeadsRaw
    .map((l) => {
      const hot = onlineHotMap.get(l.id);
      return {
        id: l.id,
        status: l.status,
        customer: l.customer,
        lastSeenAt: hot?.lastSeenAt?.toISOString() ?? null,
        isOnline: hot?.isOnline ?? true,
      };
    })
    .filter((l) => l.isOnline)
    .sort((a, b) => {
      const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bt - at;
    });

  const dateLabel = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const todoRows = dueTodayTasks.length ? dueTodayTasks : openTasks.slice(0, 8);

  const hotLeads = recentLeads
    .filter((l) => (hotMap.get(l.id)?.hotness ?? 0) >= 60)
    .slice(0, 40)
    .map((l) => ({
      id: l.id,
      status: l.status,
      customer: l.customer
        ? { name: l.customer.name, email: l.customer.email }
        : null,
      meta: `Score ${hotMap.get(l.id)?.hotness ?? 0}`,
    }));

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
    <div className="space-y-4">
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

      {/* Mobile priority strip — critical counts always visible */}
      <div className="grid grid-cols-2 gap-2 xl:hidden">
        <Link
          href={`/agent/leads?view=${deskView}&pipeline=NEW_LEAD`}
          className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-3 active:scale-[0.99]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#e11d48]">
            Call new
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[#9f1239]">
            {newLeadCount}
          </p>
        </Link>
        <Link
          href="/agent/tasks"
          className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-3 active:scale-[0.99]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#d97706]">
            Due today
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[#92400e]">
            {dueTodayCount}
          </p>
        </Link>
        <Link
          href={`/agent/leads?view=${deskView}&pipeline=FOLLOW_UP`}
          className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 active:scale-[0.99]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
            Follow up
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[#1e2a38]">
            {contactedCount}
          </p>
        </Link>
        <Link
          href="/agent/leads?view=mine"
          className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-3 active:scale-[0.99]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-canopy">
            Hot now
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-canopy-deep">
            {
              recentLeads.filter((l) => (hotMap.get(l.id)?.hotness ?? 0) >= 60)
                .length
            }
          </p>
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Quick Modules — first on mobile so actions stay above the fold */}
        <aside className="order-1 space-y-3 xl:order-2">
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

          <QuickModulesPanel
            deskView={deskView}
            callNewCount={newLeadCount}
            callNewLeads={callNewLeadsRaw}
            contactedCount={contactedCount}
            contactedLeads={contactedLeadsRaw}
            overdueTaskCount={overdueTaskCount}
            dueTodayCount={dueTodayCount}
            tasks={moduleTasks}
            avgResponseMins={avgResponseMins}
            onlineLeads={onlineLeads}
            hotCount={hotLeads.length}
            hotLeads={hotLeads}
          />
        </aside>

        <div className="order-2 space-y-4 xl:order-1">
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

          <ContactRequestedPanel
            leads={contactRequested.map((lead) => {
              const hot = hotMap.get(lead.id);
              return {
                id: lead.id,
                source: lead.source,
                status: lead.status,
                notes: lead.notes,
                listingMls: lead.listingMls,
                inquiryTag: lead.inquiryTag,
                createdAt: lead.createdAt.toISOString(),
                customer: lead.customer
                  ? {
                      name: lead.customer.name,
                      email: lead.customer.email,
                      isBuyer: lead.customer.isBuyer,
                      isSeller: lead.customer.isSeller,
                      emailVerified: Boolean(lead.customer.emailVerified),
                      createdAt: lead.customer.createdAt.toISOString(),
                    }
                  : null,
                isOnline: hot?.isOnline,
                binge: hot?.binge,
              };
            })}
          />
        </div>
      </div>
    </div>
  );
}

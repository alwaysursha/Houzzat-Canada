import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Phone,
  Timer,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { ContactRequestedPanel } from "@/components/agent/ContactRequestedPanel";
import { TaskCompleteButton } from "@/components/agent/TaskForm";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import {
  INQUIRY_TAG_LABEL,
  INQUIRY_TAG_STYLE,
} from "@/lib/agent/inquiry-tag";
import { computeHotnessMap } from "@/lib/agent/hotness";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata = { title: "Launchpad · Agent CRM" };

function ModuleCard({
  href,
  title,
  subtitle,
  tone,
  icon: Icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  tone: "danger" | "warn" | "info" | "ok";
  icon: LucideIcon;
}) {
  const tones = {
    danger: "border-l-[#e11d48] text-[#e11d48]",
    warn: "border-l-[#f59e0b] text-[#d97706]",
    info: "border-l-[#2b6cb0] text-[#2b6cb0]",
    ok: "border-l-canopy text-canopy-deep",
  } as const;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md border border-[#d8dee6] border-l-4 bg-white px-3 py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition hover:bg-[#f8fafc]",
        tones[tone],
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#1e2a38]">{title}</p>
        <p className="text-[12px] text-[#5b6775]">{subtitle}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[#94a3b8]" />
    </Link>
  );
}

export default async function AgentLaunchpadPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent");

  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const scopeMine = leadScopeWhere(ctx, "mine");
  const scopeTeam = leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
  const assigneeFilter = ctx.canSeeTeamLeads
    ? {}
    : { assigneeId: ctx.user.id };

  const [
    dueTodayTasks,
    overdueTaskCount,
    dueTodayCount,
    newLeadCount,
    contactedCount,
    contactRequested,
    openTasks,
    recentLeads,
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
    prisma.lead.count({ where: { ...scopeMine, status: "NEW_LEAD" } }),
    prisma.lead.count({
      where: {
        ...scopeMine,
        status: {
          in: ["ATTEMPTED_CONTACT", "CONTACTED", "PENDING_CLIENT"],
        },
      },
    }),
    prisma.lead.findMany({
      where: {
        ...scopeTeam,
        status: { in: ["NEW_LEAD", "ATTEMPTED_CONTACT", "CONTACTED"] },
        /** Tagged leads leave Contact Requested once handled. */
        inquiryTag: null,
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        customer: {
          select: { name: true, email: true, isBuyer: true, isSeller: true },
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

  const responded = recentLeads.filter((l) => l.firstRespondedAt);
  const avgResponseMins =
    responded.length === 0
      ? 0
      : Math.round(
          responded.reduce((sum, l) => {
            const mins =
              (l.firstRespondedAt!.getTime() - l.createdAt.getTime()) /
              60000;
            return sum + Math.max(0, mins);
          }, 0) / responded.length,
        );

  const dateLabel = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const todoRows = dueTodayTasks.length ? dueTodayTasks : openTasks.slice(0, 8);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#1e2a38]">
          {dateLabel}
        </h1>
        <p className="mt-1 text-[13px] font-medium text-[#2b6cb0]">
          Today you have {dueTodayCount} Reminders Due and {dueTodayCount} Tasks
          Due.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* To Do */}
          <section className="overflow-hidden rounded-md border border-[#d8dee6] border-t-[3px] border-t-[#f59e0b] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e8edf2] px-4 py-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-[#5b6775]" />
                <h2 className="text-[15px] font-semibold text-[#1e2a38]">To Do</h2>
                <span className="text-[12px] text-[#94a3b8]">
                  Showing {todoRows.length} of {openTasks.length}
                </span>
              </div>
              <Link
                href="/agent/tasks"
                className="rounded border border-[#c7d2e0] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2b6cb0] hover:bg-[#f1f5f9]"
              >
                See all
              </Link>
            </div>
            {todoRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#94a3b8]">
                No reminders or tasks found.
              </p>
            ) : (
              <ul className="divide-y divide-[#eef2f6]">
                {todoRows.map((task) => {
                  const overdue = task.dueAt < now;
                  return (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 px-4 py-3.5"
                    >
                      <Circle className="mt-0.5 size-4 shrink-0 text-[#94a3b8]" />
                      <div className="min-w-0 flex-1">
                        {task.lead ? (
                          <Link
                            href={`/agent/leads/${task.lead.id}`}
                            className="text-[13px] font-semibold text-[#2b6cb0] hover:underline"
                          >
                            {task.title}
                          </Link>
                        ) : (
                          <p className="text-[13px] font-semibold text-[#1e2a38]">
                            {task.title}
                          </p>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#5b6775]">
                          <span>
                            {task.lead?.customer?.name ||
                              task.lead?.customer?.email ||
                              task.type}
                            {task.lead?.listingMls
                              ? ` · ${task.lead.listingMls}`
                              : ""}
                          </span>
                          {task.lead?.inquiryTag ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                INQUIRY_TAG_STYLE[task.lead.inquiryTag].soft,
                              )}
                            >
                              {INQUIRY_TAG_LABEL[task.lead.inquiryTag]}
                            </span>
                          ) : null}
                        </p>
                        {task.body || task.lead?.notes ? (
                          <p className="mt-1 line-clamp-2 text-[12px] text-[#64748b]">
                            {task.body || task.lead?.notes}
                          </p>
                        ) : null}
                        <p
                          className={cn(
                            "mt-1 text-[12px] font-medium",
                            overdue ? "text-[#e11d48]" : "text-[#64748b]",
                          )}
                        >
                          {task.dueAt.toLocaleString("en-CA", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <TaskCompleteButton taskId={task.id} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
                customer: lead.customer,
                isOnline: hot?.isOnline,
                binge: hot?.binge,
              };
            })}
          />
        </div>

        {/* Quick Modules */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[#1e2a38]">
              Quick Modules
            </h2>
            <div className="flex gap-2 text-[11px] font-bold uppercase tracking-wide">
              <Link href="/agent" className="text-canopy hover:underline">
                Refresh
              </Link>
              <Link href="/agent/leads" className="text-[#2b6cb0] hover:underline">
                Edit
              </Link>
            </div>
          </div>

          <div className="space-y-2.5">
            <ModuleCard
              href="/agent/leads?view=mine"
              title="Call New Leads"
              subtitle={`${newLeadCount} new leads to call`}
              tone="danger"
              icon={Phone}
            />
            <ModuleCard
              href="/agent/leads?view=mine"
              title="Contacted Leads"
              subtitle={`${contactedCount} clients to follow up with`}
              tone="danger"
              icon={UserRound}
            />
            <ModuleCard
              href="/agent/tasks"
              title="Due Reminders"
              subtitle={`${overdueTaskCount} Overdue | ${dueTodayCount} Due Today`}
              tone="warn"
              icon={Bell}
            />
            <ModuleCard
              href="/agent/tasks"
              title="Due Tasks"
              subtitle={`${overdueTaskCount} Overdue | ${dueTodayCount} Due Today`}
              tone="warn"
              icon={CheckCircle2}
            />
            <ModuleCard
              href="/agent/leads"
              title="Statistics"
              subtitle={`Response Time · ${avgResponseMins} mins`}
              tone="info"
              icon={Timer}
            />
            <ModuleCard
              href="/agent/leads?view=mine"
              title="Hot pipeline"
              subtitle={`${recentLeads.filter((l) => (hotMap.get(l.id)?.hotness ?? 0) >= 60).length} leads scoring hot right now`}
              tone="ok"
              icon={TrendingUp}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

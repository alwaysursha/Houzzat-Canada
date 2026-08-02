import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadActions } from "@/components/agent/LeadActions";
import {
  LeadsTableClient,
  type LeadRow,
} from "@/components/agent/LeadsTableClient";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import { computeHotnessMap } from "@/lib/agent/hotness";
import { loadLeadsDashboardEngagement } from "@/lib/agent/leads-dashboard";
import { prisma } from "@/lib/prisma";
import { PIPELINE_STATUSES, pipelineLabel } from "@/lib/agent/pipeline";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads · Agent CRM" };

const COLUMNS = PIPELINE_STATUSES;

export default async function AgentLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; layout?: string }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/leads");
  const params = await searchParams;

  const viewParam = params.view;
  const view =
    viewParam === "pond" || viewParam === "team" || viewParam === "mine"
      ? viewParam
      : ctx.canSeeTeamLeads
        ? "team"
        : "mine";
  const layout = params.layout === "kanban" ? "kanban" : "table";

  const where = leadScopeWhere(ctx, view);

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 200,
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
          phoneVerifiedAt: true,
        },
      },
      assignedAgent: { select: { name: true, email: true } },
      tasks: {
        where: { status: "OPEN" },
        orderBy: { dueAt: "asc" },
        take: 1,
        select: { dueAt: true },
      },
    },
  });

  const [hotMap, engagement] = await Promise.all([
    computeHotnessMap(
      leads.map((l) => ({
        id: l.id,
        customerId: l.customerId,
        status: l.status,
        score: l.score,
        createdAt: l.createdAt,
        firstRespondedAt: l.firstRespondedAt,
      })),
    ),
    loadLeadsDashboardEngagement(
      leads.map((l) => l.customerId).filter((id): id is string => Boolean(id)),
      leads.map((l) => l.id),
    ),
  ]);

  const rows: LeadRow[] = leads
    .map((l) => {
      const hot = hotMap.get(l.id)!;
      const eng = l.customerId
        ? engagement.byCustomer.get(l.customerId)
        : undefined;
      return {
        id: l.id,
        source: l.source,
        status: l.status,
        score: l.score,
        listingMls: l.listingMls,
        assignedAgentId: l.assignedAgentId,
        createdAt: l.createdAt.toISOString(),
        firstRespondedAt: l.firstRespondedAt?.toISOString() ?? null,
        updatedAt: l.updatedAt.toISOString(),
        customer: l.customer
          ? {
              id: l.customer.id,
              name: l.customer.name,
              email: l.customer.email,
              phone: eng?.phone ?? l.customer.phone,
              isBuyer: l.customer.isBuyer,
              isSeller: l.customer.isSeller,
              emailVerified: Boolean(l.customer.emailVerified),
              phoneVerified: Boolean(l.customer.phoneVerifiedAt),
            }
          : null,
        assignedAgent: l.assignedAgent,
        nextReminder: l.tasks[0]?.dueAt.toISOString() ?? null,
        openTaskCount: engagement.taskCountByLead.get(l.id) ?? 0,
        hotness: hot.hotness,
        views24h: hot.views24h,
        isOnline: hot.isOnline,
        binge: hot.binge,
        lastSeenAt: hot.lastSeenAt?.toISOString() ?? null,
        slaHoursOpen: hot.slaHoursOpen,
        saves: eng?.saves ?? 0,
        searches: eng?.searches ?? 0,
        inquiries: eng?.inquiries ?? 0,
        loginCount: eng?.loginCount ?? 0,
        priceCity: eng?.priceCity ?? null,
        inquiryTag: l.inquiryTag,
      };
    })
    .sort((a, b) => b.hotness - a.hotness);

  const views = [
    { id: "mine", label: "My leads" },
    { id: "pond", label: "Pond" },
    ...(ctx.canSeeTeamLeads ? [{ id: "team", label: "All team" }] : []),
  ] as const;

  const teamMembers = ctx.canSeeTeamLeads
    ? ctx.isPlatformAdmin
      ? (
          await prisma.user.findMany({
            where: {
              role: { in: ["AGENT", "ADMIN"] },
              disabledAt: null,
            },
            select: { id: true, name: true, email: true },
            orderBy: [{ name: "asc" }, { email: "asc" }],
            take: 100,
          })
        ).map((user) => ({ user }))
      : await prisma.organizationMembership.findMany({
          where: { organizationId: { in: ctx.organizationIds } },
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        })
    : [];

  // Dedupe by user id when pulling across orgs.
  const assignableAgents = Array.from(
    new Map(teamMembers.map((m) => [m.user.id, m])).values(),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Leads</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            {rows.length} in view
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <Link
              key={v.id}
              href={`/agent/leads?view=${v.id}&layout=${layout}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                view === v.id
                  ? "bg-[#6b8fad] text-white"
                  : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]",
              )}
            >
              {v.label}
            </Link>
          ))}
          <Link
            href={`/agent/leads?view=${view}&layout=table`}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold",
              layout === "table"
                ? "bg-[#5a6878] text-white"
                : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0]",
            )}
          >
            Table
          </Link>
          <Link
            href={`/agent/leads?view=${view}&layout=kanban`}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold",
              layout === "kanban"
                ? "bg-[#5a6878] text-white"
                : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0]",
            )}
          >
            Board
          </Link>
        </div>
      </div>

      {layout === "table" ? (
        <LeadsTableClient
          leads={rows}
          canClaimPond
          canAssign={ctx.canSeeTeamLeads}
          teamMembers={assignableAgents}
          view={view}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((status) => {
            const columnLeads = leads.filter((l) => l.status === status);
            return (
              <div
                key={status}
                className="min-w-[240px] flex-1 rounded-xl border border-[#d8dee6] bg-white p-3"
              >
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                  {pipelineLabel(status)} · {columnLeads.length}
                </h2>
                <ul className="space-y-2">
                  {columnLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm"
                    >
                      <Link
                        href={`/agent/leads/${lead.id}`}
                        className="font-semibold text-[#2563eb] hover:underline"
                      >
                        {lead.customer?.name ||
                          lead.customer?.email ||
                          lead.source.replaceAll("_", " ")}
                      </Link>
                      <p className="mt-1 text-xs text-[#64748b]">
                        Hot {hotMap.get(lead.id)?.hotness ?? lead.score}
                        {lead.listingMls ? ` · ${lead.listingMls}` : ""}
                      </p>
                      <div className="mt-2">
                        <LeadActions
                          leadId={lead.id}
                          status={lead.status}
                          canClaim={!lead.assignedAgentId}
                          statusChangedAt={lead.statusChangedAt}
                          createdAt={lead.createdAt}
                          showStatus
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

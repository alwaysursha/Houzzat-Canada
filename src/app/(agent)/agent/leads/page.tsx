import { redirect } from "next/navigation";
import Link from "next/link";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import type { LeadStatus } from "@prisma/client";
import { LeadActions } from "@/components/agent/LeadActions";
import { LeadAccountVerifyMenu } from "@/components/agent/LeadAccountVerifyMenu";
import { LeadQueryPopup } from "@/components/agent/LeadQueryPopup";
import { KanbanLeadLink } from "@/components/agent/KanbanLeadLink";
import {
  LeadsTableClient,
  type LeadRow,
} from "@/components/agent/LeadsTableClient";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import { listAssignableCrmAgents } from "@/lib/agent/assignable-agents";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { computeHotnessMap, findOnlineUserIds } from "@/lib/agent/hotness";
import { displayedCrmClassification } from "@/lib/agent/lead-classification";
import { loadLeadsDashboardEngagement } from "@/lib/agent/leads-dashboard";
import { selectPrimaryLeadsByCustomer } from "@/lib/agent/select-primary-leads-by-customer";
import { prisma } from "@/lib/prisma";
import { PIPELINE_STATUSES, pipelineLabel } from "@/lib/agent/pipeline";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

export const metadata = { title: "Leads · Agent CRM" };

const COLUMNS = PIPELINE_STATUSES;

export default async function AgentLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    layout?: string;
    pipeline?: string;
    online?: string;
  }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent/leads"));
  const params = await searchParams;

  const viewParam = params.view;
  const view =
    viewParam === "pond" || viewParam === "team" || viewParam === "mine"
      ? viewParam
      : ctx.canSeeTeamLeads
        ? "team"
        : "mine";
  const layout = params.layout === "kanban" ? "kanban" : "table";
  const pipelineParam = params.pipeline?.trim() || null;
  const onlineOnly =
    params.online === "1" || params.online === "true";
  const pipeline =
    pipelineParam &&
    PIPELINE_STATUSES.includes(
      pipelineParam as (typeof PIPELINE_STATUSES)[number],
    )
      ? (pipelineParam as (typeof PIPELINE_STATUSES)[number])
      : null;
  const followUpPipeline = pipelineParam === "FOLLOW_UP";
  const desk = await resolveDeskView(ctx);
  const focusAgentId = desk.deskAgentId;
  const followUpStatuses: LeadStatus[] = [
    "ATTEMPTED_CONTACT",
    "CONTACTED",
    "PENDING_CLIENT",
  ];

  const onlineUserIds = onlineOnly ? await findOnlineUserIds() : [];

  const where = {
    ...leadScopeWhere(ctx, view),
    ...(pipeline ? { status: pipeline } : {}),
    ...(followUpPipeline
      ? {
          status: {
            in: followUpStatuses,
          },
        }
      : {}),
    ...(focusAgentId ? { assignedAgentId: focusAgentId } : {}),
    // Field agents: Call New Leads = assigned to me.
    ...(pipeline === "NEW_LEAD" &&
    view === "mine" &&
    !ctx.canSeeTeamLeads &&
    !focusAgentId
      ? { assignedAgentId: ctx.user.id }
      : {}),
    ...(onlineOnly ? { customerId: { in: onlineUserIds } } : {}),
  };

  const fetchedLeads = await prisma.lead.findMany({
    where:
      onlineOnly && onlineUserIds.length === 0
        ? { id: "__no_online_leads__" }
        : where,
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: onlineOnly ? 200 : 100,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneE164: true,
          purchaseTimeframe: true,
          emailVerified: true,
          phoneVerifiedAt: true,
          createdAt: true,
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

  // Same person can have multiple Lead rows; desk shows one card per customer.
  const leads = selectPrimaryLeadsByCustomer(fetchedLeads);

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
              phoneE164: l.customer.phoneE164,
              ...displayedCrmClassification(l),
              purchaseTimeframe: l.customer.purchaseTimeframe,
              emailVerified: Boolean(l.customer.emailVerified),
              phoneVerified: Boolean(l.customer.phoneVerifiedAt),
              createdAt: l.customer.createdAt.toISOString(),
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
    .sort((a, b) => {
      if (onlineOnly) {
        const aSeen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bSeen = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        if (bSeen !== aSeen) return bSeen - aSeen;
      }
      return b.hotness - a.hotness;
    });

  const filterQs = [
    pipelineParam ? `pipeline=${encodeURIComponent(pipelineParam)}` : null,
    onlineOnly ? "online=1" : null,
  ]
    .filter(Boolean)
    .join("&");
  const filterSuffix = filterQs ? `&${filterQs}` : "";

  const views = [
    { id: "mine", label: "My leads" },
    { id: "pond", label: "Pond" },
    ...(ctx.canSeeTeamLeads ? [{ id: "team", label: "All team" }] : []),
  ] as const;

  const teamMembers = await listAssignableCrmAgents(ctx);

  // Dedupe by user id when pulling across orgs.
  const assignableAgents = Array.from(
    new Map(teamMembers.map((m) => [m.user.id, m])).values(),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a38] sm:text-2xl">
            {onlineOnly
              ? "Online Leads"
              : pipeline === "NEW_LEAD"
                ? "Call New Leads"
                : followUpPipeline
                  ? "Contacted Leads"
                  : "Leads"}
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[#64748b] sm:text-sm sm:font-normal">
            {onlineOnly
              ? `${rows.length} lead${rows.length === 1 ? "" : "s"} active on the site (last 3 min)`
              : pipeline === "NEW_LEAD"
                ? `${rows.length} new lead${rows.length === 1 ? "" : "s"} waiting for first contact`
                : followUpPipeline
                  ? `${rows.length} lead${rows.length === 1 ? "" : "s"} in follow-up`
                  : `${rows.length} in view`}
            {!onlineOnly && pipeline && pipeline !== "NEW_LEAD"
              ? ` · ${pipelineLabel(pipeline)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <Link
              key={v.id}
              href={`/agent/leads?view=${v.id}&layout=${layout}${filterSuffix}`}
              prefetch={false}
              className={cn(
                "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-xs font-semibold transition",
                view === v.id
                  ? "bg-[#6b8fad] text-white"
                  : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]",
              )}
            >
              {v.label}
            </Link>
          ))}
          <Link
            href={`/agent/leads?view=${view}&layout=table${filterSuffix}`}
            prefetch={false}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-xs font-semibold",
              layout === "table"
                ? "bg-[#5a6878] text-white"
                : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0]",
            )}
          >
            <span className="lg:hidden">List</span>
            <span className="hidden lg:inline">Table</span>
          </Link>
          <Link
            href={`/agent/leads?view=${view}&layout=kanban${filterSuffix}`}
            prefetch={false}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-xs font-semibold",
              layout === "kanban"
                ? "bg-[#5a6878] text-white"
                : "bg-white text-[#7b8794] ring-1 ring-[#e2e8f0]",
            )}
          >
            Board
          </Link>
          {pipelineParam || onlineOnly ? (
            <Link
              href={`/agent/leads?view=${view}&layout=${layout}`}
              prefetch={false}
              className="inline-flex min-h-10 items-center rounded-md bg-white px-3 py-2 text-xs font-semibold text-[#2b6cb0] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]"
            >
              Clear filter
            </Link>
          ) : null}
        </div>
      </div>

      {layout === "table" ? (
        <LeadsTableClient
          leads={rows}
          canClaimPond
          canAssign={ctx.isPlatformAdmin}
          teamMembers={assignableAgents}
          view={view}
        />
      ) : (
        <div className="flex flex-col gap-3 overflow-x-hidden pb-2 lg:flex-row lg:overflow-x-auto">
          {COLUMNS.map((status) => {
            const columnLeads = leads.filter((l) => l.status === status);
            return (
              <div
                key={status}
                className="w-full min-w-0 rounded-xl border border-[#d8dee6] bg-white p-3 lg:min-w-[240px] lg:flex-1"
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
                      <div className="flex items-center gap-1">
                        <KanbanLeadLink
                          href={`/agent/leads?view=${view}&layout=kanban&lead=${lead.id}${pipelineParam ? `&pipeline=${pipelineParam}` : ""}`}
                          leadId={lead.id}
                          className="font-semibold text-[#2563eb] hover:underline"
                        >
                          {lead.customer?.name ||
                            lead.customer?.email ||
                            lead.source.replaceAll("_", " ")}
                        </KanbanLeadLink>
                        {lead.customer ? (
                          <LeadAccountVerifyMenu
                            compact
                            leadId={lead.id}
                            emailVerified={Boolean(lead.customer.emailVerified)}
                            accountCreatedAt={lead.customer.createdAt}
                          />
                        ) : null}
                      </div>
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

      <Suspense fallback={null}>
        <LeadQueryPopup fallbackLeadIds={rows.map((r) => r.id)} />
      </Suspense>
    </div>
  );
}

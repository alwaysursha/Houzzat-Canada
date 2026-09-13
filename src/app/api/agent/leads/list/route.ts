import { NextResponse } from "next/server";
import type { LeadStatus } from "@prisma/client";
import { leadScopeWhere, requireAgentContextFromRequest } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { computeHotnessMap, findOnlineUserIds } from "@/lib/agent/hotness";
import { displayedCrmClassification } from "@/lib/agent/lead-classification";
import { PIPELINE_STATUSES } from "@/lib/agent/pipeline";
import { selectPrimaryLeadsByCustomer } from "@/lib/agent/select-primary-leads-by-customer";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const viewParam = url.searchParams.get("view");
  const view =
    viewParam === "pond" || viewParam === "team" || viewParam === "mine"
      ? viewParam
      : ctx.canSeeTeamLeads
        ? "team"
        : "mine";

  const pipelineParam = url.searchParams.get("pipeline")?.trim() || null;
  const onlineOnly =
    url.searchParams.get("online") === "1" || url.searchParams.get("online") === "true";

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

  const rawLeads = selectPrimaryLeadsByCustomer(fetchedLeads);

  const hotMap = await computeHotnessMap(
    rawLeads.map((l) => ({
      id: l.id,
      customerId: l.customerId,
      status: l.status,
      score: l.score,
      createdAt: l.createdAt,
      firstRespondedAt: l.firstRespondedAt,
    })),
  );

  const leads = rawLeads.map((lead) => {
    const hot = hotMap.get(lead.id);
    return {
      id: lead.id,
      status: lead.status,
      source: lead.source,
      intent: lead.intent,
      score: lead.score,
      notes: lead.notes,
      listingMls: lead.listingMls,
      inquiryTag: lead.inquiryTag,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      customer: lead.customer
        ? {
            ...lead.customer,
            ...displayedCrmClassification(lead),
          }
        : null,
      assignedAgent: lead.assignedAgent,
      nextTaskDueAt: lead.tasks[0]?.dueAt.toISOString() ?? null,
      hotness: hot?.hotness ?? lead.score,
      isOnline: hot?.isOnline ?? false,
      binge: hot?.binge ?? false,
      views24h: hot?.views24h ?? 0,
      distinctListings24h: hot?.distinctListings24h ?? 0,
      lastSeenAt: hot?.lastSeenAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ ok: true, leads });
}

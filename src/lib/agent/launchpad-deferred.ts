import { cache } from "react";
import type { LeadStatus } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { leadScopeWhere } from "@/lib/agent";
import { computeHotnessMap, findOnlineUserIds } from "@/lib/agent/hotness";
import { prisma } from "@/lib/prisma";

/** Recent responses only — enough for a Launchpad avg, not a full history scan. */
const RESPONSE_SAMPLE = 150;
const HOT_CANDIDATE_TAKE = 30;
const ONLINE_LEADS_TAKE = 40;
const CONTACT_REQUESTED_TAKE = 24;

export async function loadLaunchpadAvgResponseMins(input: {
  organizationId: string;
  focusAgentId: string | null;
  canSeeTeamLeads: boolean;
  userId: string;
}): Promise<number> {
  const respondedLeads = await prisma.lead.findMany({
    where: {
      organizationId: input.organizationId,
      firstRespondedAt: { not: null },
      ...(input.focusAgentId
        ? { assignedAgentId: input.focusAgentId }
        : input.canSeeTeamLeads
          ? { assignedAgentId: { not: null } }
          : { assignedAgentId: input.userId }),
    },
    select: { createdAt: true, firstRespondedAt: true },
    orderBy: { firstRespondedAt: "desc" },
    take: RESPONSE_SAMPLE,
  });

  const mins = respondedLeads
    .map((l) => {
      if (!l.firstRespondedAt) return null;
      const value =
        (l.firstRespondedAt.getTime() - l.createdAt.getTime()) / 60_000;
      return value >= 0 ? value : null;
    })
    .filter((n): n is number => n != null);

  if (mins.length === 0) return 0;
  return Math.round(mins.reduce((sum, n) => sum + n, 0) / mins.length);
}

export async function loadLaunchpadOnlineLeads(input: {
  ctx: AgentOrgContext;
  deskView: "mine" | "team";
  focusAgentId: string | null;
}) {
  const onlineUserIds = await findOnlineUserIds();
  if (onlineUserIds.length === 0) return [];

  const onlineLeadsRaw = await prisma.lead.findMany({
    where: {
      ...leadScopeWhere(input.ctx, input.deskView),
      customerId: { in: onlineUserIds },
      ...(input.focusAgentId
        ? { assignedAgentId: input.focusAgentId }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: ONLINE_LEADS_TAKE,
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

  return onlineLeadsRaw
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
}

/** Request-cached so Hot card + Quick Modules share one hotness pass (same ctx ref). */
export const loadLaunchpadHotLeads = cache(async function loadLaunchpadHotLeads(
  ctx: AgentOrgContext,
) {
  const recentLeads = await prisma.lead.findMany({
    where: leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine"),
    orderBy: { updatedAt: "desc" },
    take: HOT_CANDIDATE_TAKE,
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

  return { hotCount: hotLeads.length, hotLeads, hotMap };
});

export async function loadLaunchpadContactRequested(input: {
  ctx: AgentOrgContext;
  focusAgentId: string | null;
}) {
  const contactRequestedStatuses = [
    "NEW_LEAD",
    "ATTEMPTED_CONTACT",
    "CONTACTED",
  ] as LeadStatus[];
  const scopeTeam = leadScopeWhere(
    input.ctx,
    input.ctx.canSeeTeamLeads ? "team" : "mine",
  );

  const contactRequested = await prisma.lead.findMany({
    where: {
      ...scopeTeam,
      status: { in: contactRequestedStatuses },
      inquiryTag: null,
      ...(input.focusAgentId
        ? { assignedAgentId: input.focusAgentId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: CONTACT_REQUESTED_TAKE,
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
  });

  const hotMap = await computeHotnessMap(
    contactRequested.map((l) => ({
      id: l.id,
      customerId: l.customerId,
      status: l.status,
      score: l.score,
      createdAt: l.createdAt,
      firstRespondedAt: l.firstRespondedAt,
    })),
  );

  return contactRequested.map((lead) => {
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
  });
}

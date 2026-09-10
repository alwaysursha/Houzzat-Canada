/**
 * V2 shell loader: one lead findUnique after auth, plus assignable agents
 * only when the Assign control is shown (platform admin).
 */
import type { AgentOrgContext } from "@/lib/agent";
import { listAssignableCrmAgents } from "@/lib/agent/assignable-agents";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import type { LeadProfileV2Shell } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const LEAD_PROFILE_V2_SHELL_SELECT = {
  id: true,
  status: true,
  source: true,
  score: true,
  notes: true,
  listingMls: true,
  inquiryTag: true,
  assignedAgentId: true,
  organizationId: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  statusChangedAt: true,
  firstRespondedAt: true,
  contactConsentAt: true,
  lostReason: true,
  winReason: true,
  utmSource: true,
  utmCampaign: true,
  utmContent: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isBuyer: true,
      isSeller: true,
      purchaseTimeframe: true,
      emailVerified: true,
      createdAt: true,
      caslConsentAt: true,
      termsAcceptedAt: true,
      vowAcceptedAt: true,
      homeAddress: true,
      emailUpdateRequestedAt: true,
      phoneUpdateRequestedAt: true,
    },
  },
  assignedAgent: {
    select: { id: true, name: true, email: true },
  },
  adCampaign: { select: { id: true, name: true } },
} as const;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function loadLeadProfileV2Shell(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2Shell | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: LEAD_PROFILE_V2_SHELL_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const canAssignLeads = ctx.isPlatformAdmin;
  const teamMembers = canAssignLeads
    ? await listAssignableCrmAgents(ctx)
    : [];

  const lastTouch = lead.firstRespondedAt || lead.updatedAt;
  const consented = Boolean(
    lead.contactConsentAt || lead.customer?.caslConsentAt,
  );

  return {
    lead: {
      id: lead.id,
      status: lead.status,
      source: lead.source,
      score: lead.score,
      notes: lead.notes,
      listingMls: lead.listingMls,
      inquiryTag: lead.inquiryTag,
      assignedAgentId: lead.assignedAgentId,
      createdAt: lead.createdAt.toISOString(),
      statusChangedAt: (lead.statusChangedAt ?? lead.createdAt).toISOString(),
      firstRespondedAt: iso(lead.firstRespondedAt),
      contactConsentAt: iso(lead.contactConsentAt),
      lostReason: lead.lostReason,
      winReason: lead.winReason,
      utmSource: lead.utmSource,
      utmCampaign: lead.utmCampaign,
      utmContent: lead.utmContent,
      customer: lead.customer
        ? {
            id: lead.customer.id,
            name: lead.customer.name,
            email: lead.customer.email,
            phone: lead.customer.phone,
            isBuyer: lead.customer.isBuyer,
            isSeller: lead.customer.isSeller,
            purchaseTimeframe: lead.customer.purchaseTimeframe,
            emailVerified: iso(lead.customer.emailVerified),
            createdAt: lead.customer.createdAt.toISOString(),
            caslConsentAt: iso(lead.customer.caslConsentAt),
            termsAcceptedAt: iso(lead.customer.termsAcceptedAt),
            vowAcceptedAt: iso(lead.customer.vowAcceptedAt),
            homeAddress: lead.customer.homeAddress,
            emailUpdateRequestedAt: iso(lead.customer.emailUpdateRequestedAt),
            phoneUpdateRequestedAt: iso(lead.customer.phoneUpdateRequestedAt),
          }
        : null,
      assignedAgent: lead.assignedAgent,
      adCampaign: lead.adCampaign,
    },
    permissions: {
      canSeeTeamLeads: ctx.canSeeTeamLeads,
      canAssignLeads,
      canClaim: !lead.assignedAgentId,
      consented,
    },
    teamMembers,
    lastTouchAt: lastTouch.toISOString(),
  };
}

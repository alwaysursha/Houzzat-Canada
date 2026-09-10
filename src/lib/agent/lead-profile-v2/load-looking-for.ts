/**
 * V2 first-paint Looking For loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Matches current snapshot: one primary saved search
 * via findFirst (isPrimary desc, updatedAt desc) then
 * buyerIntentFromSavedSearches. Does not run the 45-day browse assembler,
 * listing hydration, timeline, emails, or rail counts.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { buyerIntentFromSavedSearches } from "@/lib/agent/buyer-intent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import {
  toV2LookingForPanel,
  v2SavedSearchLabel,
} from "@/lib/agent/lead-profile-v2/looking-for-query";
import type { LeadProfileV2LookingForPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_LOOKING_FOR_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
  customer: { select: { name: true } },
} as const;

export const V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT = {
  name: true,
  query: true,
} as const;

export async function loadLeadProfileV2LookingFor(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2LookingForPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_LOOKING_FOR_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return toV2LookingForPanel(
      buyerIntentFromSavedSearches({
        customerName: null,
        savedSearches: [],
      }),
      null,
    );
  }

  const primarySearch = await prisma.savedSearch.findFirst({
    where: { userId: lead.customerId },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
    select: V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT,
  });

  return toV2LookingForPanel(
    buyerIntentFromSavedSearches({
      customerName: lead.customer?.name ?? null,
      savedSearches:
        primarySearch?.name || primarySearch?.query
          ? [
              {
                name: primarySearch.name || "Saved search",
                query: primarySearch.query,
              },
            ]
          : [],
    }),
    primarySearch ? v2SavedSearchLabel(primarySearch) : null,
  );
}

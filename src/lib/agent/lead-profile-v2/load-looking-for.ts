/**
 * V2 Looking For loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Uses the same canonical loadBuyerIntent
 * assembler as mobile lead engagement (saved searches + 45-day browse).
 * Prefers BuyerConfirmedPreference when present (does not create SavedSearch).
 * Does not load timeline, emails, or rail counts.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import {
  V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE,
  toV2BuyerIntentSavedSearchInput,
} from "@/lib/agent/lead-profile-v2/engagement-overview-query";
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

/** Same columns loadBuyerIntent + saved-search label need. */
export const V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT = {
  name: true,
  query: true,
} as const;

const LOOKING_FOR_SEARCH_ORDER_BY = [
  { isHomepageActive: "desc" as const },
  { isPrimary: "desc" as const },
  { updatedAt: "desc" as const },
];

if (V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE !== 10) {
  throw new Error(
    "Looking For saved-search take drifted from mobile/engagement take 10",
  );
}

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
      await loadBuyerIntent({
        customerId: null,
        customerName: null,
      }),
      null,
    );
  }

  const confirmed = await prisma.buyerConfirmedPreference.findUnique({
    where: { userId: lead.customerId },
  });

  if (confirmed) {
    const cities = confirmed.cities ?? [];
    const priceMax = confirmed.maxPrice;
    const priceLabel =
      priceMax != null
        ? priceMax >= 1_000_000 && priceMax % 100_000 === 0
          ? `Up to $${priceMax / 1_000_000}M — Confirmed`
          : `Up to $${priceMax.toLocaleString("en-CA")} — Confirmed`
        : "Confirmed preference";
    const bits = [
      cities[0] ?? null,
      priceLabel,
      confirmed.minBeds != null ? `${confirmed.minBeds}+ beds` : null,
    ].filter(Boolean);
    const panel = await loadBuyerIntent({
      customerId: lead.customerId,
      customerName: lead.customer?.name ?? null,
      savedSearches: [
        {
          name: "Confirmed preference",
          query: {
            city: cities[0],
            cities,
            priceMin: confirmed.minPrice,
            priceMax: confirmed.maxPrice,
            bedsMin: confirmed.minBeds,
            propertyTypes: confirmed.propertyTypes,
            transactionType: confirmed.transactionType,
          },
        },
      ],
    });
    return toV2LookingForPanel(panel, bits.join(" · ") || "Confirmed preference");
  }

  const searches = await prisma.savedSearch.findMany({
    where: { userId: lead.customerId },
    orderBy: LOOKING_FOR_SEARCH_ORDER_BY,
    take: V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE,
    select: V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT,
  });

  const buyerIntent = await loadBuyerIntent({
    customerId: lead.customerId,
    customerName: lead.customer?.name ?? null,
    savedSearches: toV2BuyerIntentSavedSearchInput(searches),
  });

  const labelSearch = searches[0];
  return toV2LookingForPanel(
    buyerIntent,
    labelSearch ? v2SavedSearchLabel(labelSearch) : null,
  );
}

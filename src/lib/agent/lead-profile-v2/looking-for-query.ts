/** Client/server-safe Looking For helpers. No Prisma. */

import type {
  LeadProfileV2BuyerIntent,
  LeadProfileV2LookingForPanel,
} from "@/lib/agent/lead-profile-v2/types";

export const V2_LOOKING_FOR_RESOURCE_KEY = "looking-for";

export type V2LookingForStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2LookingForResponse(input: {
  stamp: V2LookingForStamp;
  current: V2LookingForStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

/**
 * Rail precedence: engagement buyerIntent (same loadBuyerIntent assembler)
 * wins when already loaded; otherwise first-paint Looking For, which now
 * also uses loadBuyerIntent (saved searches + 45-day browse).
 */
export function selectV2LookingFor(input: {
  engagementBuyerIntent: LeadProfileV2BuyerIntent | null;
  firstPaint: LeadProfileV2BuyerIntent | null;
}): LeadProfileV2BuyerIntent | null {
  return input.engagementBuyerIntent ?? input.firstPaint;
}

/**
 * Exact current lead-summary searchLabel. Criteria bits (city, bedsMin,
 * priceMax) win over the saved-search name. isHomepageActive is not used.
 */
export function v2SavedSearchLabel(search: {
  name: string;
  query: unknown;
}): string {
  const q = search.query as Record<string, unknown> | null;
  const bits = [
    typeof q?.city === "string" ? q.city : null,
    typeof q?.bedsMin === "number" ? `${q.bedsMin}+ beds` : null,
    typeof q?.priceMax === "number"
      ? `to $${Number(q.priceMax).toLocaleString()}`
      : null,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(", ") : search.name || "Saved search";
}

/** Same findFirst order as loadLeadSummary: isPrimary desc, updatedAt desc. */
export function selectV2PrimarySavedSearchRow<
  T extends { isPrimary: boolean; updatedAt: string },
>(rows: T[]): T | null {
  return (
    [...rows].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })[0] ?? null
  );
}

export function toV2LookingForPanel(
  lookingFor: LeadProfileV2BuyerIntent,
  savedSearchLabel: string | null,
): LeadProfileV2LookingForPanel {
  return { ...lookingFor, savedSearchLabel };
}

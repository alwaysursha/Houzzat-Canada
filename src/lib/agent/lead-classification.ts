/**
 * Workspace-scoped HouzzatPRO CRM classification.
 * Client-safe: do not import lead-intake / prisma runtime from here.
 *
 * User.isBuyer / User.isSeller stay Houzzat consumer/account flags.
 * CRM reads/writes these Lead fields only. No LeadIntent.BOTH.
 */
import type { LeadIntent } from "@prisma/client";
import { resolveLeadIntent } from "@/lib/agent/lead-intent";

export type CrmLeadClassification = {
  isBuyer: boolean;
  isSeller: boolean;
  intent: LeadIntent;
};

export type LeadClassificationFields = {
  isBuyer?: boolean | null;
  isSeller?: boolean | null;
  intent?: LeadIntent | string | null;
};

function leadFlagsAreUnset(
  isBuyer: boolean | null | undefined,
  isSeller: boolean | null | undefined,
): boolean {
  return isBuyer == null && isSeller == null;
}

/**
 * CRM display classification.
 * Both Lead flags NULL → fallback from Lead.intent (BUYER/SELLER).
 * Never falls back to User.isBuyer / User.isSeller.
 */
export function resolveDisplayedLeadClassification(
  lead: LeadClassificationFields,
): CrmLeadClassification {
  if (leadFlagsAreUnset(lead.isBuyer, lead.isSeller)) {
    if (lead.intent === "SELLER") {
      return { isBuyer: false, isSeller: true, intent: "SELLER" };
    }
    return { isBuyer: true, isSeller: false, intent: "BUYER" };
  }

  return finalizeWritableLeadClassification({
    isBuyer: lead.isBuyer === true,
    isSeller: lead.isSeller === true,
  });
}

/** CRM DTO chips/toggles: booleans only. */
export function displayedCrmClassification(
  lead: LeadClassificationFields,
): { isBuyer: boolean; isSeller: boolean } {
  const displayed = resolveDisplayedLeadClassification(lead);
  return { isBuyer: displayed.isBuyer, isSeller: displayed.isSeller };
}

/**
 * CRM write classification.
 * Buyer only → BUYER. Seller only → SELLER. Buyer+Seller → both true, intent SELLER.
 * Both false is invalid for CRM UX; force Buyer.
 */
export function finalizeWritableLeadClassification(input: {
  isBuyer: boolean;
  isSeller: boolean;
}): CrmLeadClassification {
  let isBuyer = input.isBuyer;
  const isSeller = input.isSeller;
  if (!isBuyer && !isSeller) {
    isBuyer = true;
  }
  return {
    isBuyer,
    isSeller,
    intent: resolveLeadIntent({ isBuyer, isSeller }),
  };
}

export function nextWritableLeadClassification(input: {
  current: LeadClassificationFields;
  patch: { isBuyer?: boolean; isSeller?: boolean };
}): CrmLeadClassification {
  const displayed = resolveDisplayedLeadClassification(input.current);
  return finalizeWritableLeadClassification({
    isBuyer: input.patch.isBuyer ?? displayed.isBuyer,
    isSeller: input.patch.isSeller ?? displayed.isSeller,
  });
}

/**
 * Intake merge: incoming true flags OR onto the existing Lead.
 * Never clears a flag. Buyer → Seller becomes both true (intent SELLER).
 */
export function mergeIncomingLeadClassification(
  current: LeadClassificationFields,
  incoming: { isBuyer?: boolean | null; isSeller?: boolean | null },
): CrmLeadClassification {
  const displayed = resolveDisplayedLeadClassification(current);
  return finalizeWritableLeadClassification({
    isBuyer: displayed.isBuyer || incoming.isBuyer === true,
    isSeller: displayed.isSeller || incoming.isSeller === true,
  });
}

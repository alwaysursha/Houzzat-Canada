/**
 * Stage 6.8B — checkout eligibility for an accepted private offer.
 * Pure evaluation helpers + DB-backed checks. No Stripe calls.
 */

import type { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { commercialTermsHashFromOfferRow } from "@/lib/platform/offers/commercial-terms-hash";
import { computeAcceptedCheckoutAmounts } from "@/lib/platform/billing/checkout-amounts";

const PAID_STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING"];

export type CheckoutEligibilityReason =
  | "eligible"
  | "unavailable"
  | "not_accepted"
  | "acceptance_missing"
  | "hash_mismatch"
  | "already_paid"
  | "invalid_amounts";

export type CheckoutEligibility = {
  eligible: boolean;
  reason: CheckoutEligibilityReason;
  subscriptionStatus: SubscriptionStatus | null;
  recurringTotalCents: number | null;
  oneTimeTotalCents: number | null;
};

export function isPaidSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
): boolean {
  return status != null && PAID_STATUSES.includes(status);
}

/**
 * Evaluate whether Checkout may be created for a loaded ACCEPTED offer row.
 */
export function evaluateAcceptedOfferCheckoutEligibility(input: {
  offerStatus: string;
  acceptance: {
    commercialTermsHash: string;
  } | null;
  offerForHash: Parameters<typeof commercialTermsHashFromOfferRow>[0];
  lineItems: Array<{
    kind: string;
    amountCents: number;
    quantity: number;
    isRecurring: boolean;
  }>;
  existingSubscriptionStatus: SubscriptionStatus | null;
}): CheckoutEligibility {
  if (input.offerStatus !== "ACCEPTED") {
    return {
      eligible: false,
      reason: input.offerStatus === "CANCELLED" ? "unavailable" : "not_accepted",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }

  if (!input.acceptance) {
    return {
      eligible: false,
      reason: "acceptance_missing",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }

  const currentHash = commercialTermsHashFromOfferRow(input.offerForHash);
  if (currentHash !== input.acceptance.commercialTermsHash) {
    return {
      eligible: false,
      reason: "hash_mismatch",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }

  if (isPaidSubscriptionStatus(input.existingSubscriptionStatus)) {
    return {
      eligible: false,
      reason: "already_paid",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }

  try {
    const amounts = computeAcceptedCheckoutAmounts(input.lineItems);
    return {
      eligible: true,
      reason: "eligible",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: amounts.recurringTotalCents,
      oneTimeTotalCents: amounts.oneTimeTotalCents,
    };
  } catch {
    return {
      eligible: false,
      reason: "invalid_amounts",
      subscriptionStatus: input.existingSubscriptionStatus,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }
}

export async function loadCheckoutEligibilityForOfferId(input: {
  offerId: string;
  prisma: PrismaClient;
}): Promise<CheckoutEligibility> {
  const offer = await input.prisma.commercialOffer.findUnique({
    where: { id: input.offerId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      acceptance: {
        select: { commercialTermsHash: true },
      },
      subscription: {
        select: { status: true },
      },
    },
  });

  if (!offer) {
    return {
      eligible: false,
      reason: "unavailable",
      subscriptionStatus: null,
      recurringTotalCents: null,
      oneTimeTotalCents: null,
    };
  }

  return evaluateAcceptedOfferCheckoutEligibility({
    offerStatus: offer.status,
    acceptance: offer.acceptance,
    offerForHash: {
      id: offer.id,
      version: offer.version,
      planCode: offer.planCode,
      billingCadence: offer.billingCadence,
      currency: offer.currency,
      negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
      setupFeeCents: offer.setupFeeCents,
      includedSeats: offer.includedSeats,
      additionalSeats: offer.additionalSeats,
      trialDays: offer.trialDays,
      proposedStartDate: offer.proposedStartDate,
      expiresAt: offer.expiresAt,
      lineItems: offer.lineItems,
    },
    lineItems: offer.lineItems,
    existingSubscriptionStatus: offer.subscription?.status ?? null,
  });
}

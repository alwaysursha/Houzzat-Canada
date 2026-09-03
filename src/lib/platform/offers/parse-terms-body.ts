/**
 * Shared body → OfferTermsInput parsing for offer write routes.
 */

import type { OfferTermsInput } from "@/lib/platform/offers";

export function parseCommercialOfferTermsBody(
  body: Record<string, unknown>,
): OfferTermsInput {
  return {
    planCode: body.planCode as OfferTermsInput["planCode"],
    billingCadence: body.billingCadence as OfferTermsInput["billingCadence"],
    negotiatedRecurringAmountCents:
      typeof body.negotiatedRecurringAmountCents === "number"
        ? body.negotiatedRecurringAmountCents
        : body.negotiatedRecurringAmountCents == null
          ? null
          : Number(body.negotiatedRecurringAmountCents),
    setupFeeCents:
      typeof body.setupFeeCents === "number"
        ? body.setupFeeCents
        : body.setupFeeCents == null
          ? null
          : Number(body.setupFeeCents),
    additionalSeats:
      typeof body.additionalSeats === "number"
        ? body.additionalSeats
        : body.additionalSeats == null
          ? 0
          : Number(body.additionalSeats),
    trialDays:
      typeof body.trialDays === "number"
        ? body.trialDays
        : body.trialDays == null || body.trialDays === ""
          ? null
          : Number(body.trialDays),
    proposedStartDate:
      typeof body.proposedStartDate === "string"
        ? body.proposedStartDate
        : null,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
    addOns: Array.isArray(body.addOns)
      ? (body.addOns as OfferTermsInput["addOns"])
      : null,
    adjustments: Array.isArray(body.adjustments)
      ? (body.adjustments as OfferTermsInput["adjustments"])
      : null,
  };
}

/**
 * Stage 6.8B — deterministic Checkout amounts from accepted commercial line items.
 *
 * Authority rule (Stage 6.7A):
 * - negotiatedRecurringAmountCents is PLAN_BASE only (not the full recurring total).
 * - Seats, add-ons, discounts, and one-time fees live in CommercialOfferLineItem rows.
 * - Charge amounts = computeOfferTotals(lineItems) — never double-count negotiated + seats.
 *
 * Stripe line items use these net totals (1 recurring + optional 1 one-time) so
 * discounts reconcile without negative Stripe price lines.
 */

import type { OfferLineKind } from "@prisma/client";
import { computeOfferTotals } from "@/lib/platform/offers/line-items";

export type CheckoutAmountLine = {
  kind: OfferLineKind | string;
  amountCents: number;
  quantity: number;
  isRecurring: boolean;
};

export type AcceptedCheckoutAmounts = {
  recurringTotalCents: number;
  oneTimeTotalCents: number;
};

export class CheckoutAmountError extends Error {
  readonly code: "INVALID_RECURRING_TOTAL" | "INVALID_ONE_TIME_TOTAL";

  constructor(
    message: string,
    code: "INVALID_RECURRING_TOTAL" | "INVALID_ONE_TIME_TOTAL",
  ) {
    super(message);
    this.name = "CheckoutAmountError";
    this.code = code;
  }
}

/**
 * Server-authoritative Checkout totals from accepted offer line items.
 * Must equal the same totals shown on the private offer presentation.
 */
export function computeAcceptedCheckoutAmounts(
  lineItems: CheckoutAmountLine[],
): AcceptedCheckoutAmounts {
  const totals = computeOfferTotals(
    lineItems.map((item) => ({
      kind: item.kind as OfferLineKind,
      amountCents: item.amountCents,
      quantity: item.quantity,
      isRecurring: item.isRecurring,
    })),
  );

  if (
    !Number.isFinite(totals.recurringTotalCents) ||
    !Number.isInteger(totals.recurringTotalCents) ||
    totals.recurringTotalCents <= 0
  ) {
    throw new CheckoutAmountError(
      "Accepted offer recurring total must be a positive integer (cents).",
      "INVALID_RECURRING_TOTAL",
    );
  }

  if (
    !Number.isFinite(totals.oneTimeTotalCents) ||
    !Number.isInteger(totals.oneTimeTotalCents) ||
    totals.oneTimeTotalCents < 0
  ) {
    throw new CheckoutAmountError(
      "Accepted offer one-time total must be a non-negative integer (cents).",
      "INVALID_ONE_TIME_TOTAL",
    );
  }

  return {
    recurringTotalCents: totals.recurringTotalCents,
    oneTimeTotalCents: totals.oneTimeTotalCents,
  };
}

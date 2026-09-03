/**
 * Stage 6.7A — build commercial line items + totals from catalog + negotiated terms.
 * Line items are commercial terms only — not entitlement authority.
 */

import type {
  BillingCadence,
  OfferLineKind,
  PlanCode,
  Prisma,
} from "@prisma/client";
import {
  getPlanDefinition,
  planAllowsAdditionalSeats,
  STANDARD_SETUP_FEE_CENTS,
} from "@/lib/platform/catalog/plans";
import {
  additionalAgentUnitLabel,
  getAdditionalAgentUnitCents,
} from "@/lib/platform/catalog/add-ons";
import {
  ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  OFFER_LINE_CODES,
} from "@/lib/platform/offers/constants";
import { CommercialOfferActionError } from "@/lib/platform/offers/errors";

export type OfferAddOnInput = {
  code: "CUSTOM_CONSUMER_APP" | "GOOGLE_PPC" | "META_ADS";
  /** Required for PPC/Meta — operator-entered commercial amount (not invented). */
  amountCents?: number | null;
  description?: string | null;
  /** Optional note that terms still need operator confirmation. */
  requiresOperatorTerms?: boolean;
};

export type OfferAdjustmentInput = {
  kind: "DISCOUNT" | "CUSTOM";
  code: string;
  description: string;
  amountCents: number;
  isRecurring: boolean;
  quantity?: number;
};

export type ResolvedOfferCommercialTerms = {
  planCode: PlanCode;
  billingCadence: BillingCadence;
  currency: "CAD";
  standardRecurringAmountCents: number;
  negotiatedRecurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  proposedStartDate: Date | null;
  expiresAt: Date | null;
  lineItems: Prisma.CommercialOfferLineItemCreateWithoutOfferInput[];
  recurringTotalCents: number;
  oneTimeTotalCents: number;
};

function standardRecurringCents(
  planCode: PlanCode,
  cadence: BillingCadence,
): number {
  const plan = getPlanDefinition(planCode);
  return cadence === "ANNUAL" ? plan.annualPriceCents : plan.monthlyPriceCents;
}

function assertFiniteNonNegativeCents(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new CommercialOfferActionError(
      `${label} must be a non-negative integer (cents).`,
      "INVALID_AMOUNT",
    );
  }
  return value;
}

export function computeOfferTotals(
  lineItems: Array<{
    kind: OfferLineKind;
    amountCents: number;
    quantity: number;
    isRecurring: boolean;
  }>,
): { recurringTotalCents: number; oneTimeTotalCents: number } {
  let recurring = 0;
  let oneTime = 0;
  for (const item of lineItems) {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const line = item.amountCents * qty;
    if (item.kind === "DISCOUNT") {
      if (item.isRecurring) recurring -= Math.abs(line);
      else oneTime -= Math.abs(line);
      continue;
    }
    if (item.isRecurring) recurring += line;
    else oneTime += line;
  }
  return {
    recurringTotalCents: recurring,
    oneTimeTotalCents: oneTime,
  };
}

/**
 * Materialize line items from negotiated commercial terms.
 * Additional seats: TEAM/BROKERAGE only — $89/mo or $899/yr by cadence.
 * PPC/Meta: operator-entered commercial fee only (ad spend never auto-included).
 */
export function resolveOfferCommercialTerms(input: {
  planCode: PlanCode;
  billingCadence: BillingCadence;
  negotiatedRecurringAmountCents?: number | null;
  setupFeeCents?: number | null;
  additionalSeats?: number | null;
  trialDays?: number | null;
  proposedStartDate?: Date | null;
  expiresAt?: Date | null;
  addOns?: OfferAddOnInput[] | null;
  adjustments?: OfferAdjustmentInput[] | null;
}): ResolvedOfferCommercialTerms {
  const plan = getPlanDefinition(input.planCode);
  const standardRecurringAmountCents = standardRecurringCents(
    input.planCode,
    input.billingCadence,
  );

  const negotiatedRecurringAmountCents =
    input.negotiatedRecurringAmountCents == null
      ? standardRecurringAmountCents
      : assertFiniteNonNegativeCents(
          input.negotiatedRecurringAmountCents,
          "Negotiated recurring amount",
        );

  const setupFeeCents =
    input.setupFeeCents == null
      ? STANDARD_SETUP_FEE_CENTS
      : assertFiniteNonNegativeCents(input.setupFeeCents, "Setup fee");

  const additionalSeatsRaw = input.additionalSeats ?? 0;
  if (
    !Number.isFinite(additionalSeatsRaw) ||
    !Number.isInteger(additionalSeatsRaw) ||
    additionalSeatsRaw < 0
  ) {
    throw new CommercialOfferActionError(
      "Additional seats must be a non-negative integer.",
      "INVALID_ADDITIONAL_SEATS",
    );
  }
  const additionalSeats = additionalSeatsRaw;

  if (additionalSeats > 0 && !planAllowsAdditionalSeats(input.planCode)) {
    throw new CommercialOfferActionError(
      "SOLO plans cannot include additional agent seats.",
      "SOLO_ADDITIONAL_SEATS_FORBIDDEN",
    );
  }

  let trialDays: number | null = null;
  if (input.trialDays != null) {
    if (
      !Number.isFinite(input.trialDays) ||
      !Number.isInteger(input.trialDays) ||
      input.trialDays < 0 ||
      input.trialDays > 365
    ) {
      throw new CommercialOfferActionError(
        "Trial days must be an integer from 0 to 365.",
        "INVALID_TRIAL_DAYS",
      );
    }
    trialDays = input.trialDays === 0 ? null : input.trialDays;
  }

  const lineItems: Prisma.CommercialOfferLineItemCreateWithoutOfferInput[] = [];
  let sortOrder = 0;

  lineItems.push({
    kind: "PLAN_BASE",
    code: OFFER_LINE_CODES.PLAN_BASE,
    description: `${input.planCode} plan · ${input.billingCadence.toLowerCase()}`,
    amountCents: negotiatedRecurringAmountCents,
    isRecurring: true,
    quantity: 1,
    sortOrder: sortOrder++,
  });

  if (setupFeeCents > 0) {
    lineItems.push({
      kind: "SETUP_FEE",
      code: OFFER_LINE_CODES.SETUP_FEE,
      description: "One-time setup fee",
      amountCents: setupFeeCents,
      isRecurring: false,
      quantity: 1,
      sortOrder: sortOrder++,
    });
  }

  if (additionalSeats > 0) {
    const unitCents = getAdditionalAgentUnitCents(input.billingCadence);
    const unitLabel = additionalAgentUnitLabel(input.billingCadence);
    lineItems.push({
      kind: "ADDITIONAL_SEAT",
      code: OFFER_LINE_CODES.ADDITIONAL_SEAT,
      description: `Additional agent seats (${additionalSeats} × ${unitLabel})`,
      amountCents: unitCents,
      isRecurring: true,
      quantity: additionalSeats,
      sortOrder: sortOrder++,
      metadata: {
        billingCadence: input.billingCadence,
        unitCents,
      },
    });
  }

  const addOns = input.addOns ?? [];
  const seen = new Set<string>();
  for (const addOn of addOns) {
    if (seen.has(addOn.code)) {
      throw new CommercialOfferActionError(
        `Duplicate add-on ${addOn.code}.`,
        "DUPLICATE_ADDON",
      );
    }
    seen.add(addOn.code);

    if (addOn.code === "CUSTOM_CONSUMER_APP") {
      if (!plan.consumerBrandedApp.available || plan.consumerBrandedApp.oneTimeCents == null) {
        throw new CommercialOfferActionError(
          "Custom Consumer App is not available on SOLO.",
          "CUSTOM_APP_PLAN_FORBIDDEN",
        );
      }
      const amount =
        addOn.amountCents == null
          ? plan.consumerBrandedApp.oneTimeCents
          : assertFiniteNonNegativeCents(
              addOn.amountCents,
              "Custom Consumer App amount",
            );
      lineItems.push({
        kind: "ADDON",
        code: OFFER_LINE_CODES.CUSTOM_CONSUMER_APP,
        description:
          addOn.description?.trim() ||
          "Custom Consumer App (one-time)",
        amountCents: amount,
        isRecurring: false,
        quantity: 1,
        sortOrder: sortOrder++,
      });
      continue;
    }

    if (addOn.code === "GOOGLE_PPC" || addOn.code === "META_ADS") {
      if (addOn.amountCents == null) {
        throw new CommercialOfferActionError(
          `${addOn.code} requires an explicit operator-entered commercial amount (HouzzatPRO service/management fee). Ad spend is separate and is not auto-included.`,
          "ADS_FEE_REQUIRES_OPERATOR_AMOUNT",
        );
      }
      const amount = assertFiniteNonNegativeCents(
        addOn.amountCents,
        `${addOn.code} amount`,
      );
      const label = addOn.code === "GOOGLE_PPC" ? "Google PPC" : "Meta Ads";
      lineItems.push({
        kind: "ADDON",
        code: addOn.code,
        description:
          addOn.description?.trim() ||
          `${label} service/management fee (operator-entered; ad spend separate — min client budget $${ADS_MINIMUM_MONTHLY_BUDGET_CENTS / 100}/mo, not included in HouzzatPRO totals)`,
        amountCents: amount,
        isRecurring: false,
        quantity: 1,
        sortOrder: sortOrder++,
        metadata: {
          requiresOperatorTerms: addOn.requiresOperatorTerms !== false,
          feeKind: "operator_entered_service_fee",
          adSpendSeparate: true,
          adSpendNotIncludedInTotals: true,
          minimumAdBudgetCents: ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
          managementFeeUndecided: true,
        },
      });
      continue;
    }

    const _exhaustive: never = addOn.code;
    void _exhaustive;
    throw new CommercialOfferActionError(
      "Unsupported add-on.",
      "UNSUPPORTED_ADDON",
    );
  }

  for (const adj of input.adjustments ?? []) {
    const code = adj.code.trim();
    const description = adj.description.trim();
    if (!code || !description) {
      throw new CommercialOfferActionError(
        "Adjustments require code and description.",
        "INVALID_ADJUSTMENT",
      );
    }
    const amount = assertFiniteNonNegativeCents(
      adj.amountCents,
      "Adjustment amount",
    );
    const quantity =
      adj.quantity == null
        ? 1
        : (() => {
            if (
              !Number.isFinite(adj.quantity) ||
              !Number.isInteger(adj.quantity) ||
              adj.quantity < 1
            ) {
              throw new CommercialOfferActionError(
                "Adjustment quantity must be a positive integer.",
                "INVALID_ADJUSTMENT",
              );
            }
            return adj.quantity;
          })();
    lineItems.push({
      kind: adj.kind,
      code,
      description,
      amountCents: amount,
      isRecurring: Boolean(adj.isRecurring),
      quantity,
      sortOrder: sortOrder++,
    });
  }

  const totals = computeOfferTotals(
    lineItems.map((item) => ({
      kind: item.kind as OfferLineKind,
      amountCents: item.amountCents as number,
      quantity: (item.quantity as number) ?? 1,
      isRecurring: Boolean(item.isRecurring),
    })),
  );

  return {
    planCode: input.planCode,
    billingCadence: input.billingCadence,
    currency: "CAD",
    standardRecurringAmountCents,
    negotiatedRecurringAmountCents,
    setupFeeCents,
    includedSeats: plan.includedSeats,
    additionalSeats,
    trialDays,
    proposedStartDate: input.proposedStartDate ?? null,
    expiresAt: input.expiresAt ?? null,
    lineItems,
    recurringTotalCents: totals.recurringTotalCents,
    oneTimeTotalCents: totals.oneTimeTotalCents,
  };
}

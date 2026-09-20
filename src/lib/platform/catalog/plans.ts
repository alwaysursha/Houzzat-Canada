/**
 * Stage 6.2A — commercial plan catalog (approved constants).
 * Stripe price IDs are intentionally absent until Stripe is configured.
 */

import type { PlanCode } from "@prisma/client";
import {
  FEATURE_AGENT_APP,
  FEATURE_CUSTOM_CONSUMER_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
  type PlatformFeatureCode,
} from "./features";

export type BillingCadenceCode = "MONTHLY" | "ANNUAL";

export type PlanDefinition = {
  planCode: PlanCode;
  includedSeats: number;
  /** Solo forever forbids purchasing additional seats. */
  additionalSeatsAllowed: boolean;
  /**
   * Included outbound SMS segments per billing month. Not Stripe credits.
   * V1 default is 500 on every paid plan; later plans may differ.
   */
  includedSmsSegmentsPerMonth: number;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: "CAD";
  features: Record<PlatformFeatureCode, boolean>;
  /** Consumer branded app add-on availability (fulfillment / commercial, not Stripe yet). */
  consumerBrandedApp: {
    available: boolean;
    /** Planned internal one-time cents when available; null when unavailable. */
    oneTimeCents: number | null;
  };
};

export const STANDARD_SETUP_FEE_CENTS = 49_900;

/** @deprecated Prefer catalog/add-ons — re-exported for Stage 6.2A lock compatibility. */
export {
  ADDITIONAL_AGENT_ANNUAL_CENTS,
  ADDITIONAL_AGENT_MONTHLY_CENTS,
  getAdditionalAgentUnitCents,
} from "./add-ons";

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  SOLO: {
    planCode: "SOLO",
    includedSeats: 1,
    additionalSeatsAllowed: false,
    includedSmsSegmentsPerMonth: 500,
    monthlyPriceCents: 39_900,
    annualPriceCents: 399_000,
    currency: "CAD",
    features: {
      [FEATURE_LIVE_CHAT]: false,
      [FEATURE_SEO_FOUNDATION]: true,
      [FEATURE_AGENT_APP]: true,
      [FEATURE_TEAM_MANAGEMENT]: false,
      [FEATURE_CUSTOM_CONSUMER_APP]: false,
    },
    consumerBrandedApp: {
      available: false,
      oneTimeCents: null,
    },
  },
  TEAM: {
    planCode: "TEAM",
    includedSeats: 4,
    additionalSeatsAllowed: true,
    includedSmsSegmentsPerMonth: 500,
    monthlyPriceCents: 59_900,
    annualPriceCents: 599_000,
    currency: "CAD",
    features: {
      [FEATURE_LIVE_CHAT]: true,
      [FEATURE_SEO_FOUNDATION]: true,
      [FEATURE_AGENT_APP]: true,
      [FEATURE_TEAM_MANAGEMENT]: true,
      [FEATURE_CUSTOM_CONSUMER_APP]: false,
    },
    consumerBrandedApp: {
      available: true,
      oneTimeCents: 250_000,
    },
  },
  BROKERAGE: {
    planCode: "BROKERAGE",
    includedSeats: 20,
    additionalSeatsAllowed: true,
    includedSmsSegmentsPerMonth: 500,
    monthlyPriceCents: 149_900,
    annualPriceCents: 1_499_000,
    currency: "CAD",
    features: {
      [FEATURE_LIVE_CHAT]: true,
      [FEATURE_SEO_FOUNDATION]: true,
      [FEATURE_AGENT_APP]: true,
      [FEATURE_TEAM_MANAGEMENT]: true,
      [FEATURE_CUSTOM_CONSUMER_APP]: false,
    },
    consumerBrandedApp: {
      available: true,
      oneTimeCents: 199_900,
    },
  },
};

export function getPlanDefinition(planCode: PlanCode): PlanDefinition {
  return PLAN_DEFINITIONS[planCode];
}

export function planAllowsAdditionalSeats(planCode: PlanCode): boolean {
  return PLAN_DEFINITIONS[planCode].additionalSeatsAllowed;
}

export function computeSeatLimit(
  includedSeats: number,
  additionalSeats: number,
): number {
  return includedSeats + additionalSeats;
}

export function planFeatureEnabled(
  planCode: PlanCode,
  featureCode: PlatformFeatureCode,
): boolean {
  return PLAN_DEFINITIONS[planCode].features[featureCode];
}

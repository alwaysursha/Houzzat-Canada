/**
 * Stage 6.2B — entitlement profile recipes (code catalog).
 *
 * Plan profiles (SOLO / TEAM / BROKERAGE) are fully defined from approved
 * commercial constants.
 *
 * HOUZZAT_LEGACY is owner-locked for controlled activation.
 */

import type { PlanCode } from "@prisma/client";
import {
  FEATURE_AGENT_APP,
  FEATURE_CUSTOM_CONSUMER_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
} from "@/lib/platform/catalog/features";
import {
  getPlanDefinition,
  type PlanDefinition,
} from "@/lib/platform/catalog/plans";
import type { PlatformFeatureCode } from "@/lib/platform/catalog/features";

export const HOUZZAT_LEGACY_ENTITLEMENT_PROFILE = "HOUZZAT_LEGACY" as const;

export type EntitlementProfileCode =
  | typeof HOUZZAT_LEGACY_ENTITLEMENT_PROFILE
  | PlanCode
  | (string & {});

export type MaterializedEntitlementProfile = {
  code: string;
  includedSeats: number;
  additionalSeats: number;
  /** When false, callers must refuse additional seat expansion. */
  additionalSeatsAllowed: boolean;
  seatLimit: number;
  features: ReadonlyArray<{ featureCode: PlatformFeatureCode; enabled: boolean }>;
};

/** Owner-locked Houzzat legacy seat policy (Stage 6.2B). */
export const HOUZZAT_LEGACY_INCLUDED_SEATS = 10 as const;
export const HOUZZAT_LEGACY_ADDITIONAL_SEATS = 0 as const;
export const HOUZZAT_LEGACY_ADDITIONAL_SEATS_ALLOWED = true as const;
export const HOUZZAT_LEGACY_SEAT_LIMIT = 10 as const;

export const HOUZZAT_LEGACY_PROFILE_READY = true;

export class EntitlementProfileIncompleteError extends Error {
  readonly code = "ENTITLEMENT_PROFILE_INCOMPLETE";
  readonly profileCode: string;
  readonly decisionsRequired: readonly string[];

  constructor(profileCode: string, decisionsRequired: readonly string[]) {
    super(
      `Entitlement profile ${profileCode} is incomplete; owner decisions required: ${decisionsRequired.join(", ")}`,
    );
    this.name = "EntitlementProfileIncompleteError";
    this.profileCode = profileCode;
    this.decisionsRequired = decisionsRequired;
  }
}

function profileFromPlan(def: PlanDefinition): MaterializedEntitlementProfile {
  return {
    code: def.planCode,
    includedSeats: def.includedSeats,
    additionalSeats: 0,
    additionalSeatsAllowed: def.additionalSeatsAllowed,
    seatLimit: def.includedSeats,
    features: (
      Object.entries(def.features) as Array<[PlatformFeatureCode, boolean]>
    ).map(([featureCode, enabled]) => ({ featureCode, enabled })),
  };
}

export function resolvePlanEntitlementProfile(
  planCode: PlanCode,
): MaterializedEntitlementProfile {
  return profileFromPlan(getPlanDefinition(planCode));
}

/**
 * Owner-locked Houzzat legacy entitlement profile (Stage 6.2B).
 */
export function resolveHouzzatLegacyEntitlementProfile(): MaterializedEntitlementProfile {
  if (!HOUZZAT_LEGACY_PROFILE_READY) {
    throw new EntitlementProfileIncompleteError(HOUZZAT_LEGACY_ENTITLEMENT_PROFILE, [
      "HOUZZAT_LEGACY_PROFILE_READY",
    ]);
  }

  return {
    code: HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
    includedSeats: HOUZZAT_LEGACY_INCLUDED_SEATS,
    additionalSeats: HOUZZAT_LEGACY_ADDITIONAL_SEATS,
    additionalSeatsAllowed: HOUZZAT_LEGACY_ADDITIONAL_SEATS_ALLOWED,
    seatLimit: HOUZZAT_LEGACY_SEAT_LIMIT,
    features: [
      { featureCode: FEATURE_LIVE_CHAT, enabled: true },
      { featureCode: FEATURE_SEO_FOUNDATION, enabled: true },
      { featureCode: FEATURE_AGENT_APP, enabled: true },
      { featureCode: FEATURE_TEAM_MANAGEMENT, enabled: true },
      { featureCode: FEATURE_CUSTOM_CONSUMER_APP, enabled: true },
    ],
  };
}

export function isHouzzatLegacyProfileReady(): boolean {
  return HOUZZAT_LEGACY_PROFILE_READY;
}

/** @deprecated Stage 6.2B — profile is locked; empty when ready. */
export function getHouzzatLegacyOwnerDecisionsRequired(): readonly string[] {
  return HOUZZAT_LEGACY_PROFILE_READY ? [] : ["HOUZZAT_LEGACY_PROFILE_READY"];
}

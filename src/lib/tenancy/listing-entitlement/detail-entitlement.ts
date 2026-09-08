/**
 * Stage 6.11G.10C0 — MLS listing **detail** entitlement decision layer.
 *
 * Pure helpers only. No I/O, no route wiring, no PropTx, no Neon.
 *
 * FUTURE INVARIANT (G.10C1+):
 *   Entitlement denial MUST occur BEFORE any PropTx on-demand
 *   lookup/hydration (`lookupAndUpsertOnDemand`). G.10C0 does not
 *   modify loaders yet — callers must preserve this order when wiring.
 *
 * FSBO / manual / preview are NEVER authorized here — explicit channels.
 */

import type { ListingStatus } from "@prisma/client";
import {
  isListingEntitlementEnforcementEnabled,
  resolveListingEntitlementEnforcementEnabled,
} from "@/lib/tenancy/listing-entitlement/search-authority-filters";
import {
  normalizeRecognizedListingProviderKey,
  type RecognizedListingDataProviderKey,
} from "@/lib/tenancy/listing-entitlement/provider-key";
import type {
  ListingDataCapability,
  WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement/types";

/** Marker: G.10C0 foundation module is present (regression lock). */
export const G10C0_DETAIL_ENTITLEMENT_FOUNDATION = true as const;

/**
 * Documented invariant for later loader wiring (G.10C1+).
 * Selftests assert this constant stays true.
 */
export const G10C_PROPTX_ON_DEMAND_REQUIRES_PRIOR_ENTITLEMENT_ALLOW =
  true as const;

export type MlsListingDetailInventoryChannel =
  | "mls"
  | "fsbo"
  | "manual"
  | "preview"
  | "other";

export type MlsListingDetailEntitlementDenialReason =
  | "non_mls_channel_fsbo"
  | "non_mls_channel_manual"
  | "non_mls_channel_preview"
  | "non_mls_channel"
  | "missing_entitlement"
  | "empty_authorities"
  | "missing_organization_id"
  | "missing_provider_key"
  | "unrecognized_provider_key"
  | "authority_pair_mismatch"
  | "missing_capability"
  | "unsupported_status";

export type MlsListingDetailEntitlementDecision =
  | {
      allowed: true;
      organizationId: string;
      providerKey: RecognizedListingDataProviderKey;
      capability: ListingDataCapability;
    }
  | {
      allowed: false;
      reason: MlsListingDetailEntitlementDenialReason;
    };

export type DecideMlsListingDetailEntitlementInput = {
  entitlement: WorkspaceListingEntitlement | null | undefined;
  organizationId: string | null | undefined;
  providerKey: string | null | undefined;
  /**
   * Inventory channel discriminator. MLS helper only authorizes `mls`.
   * FSBO / manual / preview are denied without consulting authorities.
   */
  dataSource?: string | null | undefined;
  requiredCapability: ListingDataCapability;
};

/**
 * Classify listing `dataSource` into an inventory channel.
 * Unknown / blank → `other` (fail closed for MLS helper).
 */
export function classifyListingInventoryChannel(
  dataSource: string | null | undefined,
): MlsListingDetailInventoryChannel {
  if (typeof dataSource !== "string") return "other";
  const key = dataSource.trim().toLowerCase();
  if (key === "mls") return "mls";
  if (key === "fsbo") return "fsbo";
  if (key === "manual") return "manual";
  if (key === "preview") return "preview";
  return "other";
}

/**
 * Map listing status → detail body capability (G.10B partition aligned).
 * HISTORY / OPEN_HOUSES / MEDIA are never inferred — callers pass those
 * explicitly as `requiredCapability`.
 *
 * ACTIVE / SOLD_CONDITIONAL / unlisted → ACTIVE_LISTINGS
 * SOLD / LEASED → SOLD
 */
export function listingDetailCapabilityForStatus(
  status: ListingStatus | string,
): ListingDataCapability | null {
  if (status === "SOLD" || status === "LEASED") return "SOLD";
  if (
    status === "ACTIVE" ||
    status === "SOLD_CONDITIONAL" ||
    status === "SUSPENDED" ||
    status === "TERMINATED" ||
    status === "EXPIRED"
  ) {
    return "ACTIVE_LISTINGS";
  }
  return null;
}

/**
 * G.10C0 web listing-detail enforcement gate.
 *
 * Same monotonic security pattern as G.10B1 / G.10B3B:
 * - production G5 OFF + no force → disabled
 * - production OFF + force true → enabled
 * - production OFF + force false → disabled
 * - production ON + force false → STILL enabled (cannot downgrade)
 *
 * Does NOT flip `G5_ENTITLEMENT_FILTERING_ENABLED`.
 */
export function isWebListingDetailEntitlementEnforcementEnabled(
  forceEnable?: boolean,
): boolean {
  return isListingEntitlementEnforcementEnabled(forceEnable);
}

/** Re-export pure gate for detail selftests (same truth table as G.10B1). */
export { resolveListingEntitlementEnforcementEnabled };

/**
 * Pure MLS detail entitlement decision.
 *
 * Non-throwing for ordinary authorization denial (no existence oracle).
 * Does not perform I/O. Does not authorize FSBO / manual / preview.
 *
 * Provider keys are normalized via `normalizeRecognizedListingProviderKey`
 * (trim + lowercase + recognized registry) before exact-pair match —
 * matching G.10A resolver policy for inbound provenance.
 */
export function decideMlsListingDetailEntitlement(
  input: DecideMlsListingDetailEntitlementInput,
): MlsListingDetailEntitlementDecision {
  const channel = classifyListingInventoryChannel(input.dataSource);
  switch (channel) {
    case "fsbo":
      return { allowed: false, reason: "non_mls_channel_fsbo" };
    case "manual":
      return { allowed: false, reason: "non_mls_channel_manual" };
    case "preview":
      return { allowed: false, reason: "non_mls_channel_preview" };
    case "other":
      return { allowed: false, reason: "non_mls_channel" };
    case "mls":
      break;
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }

  const entitlement = input.entitlement;
  if (entitlement == null) {
    return { allowed: false, reason: "missing_entitlement" };
  }
  if (entitlement.authorities.length === 0) {
    return { allowed: false, reason: "empty_authorities" };
  }

  const organizationId =
    typeof input.organizationId === "string"
      ? input.organizationId.trim()
      : "";
  if (!organizationId) {
    return { allowed: false, reason: "missing_organization_id" };
  }

  const rawProvider =
    typeof input.providerKey === "string" ? input.providerKey.trim() : "";
  if (!rawProvider) {
    return { allowed: false, reason: "missing_provider_key" };
  }

  const providerKey = normalizeRecognizedListingProviderKey(rawProvider);
  if (!providerKey) {
    return { allowed: false, reason: "unrecognized_provider_key" };
  }

  const capability = input.requiredCapability;

  // Exact same-row pair match (never org-list × provider-list cross product).
  const pairMatches = entitlement.authorities.filter(
    (a) =>
      a.organizationId === organizationId && a.providerKey === providerKey,
  );
  if (pairMatches.length === 0) {
    return { allowed: false, reason: "authority_pair_mismatch" };
  }

  const capabilityOk = pairMatches.some((a) =>
    a.capabilities.includes(capability),
  );
  if (!capabilityOk) {
    return { allowed: false, reason: "missing_capability" };
  }

  return {
    allowed: true,
    organizationId,
    providerKey,
    capability,
  };
}

export type EvaluateWebListingDetailInventoryAccessInput = {
  entitlement?: WorkspaceListingEntitlement | null;
  /**
   * Web force-enable. Same monotonic gate as G.10B1 / G.10C1.
   * Omit / false → follows production G5 (currently OFF / mobile-safe).
   */
  entitlementFilteringEnabled?: boolean;
  organizationId: string | null | undefined;
  providerKey: string | null | undefined;
  dataSource: string | null | undefined;
  status: ListingStatus | string;
  /**
   * Override status-derived body capability (same as loader `requiredCapability`).
   */
  baseCapabilityOverride?: ListingDataCapability;
  /**
   * Extra capabilities (MEDIA / HISTORY / OPEN_HOUSES) that must also pass
   * on the same exact authority pair. Never checked without base body cap.
   */
  additionalCapabilities?: readonly ListingDataCapability[];
};

export type EvaluateWebListingDetailInventoryAccessResult =
  | {
      allowed: true;
      channel: MlsListingDetailInventoryChannel;
      /**
       * Status-derived (or override) body capability for MLS.
       * Null when enforcement is OFF, or for FSBO/manual passthrough.
       */
      baseCapability: ListingDataCapability | null;
    }
  | {
      allowed: false;
      reason: MlsListingDetailEntitlementDenialReason;
      channel: MlsListingDetailInventoryChannel;
    };

/**
 * G.10C2 web listing-detail inventory gate (hostname entitlement already resolved).
 *
 * When enforcement ON:
 * - FSBO / manual → allowed (MLS helper never authorizes them; callers keep
 *   their explicit non-MLS behavior)
 * - preview / other → denied
 * - MLS → base capability (status or override) + every additionalCapability
 *   must pass {@link decideMlsListingDetailEntitlement} on the exact pair
 *
 * When enforcement OFF → allowed (mobile / legacy).
 */
export function evaluateWebListingDetailInventoryAccess(
  input: EvaluateWebListingDetailInventoryAccessInput,
): EvaluateWebListingDetailInventoryAccessResult {
  const channel = classifyListingInventoryChannel(input.dataSource);
  const enforce = isWebListingDetailEntitlementEnforcementEnabled(
    input.entitlementFilteringEnabled,
  );
  if (!enforce) {
    return { allowed: true, channel, baseCapability: null };
  }

  switch (channel) {
    case "fsbo":
    case "manual":
      return { allowed: true, channel, baseCapability: null };
    case "preview":
      return {
        allowed: false,
        reason: "non_mls_channel_preview",
        channel,
      };
    case "other":
      return { allowed: false, reason: "non_mls_channel", channel };
    case "mls":
      break;
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }

  const baseCapability =
    input.baseCapabilityOverride ??
    listingDetailCapabilityForStatus(input.status);
  if (!baseCapability) {
    return { allowed: false, reason: "unsupported_status", channel };
  }

  const capabilities: ListingDataCapability[] = [
    baseCapability,
    ...(input.additionalCapabilities ?? []),
  ];

  for (const capability of capabilities) {
    const decision = decideMlsListingDetailEntitlement({
      entitlement: input.entitlement,
      organizationId: input.organizationId,
      providerKey: input.providerKey,
      dataSource: "mls",
      requiredCapability: capability,
    });
    if (!decision.allowed) {
      return { allowed: false, reason: decision.reason, channel };
    }
  }

  return { allowed: true, channel: "mls", baseCapability };
}

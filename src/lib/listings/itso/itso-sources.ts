/**
 * ITSO source choices for Master Admin.
 * Demo records are not a live entitlement. The live source stays closed
 * until credential, feed, connection, entitlement, and metadata checks pass.
 * This module never reads or grants TRREB access.
 */

export const ITSO_PROVIDER_KEY = "itso" as const;
export const ITSO_DEMO_SOURCE_ID = "itso-demo" as const;
export const ITSO_LIVE_SOURCE_ID = "itso-live" as const;

export type ItsoFeedType = "idx" | "vow";

export type ItsoConnectionStatus =
  | "PENDING"
  | "ACTIVE"
  | "FAILED"
  | "SUSPENDED"
  | "REVOKED"
  | "DISCONNECTED";

export type ItsoLiveSourceInput = {
  credentialRef: string | null;
  feedType: ItsoFeedType | null;
  connectionStatus: ItsoConnectionStatus | null;
  entitlementActive: boolean;
  metadataConfirmed: boolean;
};

export type ItsoSourceAvailability = {
  sourceId: typeof ITSO_DEMO_SOURCE_ID | typeof ITSO_LIVE_SOURCE_ID;
  providerKey: typeof ITSO_PROVIDER_KEY;
  available: boolean;
  trrebBorrowAuthorized: false;
  blockers: string[];
};

export const ITSO_LIVE_SOURCE_UNAVAILABLE: ItsoLiveSourceInput = {
  credentialRef: null,
  feedType: null,
  connectionStatus: null,
  entitlementActive: false,
  metadataConfirmed: false,
};

export function evaluateItsoDemoSource(demoEnabled: boolean): ItsoSourceAvailability {
  return {
    sourceId: ITSO_DEMO_SOURCE_ID,
    providerKey: ITSO_PROVIDER_KEY,
    available: demoEnabled,
    trrebBorrowAuthorized: false,
    blockers: demoEnabled
      ? []
      : ["ITSO demo records stay off until HIGH_OCTANE_DEVELOPMENT_LISTINGS=on outside production."],
  };
}

export function evaluateItsoLiveSource(input: ItsoLiveSourceInput): ItsoSourceAvailability {
  const blockers: string[] = [];
  if (!input.credentialRef?.trim()) {
    blockers.push("ITSO live source needs an opaque credential reference.");
  }
  if (input.feedType !== "idx" && input.feedType !== "vow") {
    blockers.push("ITSO live source needs an authorized IDX or VOW feed type.");
  }
  if (input.connectionStatus !== "ACTIVE") {
    blockers.push("ITSO live source needs an ACTIVE connection.");
  }
  if (!input.entitlementActive) {
    blockers.push("ITSO live source needs a granted listing entitlement.");
  }
  if (!input.metadataConfirmed) {
    blockers.push("ITSO live source needs authenticated $metadata confirmation.");
  }
  return {
    sourceId: ITSO_LIVE_SOURCE_ID,
    providerKey: ITSO_PROVIDER_KEY,
    available: blockers.length === 0,
    trrebBorrowAuthorized: false,
    blockers,
  };
}

export type ItsoSelectedSource = "demo" | "live" | "none";

export function selectItsoListingSource(input: {
  demoEnabled: boolean;
  live?: ItsoLiveSourceInput;
}): ItsoSelectedSource {
  const live = evaluateItsoLiveSource(input.live ?? ITSO_LIVE_SOURCE_UNAVAILABLE);
  if (live.available) return "live";
  if (input.demoEnabled) return "demo";
  return "none";
}

export function describeItsoListingSources(demoEnabled: boolean): {
  selected: ItsoSelectedSource;
  demo: ItsoSourceAvailability;
  live: ItsoSourceAvailability;
} {
  const live = evaluateItsoLiveSource(ITSO_LIVE_SOURCE_UNAVAILABLE);
  const demo = evaluateItsoDemoSource(demoEnabled);
  return {
    selected: selectItsoListingSource({ demoEnabled, live: ITSO_LIVE_SOURCE_UNAVAILABLE }),
    demo,
    live,
  };
}

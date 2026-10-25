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

/** Master Admin choice. Demo is development-only. Live never opens a feed by itself. */
export type ItsoSourceRequest = "demo" | "live" | "disabled";

export function itsoLiveInputFromConnection(
  input: {
    credentialRef: string | null;
    status: ItsoConnectionStatus | null;
    feedType: ItsoFeedType | null;
    entitlementActive: boolean;
    metadataConfirmed: boolean;
  } | null,
): ItsoLiveSourceInput {
  if (!input) return ITSO_LIVE_SOURCE_UNAVAILABLE;
  return {
    credentialRef: input.credentialRef,
    feedType: input.feedType,
    connectionStatus: input.status,
    entitlementActive: input.entitlementActive,
    metadataConfirmed: input.metadataConfirmed,
  };
}

export function selectItsoListingSource(input: {
  demoEnabled: boolean;
  live?: ItsoLiveSourceInput;
  requested?: ItsoSourceRequest | null;
}): ItsoSelectedSource {
  const live = evaluateItsoLiveSource(input.live ?? ITSO_LIVE_SOURCE_UNAVAILABLE);
  switch (input.requested) {
    case "disabled":
      return "none";
    case "live":
      return live.available ? "live" : "none";
    case "demo":
      return input.demoEnabled ? "demo" : "none";
    case null:
    case undefined:
      if (live.available) return "live";
      if (input.demoEnabled) return "demo";
      return "none";
    default: {
      const _exhaustive: never = input.requested;
      void _exhaustive;
      return "none";
    }
  }
}

export type ItsoSourceActivation = {
  accepted: boolean;
  selected: ItsoSelectedSource;
  blockers: string[];
};

/** Rejects a live or demo activation that the existing checks do not allow. */
export function activateItsoSourceRequest(input: {
  requested: ItsoSourceRequest;
  demoEnabled: boolean;
  live?: ItsoLiveSourceInput;
}): ItsoSourceActivation {
  const liveInput = input.live ?? ITSO_LIVE_SOURCE_UNAVAILABLE;
  switch (input.requested) {
    case "disabled":
      return { accepted: true, selected: "none", blockers: [] };
    case "demo": {
      const demo = evaluateItsoDemoSource(input.demoEnabled);
      return {
        accepted: demo.available,
        selected: demo.available ? "demo" : "none",
        blockers: demo.blockers,
      };
    }
    case "live": {
      const live = evaluateItsoLiveSource(liveInput);
      return {
        accepted: live.available,
        selected: live.available ? "live" : "none",
        blockers: live.blockers,
      };
    }
    default: {
      const _exhaustive: never = input.requested;
      void _exhaustive;
      return { accepted: false, selected: "none", blockers: ["Unknown ITSO source request."] };
    }
  }
}

export function describeItsoListingSources(
  demoEnabled: boolean,
  options?: { requested?: ItsoSourceRequest | null; live?: ItsoLiveSourceInput },
): {
  selected: ItsoSelectedSource;
  requested: ItsoSourceRequest | null;
  demo: ItsoSourceAvailability;
  live: ItsoSourceAvailability;
} {
  const liveInput = options?.live ?? ITSO_LIVE_SOURCE_UNAVAILABLE;
  const requested = options?.requested ?? null;
  const live = evaluateItsoLiveSource(liveInput);
  const demo = evaluateItsoDemoSource(demoEnabled);
  return {
    selected: selectItsoListingSource({ demoEnabled, live: liveInput, requested }),
    requested,
    demo,
    live,
  };
}

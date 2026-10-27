/**
 * HIGH OCTANE listing-source choice.
 * PropTx IDX and VOW are this workspace's own TRREB feed. ITSO stays in its
 * own module for other tenants and is not a selectable live source here.
 * This module does not read credentials, copy Houzzat entitlement, or sync MLS.
 */
import { PROPTX_TRREB_ORGANIZATION_SLUG } from "@/lib/proptx/listing-provenance";
import { CURRENT_PROPTX_PROVIDER_KEY } from "@/lib/tenancy/listing-provenance/contract";

export const HIGH_OCTANE_LISTING_SOURCE_REQUESTS = [
  "proptx-idx",
  "proptx-vow",
  "demo",
  "disabled",
] as const;

export type HighOctaneListingSourceRequest =
  (typeof HIGH_OCTANE_LISTING_SOURCE_REQUESTS)[number];

/** Older audit rows stored the retired ITSO live choice. It authorizes nothing. */
export type StoredHighOctaneListingSource =
  | HighOctaneListingSourceRequest
  | "retired-itso-live";

export type HighOctanePropTxFeed = "idx" | "vow";

export type HighOctanePropTxConnectionSnapshot = {
  workspaceId: string;
  providerKey: string;
  organizationSlug: string;
  status: string;
  credentialRefPresent: boolean;
  capabilities: readonly string[];
};

/**
 * Readiness for this workspace only. Approval flags are explicit: a PropTx
 * subscription, a domain, or an IDX choice does not imply API access or VOW.
 */
export type HighOctanePropTxReadiness = {
  workspaceId: string;
  connection: HighOctanePropTxConnectionSnapshot | null;
  membershipStatus: string | null;
  primaryDomainActive: boolean;
  idxWebsiteApproved: boolean;
  vowApproved: boolean;
};

export type HighOctanePropTxSourceAvailability = {
  feed: HighOctanePropTxFeed;
  providerKey: typeof CURRENT_PROPTX_PROVIDER_KEY;
  organizationSlug: typeof PROPTX_TRREB_ORGANIZATION_SLUG;
  available: boolean;
  trrebBorrowAuthorized: false;
  blockers: string[];
};

export function emptyHighOctanePropTxReadiness(
  workspaceId: string,
): HighOctanePropTxReadiness {
  return {
    workspaceId,
    connection: null,
    membershipStatus: null,
    primaryDomainActive: false,
    idxWebsiteApproved: false,
    vowApproved: false,
  };
}

export function parseStoredHighOctaneListingSource(
  raw: unknown,
): StoredHighOctaneListingSource | null {
  if (
    raw === "proptx-idx" ||
    raw === "proptx-vow" ||
    raw === "demo" ||
    raw === "disabled"
  ) {
    return raw;
  }
  if (raw === "live") return "retired-itso-live";
  return null;
}

/**
 * Fixture gate input. PropTx choices and the retired ITSO live choice keep
 * demo inventory off. An unset choice leaves the existing demo default.
 */
export function fixtureRequestForStoredSource(
  stored: StoredHighOctaneListingSource | null,
): "demo" | "disabled" | null {
  switch (stored) {
    case "demo":
      return "demo";
    case "disabled":
    case "proptx-idx":
    case "proptx-vow":
    case "retired-itso-live":
      return "disabled";
    case null:
      return null;
    default: {
      const _exhaustive: never = stored;
      return _exhaustive;
    }
  }
}

export function evaluateHighOctanePropTxSource(
  feed: HighOctanePropTxFeed,
  input: HighOctanePropTxReadiness,
): HighOctanePropTxSourceAvailability {
  const blocked = (blockers: string[]): HighOctanePropTxSourceAvailability => ({
    feed,
    providerKey: CURRENT_PROPTX_PROVIDER_KEY,
    organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
    available: false,
    trrebBorrowAuthorized: false,
    blockers,
  });

  const workspaceId = input.workspaceId.trim();
  const connection = input.connection;
  if (!workspaceId) {
    return blocked(["Choose the HIGH OCTANE workspace before selecting a feed."]);
  }
  if (!connection) {
    return blocked([
      "This workspace needs its own PropTx connection. Houzzat's TRREB credentials are not shared.",
    ]);
  }
  if (connection.workspaceId.trim() !== workspaceId) {
    return blocked([
      "A connection from another workspace cannot authorize HIGH OCTANE.",
    ]);
  }

  const blockers: string[] = [];
  if (connection.providerKey !== CURRENT_PROPTX_PROVIDER_KEY) {
    blockers.push("The connection must use the PropTx provider.");
  }
  if (connection.organizationSlug !== PROPTX_TRREB_ORGANIZATION_SLUG) {
    blockers.push("The connection must be for TRREB (ca-on-trreb), not another board.");
  }
  if (input.membershipStatus !== "VERIFIED") {
    blockers.push(
      "TRREB participant membership must be VERIFIED for this workspace. Membership alone does not grant the feed.",
    );
  }
  if (connection.status !== "ACTIVE") {
    blockers.push("The PropTx connection must be ACTIVE.");
  }
  if (!connection.credentialRefPresent) {
    blockers.push(
      "Store an opaque credential reference for Saad's own PropTx token. A subscription does not enable API access.",
    );
  }
  if (!connection.capabilities.includes("ACTIVE_LISTINGS")) {
    blockers.push(
      "Assign listing entitlement by granting ACTIVE_LISTINGS on this workspace's connection. Do not copy Houzzat's entitlement.",
    );
  }
  if (!input.primaryDomainActive) {
    blockers.push("The primary website domain must be ACTIVE before IDX approval.");
  }
  if (!input.idxWebsiteApproved) {
    blockers.push("TRREB must approve this website for IDX display.");
  }
  if (feed === "vow" && !input.vowApproved) {
    blockers.push(
      "VOW needs a separate PropTx agreement. IDX approval does not include VOW.",
    );
  }

  return {
    feed,
    providerKey: CURRENT_PROPTX_PROVIDER_KEY,
    organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
    available: blockers.length === 0,
    trrebBorrowAuthorized: false,
    blockers,
  };
}

export type HighOctaneListingSourceActivation = {
  accepted: boolean;
  selected: HighOctaneListingSourceRequest | "none";
  blockers: string[];
};

export function activateHighOctaneListingSourceRequest(input: {
  requested: HighOctaneListingSourceRequest;
  demoEnabled: boolean;
  readiness: HighOctanePropTxReadiness;
}): HighOctaneListingSourceActivation {
  switch (input.requested) {
    case "disabled":
      return { accepted: true, selected: "disabled", blockers: [] };
    case "demo":
      return input.demoEnabled
        ? { accepted: true, selected: "demo", blockers: [] }
        : {
            accepted: false,
            selected: "none",
            blockers: [
              "Protected demo stays off until HIGH_OCTANE_DEVELOPMENT_LISTINGS=on outside production.",
            ],
          };
    case "proptx-idx":
    case "proptx-vow": {
      const feed = input.requested === "proptx-idx" ? "idx" : "vow";
      const decision = evaluateHighOctanePropTxSource(feed, input.readiness);
      return {
        accepted: decision.available,
        selected: decision.available ? input.requested : "none",
        blockers: decision.blockers,
      };
    }
    default: {
      const _exhaustive: never = input.requested;
      return _exhaustive;
    }
  }
}

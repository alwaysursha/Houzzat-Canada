/**
 * HIGH OCTANE development listing-source boundary.
 *
 * Branding, listing source, and display entitlement stay separate:
 * - Branding / lead ownership: the tenant website (fixture or future workspace).
 * - Listing source: which workspace entitlement may be read.
 * - Display scope: existing IDX/VOW redaction on that entitlement.
 *
 * This module does not read the database, copy listings, or authorize a request.
 * A query parameter never grants Houzzat inventory.
 */

export const HIGH_OCTANE_LISTING_SOURCE_KIND = "workspace_connection" as const;

/**
 * Dependencies a future Master Admin source switch must invalidate.
 * Switching HIGH OCTANE from the Houzzat host entitlement to a Niagara
 * connection changes authority keys, not listing ownership.
 */
export const LISTING_SOURCE_SWITCH_INVALIDATION = [
  "hostname listing entitlement for the tenant workspace",
  "Typesense filters on organizationId, providerKey, and sourceAuthorityKey",
  "GET /api/listings/search results for that host",
  "GET /api/listings/home-rails guest cache (s-maxage=45, stale-while-revalidate=120)",
  "GET /api/listings/photo (max-age=86400, stale-while-revalidate=604800)",
  "GET /api/listings/:mls/gallery and listing-detail media",
  "listing canonical metadata and RealEstateListing JSON-LD provider",
  "client search memory and homepage rail responses",
] as const;

export type HighOctaneListingSourceInput = {
  nodeEnv: string | undefined;
  hostIsHouzzatWorkspace: boolean;
  hostWorkspaceId: string | null;
  ownerSessionForHostWorkspace: boolean;
  /** True when the only activation signal is a URL query or process env. */
  activatedByQueryOrEnvOnly: boolean;
};

export type HighOctaneListingSourceDecision = {
  branding: "high-octane-fixture";
  listingSource: "none";
  sourceWorkspaceId: null;
  /** Listing brokerage and board attribution stay on the listing record. */
  preservesListingAttribution: true;
  reason:
    | "production"
    | "query_or_env_only"
    | "not_houzzat_host"
    | "owner_session_required"
    | "fixture_is_not_a_workspace";
};

/**
 * The display fixture is not a workspace and cannot borrow Houzzat inventory.
 * Input is accepted so callers cannot treat a query or owner session as a source.
 */
export function resolveHighOctaneDevelopmentListingSource(
  input: HighOctaneListingSourceInput,
): HighOctaneListingSourceDecision {
  const denied = (
    reason: HighOctaneListingSourceDecision["reason"],
  ): HighOctaneListingSourceDecision => ({
    branding: "high-octane-fixture",
    listingSource: "none",
    sourceWorkspaceId: null,
    preservesListingAttribution: true,
    reason,
  });

  if (input.nodeEnv === "production") return denied("production");
  if (input.activatedByQueryOrEnvOnly) return denied("query_or_env_only");
  if (!input.hostIsHouzzatWorkspace || !input.hostWorkspaceId?.trim()) {
    return denied("not_houzzat_host");
  }
  if (!input.ownerSessionForHostWorkspace) return denied("owner_session_required");
  return denied("fixture_is_not_a_workspace");
}

export type TenantListingSourceAssignment = {
  listingSource: "none" | typeof HIGH_OCTANE_LISTING_SOURCE_KIND;
  sourceWorkspaceId: string | null;
  preservesListingAttribution: true;
  reason:
    | "missing_tenant"
    | "query_authorization"
    | "cross_tenant"
    | "no_connection"
    | "workspace_connection";
};

/**
 * Source authority must already be the hostname workspace's own entitlement.
 * `connectionCount` is that workspace's authority count, never another tenant's.
 */
export function resolveTenantListingSourceAssignment(input: {
  tenantWorkspaceId: string | null;
  sourceWorkspaceId: string | null;
  authorizedByQuery: boolean;
  connectionCount: number;
}): TenantListingSourceAssignment {
  const denied = (
    reason: TenantListingSourceAssignment["reason"],
  ): TenantListingSourceAssignment => ({
    listingSource: "none",
    sourceWorkspaceId: null,
    preservesListingAttribution: true,
    reason,
  });

  if (input.authorizedByQuery) return denied("query_authorization");
  const tenantId = input.tenantWorkspaceId?.trim() || "";
  if (!tenantId) return denied("missing_tenant");
  const sourceId = input.sourceWorkspaceId?.trim() || "";
  if (sourceId && sourceId !== tenantId) return denied("cross_tenant");
  if (!Number.isInteger(input.connectionCount) || input.connectionCount < 1) {
    return denied("no_connection");
  }
  return {
    listingSource: HIGH_OCTANE_LISTING_SOURCE_KIND,
    sourceWorkspaceId: tenantId,
    preservesListingAttribution: true,
    reason: "workspace_connection",
  };
}

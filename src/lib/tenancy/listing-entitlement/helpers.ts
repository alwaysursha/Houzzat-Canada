/**
 * Stage 6.11G.10A — pure entitlement helpers (no I/O).
 */

import type {
  ListingDataCapability,
  ListingProvenanceRef,
  WorkspaceListingEntitlement,
} from "./types";

export function entitlementHasCapability(
  entitlement: WorkspaceListingEntitlement,
  capability: ListingDataCapability,
): boolean {
  return entitlement.authorities.some((a) =>
    a.capabilities.includes(capability),
  );
}

/**
 * Exact-pair provenance gate. Null org/provider → denied.
 * Cross-product impossible: both sides must match the same authority row.
 */
export function entitlementAllowsProvenance(
  entitlement: WorkspaceListingEntitlement,
  provenance: ListingProvenanceRef,
  capability: ListingDataCapability,
): boolean {
  const organizationId =
    typeof provenance.organizationId === "string"
      ? provenance.organizationId.trim()
      : "";
  const providerKey =
    typeof provenance.providerKey === "string"
      ? provenance.providerKey.trim()
      : "";
  if (!organizationId || !providerKey) return false;

  return entitlement.authorities.some(
    (a) =>
      a.organizationId === organizationId &&
      a.providerKey === providerKey &&
      a.capabilities.includes(capability),
  );
}

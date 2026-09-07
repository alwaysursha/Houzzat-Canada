/**
 * Stage 6.11G.10A — MLS listing entitlement types.
 *
 * G.10A answers: does this Workspace have source/capability authority?
 * Display/IDX/VOW policy is a separate layer (not this module).
 */

import type { WorkspaceDataConnectionCapabilityKind } from "@/lib/tenancy/data-connection";

/** Reuse G.4 capability enum — do not duplicate. */
export type ListingDataCapability = WorkspaceDataConnectionCapabilityKind;

export type ListingSourceAuthority = {
  organizationId: string;
  providerKey: string;
  /** Exact `${organizationId}:${providerKey}` via buildListingSourceAuthorityKey. */
  sourceAuthorityKey: string;
  capabilities: readonly ListingDataCapability[];
};

export type WorkspaceListingEntitlement = {
  workspaceId: string;
  /**
   * Exact authorized (organizationId, providerKey) pairs.
   * Empty = no MLS inventory authority (normal fail-closed success).
   */
  authorities: readonly ListingSourceAuthority[];
};

export type ListingProvenanceRef = {
  organizationId: string | null | undefined;
  providerKey: string | null | undefined;
};

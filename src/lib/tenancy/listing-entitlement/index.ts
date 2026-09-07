/**
 * Stage 6.11G.10A — canonical Workspace MLS listing entitlement.
 *
 * INTERNAL workspaceId resolver vs hostname-facing wrapper:
 *   - resolveWorkspaceListingEntitlement — trusted workspaceId only
 *   - resolveListingEntitlementForHostname — G.7C host → entitlement
 */

export type {
  ListingDataCapability,
  ListingProvenanceRef,
  ListingSourceAuthority,
  WorkspaceListingEntitlement,
} from "./types";

export {
  RECOGNIZED_LISTING_DATA_PROVIDER_KEYS,
  normalizeRecognizedListingProviderKey,
  type RecognizedListingDataProviderKey,
} from "./provider-key";

export {
  entitlementAllowsProvenance,
  entitlementHasCapability,
} from "./helpers";

export {
  resolveWorkspaceListingEntitlement,
  type ResolveWorkspaceListingEntitlementInput,
} from "./resolve";

export {
  resolveListingEntitlementForHostname,
  resolveListingEntitlementForHostnameCached,
  type ListingEntitlementForHostnameFailure,
  type ListingEntitlementForHostnameResult,
  type ListingEntitlementForHostnameSuccess,
  type ResolveListingEntitlementForHostnameInput,
} from "./resolve-for-hostname";

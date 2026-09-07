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

export {
  buildPrismaCapabilityScopedStatusWhere,
  buildPrismaEntitledInventoryWhere,
  buildPrismaListingAuthorityWhere,
  buildTypesenseCapabilityScopedStatusFilter,
  buildTypesenseListingAuthorityFilter,
  composeTypesenseFilterWithAuthority,
  G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT,
  G10B2H_HOME_RAILS_ENTITLEMENT_WIRED,
  isListingEntitlementEnforcementEnabled,
  normalizeListingSearchStatuses,
  partitionStatusesByListingCapability,
  quoteTypesenseFilterValue,
  resolveListingEntitlementEnforcementEnabled,
  type PrismaAuthorityWhereResult,
  type TypesenseAuthorityFilterResult,
} from "./search-authority-filters";

export {
  emptyListingEntitlementSnapshot,
  resolveListingEntitlementContextForHostname,
  resolveListingEntitlementContextForRequest,
  resolveListingEntitlementContextForServerPage,
  type RequestListingEntitlementContext,
} from "./resolve-for-request";

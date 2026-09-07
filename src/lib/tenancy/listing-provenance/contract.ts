/**
 * Stage 6.11G.5 / G.5A — Listing provenance foundation contract.
 *
 * Schema/migration only. No backfill, entitlement filter, Typesense reindex,
 * PropTx behavior change, or route changes in this stage.
 *
 * Field semantics:
 *   RealEstateOrganization = board / MLS / association directory entity
 *   providerKey            = integration/data provider (e.g. proptx), ≠ organization
 *   providerListingKey     = REQUIRED durable provider-native id
 *                            PropTx/AMPRE = RESO ListingKey (mapListingKey)
 *                            NOT ListingId / MlsNumber
 *   sourceMlsNumber        = MLS®/board display number from that source
 *                            PropTx = ListingId / MlsNumber (mapMlsNumber)
 *   feedKey                = REMOVED in G.5A (premature; risk of IDX/VOW conflation)
 *
 * Architecture:
 *   ListingSource is CANONICAL lineage.
 *   Listing.organizationId? + Listing.providerKey? are DENORMALIZED mirrors of
 *   the single isPrimary ListingSource (partial unique enforces ≤1 primary).
 *
 *   WorkspaceDataConnection authorizes Workspace use via organizationId +
 *   providerKey (+ ACTIVE + DATA capabilities). It does NOT own Listing rows.
 *
 *   dataSource remains channel only: mls | fsbo | mock | manual.
 *   FSBO/mock/manual must NOT receive MLS ListingSource / TRREB tags.
 *
 *   Canonical identity (future — not enforced yet):
 *     (organizationId, providerKey, providerListingKey)
 *   Global mlsNumber @unique remains a temporary single-feed assumption.
 *
 *   Multi-source: multiple ListingSource rows allowed; never auto-merge by
 *   address/MLS resemblance (entity resolution is a later problem).
 *
 *   Entitlement (future):
 *     ACTIVE connection ∩ ListingSource org/provider ∩ DATA capability
 *     (+ provider-specific display/access policy separately — not feedKey)
 *
 *   Preview Listing Provider remains separate — do not insert demo rows here.
 */

export const LISTING_INVENTORY_CHANNELS = [
  "mls",
  "fsbo",
  "mock",
  "manual",
] as const;

export type ListingInventoryChannel =
  (typeof LISTING_INVENTORY_CHANNELS)[number];

/** Channels that must never receive MLS board organization attribution. */
export const NON_MLS_PROVENANCE_CHANNELS = [
  "fsbo",
  "mock",
  "manual",
] as const;

export const CURRENT_PROPTX_PROVIDER_KEY = "proptx" as const;

/**
 * PropTx durable source key = RESO ListingKey (mapListingKey).
 * Display MLS = ListingId / MlsNumber (mapMlsNumber) → sourceMlsNumber.
 */
export const PROPTX_PROVIDER_LISTING_KEY_FIELD = "ListingKey" as const;
export const PROPTX_SOURCE_MLS_NUMBER_FIELD = "ListingId" as const;

/**
 * Future Typesense fields (G.9B mapper ready; schema ensure not applied to prod yet):
 * organizationId, providerKey, sourceAuthorityKey, listingId (stable), sourceMlsNumber
 * Document id must eventually stop being bare mlsNumber.
 */
export const FUTURE_TYPESENSE_PROVENANCE_FIELDS = [
  "organizationId",
  "providerKey",
  "sourceAuthorityKey",
  "listingId",
  "sourceMlsNumber",
] as const;

export const LISTING_SOURCE_MODEL = "ListingSource" as const;

/** feedKey intentionally not part of G.5A source identity. */
export const LISTING_SOURCE_FEED_KEY_INCLUDED = false;

export type ListingPrimaryProvenance = {
  organizationId: string | null;
  providerKey: string | null;
};

export type ListingSourceContract = {
  id: string;
  listingId: string;
  organizationId: string | null;
  providerKey: string;
  /** Required — never null. */
  providerListingKey: string;
  sourceMlsNumber: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Hard locks for this stage. */
export const G5_ENTITLEMENT_FILTERING_ENABLED = false;
export const G5_BACKFILL_ENABLED = false;
export const G5_TYPESENSE_REINDEX_ENABLED = false;
export const LISTING_OWNED_BY_WORKSPACE_DATA_CONNECTION = false;
export const MLS_NUMBER_GLOBALLY_UNIQUE_IS_MULTI_BOARD_RISK = true;
export const PROVIDER_LISTING_KEY_REQUIRED = true;
export const LISTING_SOURCE_IS_CANONICAL_LINEAGE = true;
export const LISTING_ORG_PROVIDER_ARE_DENORMALIZED_PRIMARY = true;

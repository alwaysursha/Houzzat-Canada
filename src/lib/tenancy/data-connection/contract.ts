/**
 * Stage 6.11G.4 — Workspace listing-data connection contract.
 *
 * Schema/migration only. Runtime entitlement / OWNER connection APIs deferred
 * until migration reviewed and applied (no deploy risk against unapplied tables).
 *
 * Architecture lock:
 *   Workspace is the MLS/listing-access boundary.
 *   Membership ≠ DataConnection ≠ Listing entitlement
 *   VERIFIED membership grants ZERO listing rights without eligible connection.
 *   Only ACTIVE connections + granted capabilities may eventually contribute
 *   inventory to resolveWorkspaceListingEntitlement (not built).
 *   Multiple ACTIVE connections → UNION of permitted inventory.
 *   No eligible connections → NO MLS inventory (fail closed).
 *   Never fall back to Houzzat/platform TRREB credentials for other tenants.
 *
 * Organization vs provider:
 *   RealEstateOrganization = board/MLS/association directory row
 *   providerKey = integration/vendor (e.g. proptx) — independent string key
 *
 * Membership relationship:
 *   Connection FKs Workspace + RealEstateOrganization directly (first-class).
 *   No FK to WorkspaceRealEstateOrganizationMembership — service validation
 *   requires matching membership; lifecycles stay independently revocable.
 *
 * Ownership:
 *   No User / WorkspaceMember / WorkspaceTeamMember ownership FKs.
 *   Workspace remains the resource authority.
 *
 * Credentials:
 *   credentialRef only (opaque). Never raw apiKey/password/bearer/token.
 *
 * Capabilities (G.4A):
 *   DATA / inventory only: ACTIVE_LISTINGS | SOLD | HISTORY | OPEN_HOUSES | MEDIA
 *   IDX_DISPLAY / VOW_DISPLAY are NOT universal capabilities — they are
 *   TRREB/PropTx-style access/display concepts mapped by provider adapters into
 *   app authorization/redaction. Future provider-specific policy persistence
 *   (if needed) must be a separate extensible mechanism, not this enum.
 *
 * Shared warehouse:
 *   Connection authorizes provenance/use; does not force per-Workspace Listing rows.
 *
 * Preview listing rule (locked; Preview Listing Provider not in G.4):
 *   LIVE: Active DataConnection(s) + capabilities → permitted data
 *   PREVIEW: curated demo dataset — no connection required; never live entitlement.
 */

export const WORKSPACE_DATA_CONNECTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "FAILED",
  "SUSPENDED",
  "REVOKED",
  "DISCONNECTED",
] as const;

export type WorkspaceDataConnectionStatus =
  (typeof WORKSPACE_DATA_CONNECTION_STATUSES)[number];

/** Only this status may eventually contribute MLS inventory. */
export const ENTITLEMENT_ELIGIBLE_CONNECTION_STATUS =
  "ACTIVE" as const satisfies WorkspaceDataConnectionStatus;

export const DEFAULT_WORKSPACE_DATA_CONNECTION_STATUS =
  "PENDING" as const satisfies WorkspaceDataConnectionStatus;

export const WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS = [
  "ACTIVE_LISTINGS",
  "SOLD",
  "HISTORY",
  "OPEN_HOUSES",
  "MEDIA",
] as const;

export type WorkspaceDataConnectionCapabilityKind =
  (typeof WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS)[number];

export type WorkspaceDataConnectionContract = {
  id: string;
  workspaceId: string;
  organizationId: string;
  providerKey: string;
  status: WorkspaceDataConnectionStatus;
  credentialRef: string | null;
  externalConnectionIdentifier: string | null;
  lastVerifiedAt: Date | null;
  lastSuccessfulAccessAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Hard locks — connection presence alone is not enough without ACTIVE + caps. */
export const MEMBERSHIP_ALONE_GRANTS_LISTING_ACCESS = false;
export const VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS = false;
export const NON_ACTIVE_CONNECTION_GRANTS_LISTING_ACCESS = false;
export const ACTIVE_CONNECTION_WITHOUT_CAPABILITIES_IS_INCOMPLETE = true;

export const WORKSPACE_DATA_CONNECTION_MODEL = "WorkspaceDataConnection" as const;
export const WORKSPACE_DATA_CONNECTION_CAPABILITY_MODEL =
  "WorkspaceDataConnectionCapability" as const;

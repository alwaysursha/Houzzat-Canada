/**
 * Stage 6.11G.3 / G.3A — Workspace ↔ RealEstateOrganization membership contract.
 *
 * Schema/migration only in this stage. Runtime OWNER CRUD and directory APIs
 * are DEFERRED until the G.3 migration is reviewed and applied (no deploy risk
 * against unapplied tables).
 *
 * Architecture lock:
 *   Workspace is the MLS/listing-access boundary.
 *   Membership ≠ DataConnection ≠ Listing entitlement
 * Even VERIFIED membership grants ZERO MLS inventory / ZERO listing rights.
 * NOT linked to WorkspaceTeamMember (public roster), User, or SaaS seat rows.
 * Team members do NOT require individual MLS membership records.
 * WorkspaceMember is used only for future host-bound OWNER authorization.
 *
 * Multi-board example (same Workspace):
 *   → TRREB membership (+ future TRREB DataConnection)
 *   → LSTAR membership (+ future LSTAR DataConnection)
 * Future listing universe = UNION of permitted inventory from ALL ACTIVE
 * Workspace DataConnections (resolveWorkspaceListingEntitlement — not built).
 *
 * Future OWNER authority (when APIs land):
 *   hostname → WorkspaceDomain → ACTIVE Workspace → session →
 *   ACTIVE OWNER WorkspaceMember → host-authorized Workspace
 * Client-supplied workspaceId never establishes authority.
 * Cross-tenant membership ids fail closed.
 *
 * Future onboarding (not built here):
 *   Country → Region → Organization search → select one or more orgs →
 *   optional membership identifier → status
 * Unsupported/PLANNED orgs remain selectable for demand tracking
 * without granting inventory. Inactive directory orgs not newly selectable.
 *
 * Future G.5 sibling (not this model):
 *   Workspace
 *    ├─ Organization Membership(s)   ← this contract (e.g. TRREB, LSTAR)
 *    └─ Data Connection(s)           ← independent, one per org/provider
 *         → Organization
 *         → Provider/Integration
 *         → secure credential reference
 *         → capabilities
 *         → connection status
 * Membership and connection are independently revocable.
 * Multiple ACTIVE DataConnections may contribute to one Workspace listing universe.
 *
 * Preview listing rule (locked; Preview Listing Provider not in G.3):
 *   LIVE: Membership → Active Data Connection(s) → Capabilities → Permitted data
 *   PREVIEW: curated demo dataset only — never Houzzat TRREB credentials,
 *   never live entitlement, alerts, watch, CRM, or analytics contamination.
 * Preview remains populated even with zero memberships / connections.
 */

export const WORKSPACE_REO_MEMBERSHIP_STATUSES = [
  "DECLARED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "INACTIVE",
] as const;

export type WorkspaceReoMembershipStatus =
  (typeof WORKSPACE_REO_MEMBERSHIP_STATUSES)[number];

/** Default when OWNER records a new membership claim. */
export const DEFAULT_WORKSPACE_REO_MEMBERSHIP_STATUS =
  "DECLARED" as const satisfies WorkspaceReoMembershipStatus;

/**
 * Optional provider-neutral board/member/subscriber id metadata.
 * Never a password, bearer token, API key, secret, feed connection,
 * authorization, or listing entitlement.
 */
export type WorkspaceReoMembershipIdentifier = string | null;

export type WorkspaceReoMembershipContract = {
  id: string;
  workspaceId: string;
  organizationId: string;
  membershipIdentifier: WorkspaceReoMembershipIdentifier;
  status: WorkspaceReoMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** Hard lock: membership never authorizes listing surfaces. */
export const MEMBERSHIP_GRANTS_LISTING_ACCESS = false;

/** Hard lock: VERIFIED still grants no listing surfaces. */
export const VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS = false;

export const WORKSPACE_REO_MEMBERSHIP_MODEL =
  "WorkspaceRealEstateOrganizationMembership" as const;

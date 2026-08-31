/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Workspace Domain Model.
 *
 * TENANCY ARCHITECTURE PRINCIPLE:
 * Authenticated Mobile User -> Active WorkspaceMember -> workspaceId -> Role -> Workspace Resources.
 * Mobile tenancy authority is strictly `workspaceId`. Hostname is NEVER tenant authority.
 */

export type MobileWorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

export type MobileWorkspaceMembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export interface MobileWorkspaceBrand {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string | null;
  isHouzzatWorkspace?: boolean;
}

export interface MobileWorkspace {
  id: string; // The immutable tenant workspace identifier (e.g., "ws_houzzat_prod")
  slug: string;
  displayName: string;
  brand?: MobileWorkspaceBrand;
}

export interface MobileWorkspaceMembership {
  id: string; // Membership ID
  workspaceId: string; // The tenant workspace ID
  userId: string;
  role: MobileWorkspaceRole;
  status: MobileWorkspaceMembershipStatus;
  workspace: MobileWorkspace;
}

/**
 * Production tenant staff web surfaces: hostname-bound membership is
 * authority. User.role is not. Edge-safe (no Prisma).
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { shouldDeferStaffWebRoleToHostnameMembership } from "@/lib/auth/pro-sign-in-routing";
import { isStaffWorkspaceMemberRole } from "@/lib/mobile/workspace-destination";
import { isAgentRole } from "@/lib/roles";

export type TenantStaffWebSurface = "admin" | "agent";

export type TenantStaffWebAccessDecision = "allow" | "account" | "agent";

export type HostnameBoundStaffMembership = {
  workspaceId: string;
  role: WorkspaceMemberRole;
  status: string;
};

/**
 * ACTIVE membership on the hostname workspace only.
 * Another workspace's membership never grants this host's CRM.
 */
export function hostnameBoundMembershipGrantsStaffWeb(input: {
  hostnameWorkspaceId: string;
  membership: HostnameBoundStaffMembership | null | undefined;
}): boolean {
  const member = input.membership;
  if (!member) return false;
  if (member.status !== "ACTIVE") return false;
  if (member.workspaceId !== input.hostnameWorkspaceId) return false;
  return isStaffWorkspaceMemberRole(member.role);
}

/**
 * Combined middleware + layout decision for tenant /admin and /agent.
 * Does not grant /platform. PlatformOperator is not consulted.
 */
export function decideHostnameBoundStaffWebAccess(input: {
  surface: TenantStaffWebSurface;
  hostname: string;
  userRole: string;
  hostnameWorkspaceId: string;
  membership: HostnameBoundStaffMembership | null;
}): TenantStaffWebAccessDecision {
  const middlewarePass =
    shouldDeferStaffWebRoleToHostnameMembership(input.hostname) ||
    isAgentRole(input.userRole);
  if (!middlewarePass) return "account";

  if (
    !hostnameBoundMembershipGrantsStaffWeb({
      hostnameWorkspaceId: input.hostnameWorkspaceId,
      membership: input.membership,
    })
  ) {
    return "account";
  }

  const role = input.membership!.role;
  switch (input.surface) {
    case "admin":
      switch (role) {
        case "OWNER":
        case "ADMIN":
          return "allow";
        case "AGENT":
          return "agent";
        default: {
          const _exhaustive: never = role;
          return _exhaustive;
        }
      }
    case "agent":
      return "allow";
    default: {
      const _exhaustive: never = input.surface;
      return _exhaustive;
    }
  }
}

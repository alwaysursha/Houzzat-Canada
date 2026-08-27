/** Stage 3K.5.10 — tenant mobile destination from WorkspaceMember role. */
import type { WorkspaceMemberRole } from "@prisma/client";

export type MobileStaffPathDestination = "/admin" | "/agent" | "/pro/for-staff";

export function resolveWorkspaceMemberMobileDestination(
  workspaceRole: WorkspaceMemberRole,
): MobileStaffPathDestination {
  switch (workspaceRole) {
    case "OWNER":
    case "ADMIN":
      return "/admin";
    case "AGENT":
      return "/agent";
    default: {
      const _exhaustive: never = workspaceRole;
      return _exhaustive;
    }
  }
}

export function isStaffWorkspaceMemberRole(role: WorkspaceMemberRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "AGENT";
}

/**
 * Absolute post-handoff URL on a tenant host from WorkspaceMember.role.
 * Successful exchange must never stabilize on /pro.
 */
export function resolveTenantHostRoleDestinationUrl(
  hostname: string,
  workspaceRole: WorkspaceMemberRole,
): string {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  const path = resolveWorkspaceMemberMobileDestination(workspaceRole);
  return `https://${host}${path}`;
}

/** Successful handoff client navigation targets only. */
export function isSuccessfulHandoffClientDestination(
  path: string | null | undefined,
): path is "/admin" | "/agent" {
  return path === "/admin" || path === "/agent";
}

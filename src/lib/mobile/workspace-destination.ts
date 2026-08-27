/** Stage 3K.5.10 — tenant mobile destination from WorkspaceMember role. */
import type { WorkspaceMemberRole } from "@prisma/client";

export function resolveWorkspaceMemberMobileDestination(
  workspaceRole: WorkspaceMemberRole,
): "/admin" | "/agent" | "/pro/for-staff" {
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

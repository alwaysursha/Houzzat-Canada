/**
 * Stage 3K.5.2 — hostname ↔ workspace authorization primitives.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  resolveRequestTenancy,
  type RequestTenancyDeps,
  type RequestTenancySuccess,
} from "@/lib/tenancy/resolve-request-tenancy";
import type { HostResolutionDenyReason } from "@/lib/tenancy/host-resolution-types";
import { resolveWorkspaceStaffContext } from "@/lib/workspace-context";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";

export type RequestWorkspaceAuthDenyReason =
  | HostResolutionDenyReason
  | "unauthenticated"
  | "workspace_membership_required"
  | "workspace_host_mismatch"
  | "malformed_hostname"
  | "platform_surface"
  | "protocol_not_allowed"
  | "userinfo_in_url"
  | "missing_hostname";

export class RequestWorkspaceAuthError extends Error {
  readonly reason: RequestWorkspaceAuthDenyReason;

  constructor(reason: RequestWorkspaceAuthDenyReason, message?: string) {
    super(message ?? reason);
    this.name = "RequestWorkspaceAuthError";
    this.reason = reason;
  }
}

export type RequestStaffAccessSuccess = RequestTenancySuccess & {
  userId: string;
  isPlatformAdmin: boolean;
  workspaceRole: WorkspaceMemberRole | null;
  canManageWorkspace: boolean;
};

/**
 * Resolve workspace from request hostname — fail closed when unknown.
 */
export async function requireWorkspaceForRequest(
  request: Request,
  deps?: RequestTenancyDeps,
): Promise<RequestTenancySuccess> {
  const tenancy = await resolveRequestTenancy(request, deps);
  if (!tenancy.ok) {
    throw new RequestWorkspaceAuthError(tenancy.reason);
  }
  return tenancy;
}

/**
 * Verify authenticated user may act on the workspace bound to request hostname.
 *
 * Order: hostname → workspace → user → membership/platform authority.
 * Platform ADMIN may access any resolved workspace host (TENANT_ADMIN_HOST_LOCK remains off).
 */
export async function requireStaffAccessForRequestWorkspace(
  request: Request,
  user: { id: string; role: string },
  deps?: RequestTenancyDeps,
): Promise<RequestStaffAccessSuccess> {
  if (!user.id) {
    throw new RequestWorkspaceAuthError("unauthenticated");
  }

  const tenancy = await requireWorkspaceForRequest(request, deps);
  const isPlatformAdmin = isAdminRole(user.role);

  if (isPlatformAdmin) {
    return {
      ...tenancy,
      userId: user.id,
      isPlatformAdmin: true,
      workspaceRole: null,
      canManageWorkspace: true,
    };
  }

  const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const membership = await resolveWorkspaceStaffContext(user.id, activeWorkspaceId);

  if (
    !membership.isWorkspaceCrmAllowed ||
    membership.workspaceId !== tenancy.workspaceId
  ) {
    throw new RequestWorkspaceAuthError(
      "workspace_membership_required",
      "User is not an ACTIVE member of the request workspace",
    );
  }

  return {
    ...tenancy,
    userId: user.id,
    isPlatformAdmin: false,
    workspaceRole: membership.workspaceRole,
    canManageWorkspace: membership.canManageWorkspace,
  };
}

/** Test helper — membership lookup without cookie dependency. */
export async function userHasActiveWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<{ role: WorkspaceMemberRole; canManageWorkspace: boolean } | null> {
  const row = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });
  if (!row) return null;
  return {
    role: row.role,
    canManageWorkspace: row.role === "OWNER" || row.role === "ADMIN",
  };
}

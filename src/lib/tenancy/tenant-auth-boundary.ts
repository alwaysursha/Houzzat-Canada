/**
 * Stage 3K.5.13 — Hard tenant login boundary & cross-workspace auth isolation.
 *
 * Security Invariant:
 * On a tenant hostname:
 * HOSTNAME → resolved Workspace → authenticated User → ACTIVE WorkspaceMember for THAT EXACT Workspace
 *
 * If the authenticated user does NOT have an ACTIVE WorkspaceMember for the workspace
 * resolved from the current hostname:
 * THE LOGIN MUST FAIL (generic invalid credentials, no session created, fail closed).
 *
 * Platform Host (app.houzzatpro.com):
 * Authenticates platform identity globally for workspace discovery and handoff.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isConsumerRole } from "@/lib/roles";
import {
  resolveRequestTenancy,
  type RequestTenancyDeps,
} from "@/lib/tenancy/resolve-request-tenancy";
import { resolveWorkspaceFromHostname } from "@/lib/tenancy/resolve-workspace-host";

export type TenantAuthValidationResult =
  | {
      ok: true;
      isPlatform: boolean;
      workspaceId?: string;
      workspaceRole?: WorkspaceMemberRole;
    }
  | {
      ok: false;
      reason:
        | "unknown_tenant_workspace"
        | "no_active_membership"
        | "workspace_inactive"
        | "unauthenticated";
    };

/**
 * Validates whether an authenticated User is allowed to establish an Auth.js session
 * on the current request hostname.
 */
export async function validateTenantCredentialsAuth(input: {
  userId: string;
  userRole?: string | null;
  request?: Request | null;
  requestHostname?: string | null;
  deps?: RequestTenancyDeps;
}): Promise<TenantAuthValidationResult> {
  if (!input.userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  const hostname =
    input.requestHostname ??
    (input.request ? extractTrustedRequestHostname(input.request) : null);

  // Platform bootstrap host (app.houzzatpro.com) authenticates platform identity globally.
  if (isPlatformMobileBootstrapHost(hostname)) {
    return { ok: true, isPlatform: true };
  }

  // Sales / marketing apex root (houzzatpro.com / www.houzzatpro.com)
  if (hostname && isHouzzatProPlatformRoot(hostname)) {
    return { ok: true, isPlatform: true };
  }

  // On any tenant host (e.g. houzzat.com, tenant-canary.houzzatpro.com, custom domains):
  let resolvedWorkspaceId: string | null = null;

  if (input.request) {
    const tenancy = await resolveRequestTenancy(input.request, input.deps);
    if (!tenancy.ok) {
      return { ok: false, reason: "unknown_tenant_workspace" };
    }
    resolvedWorkspaceId = tenancy.workspaceId;
  } else if (hostname) {
    const resolved = await resolveWorkspaceFromHostname(
      hostname,
      input.deps,
    );
    if (!resolved.ok) {
      return { ok: false, reason: "unknown_tenant_workspace" };
    }
    resolvedWorkspaceId = resolved.workspaceId;
  } else {
    // If hostname cannot be determined on credentials authorize, resolve fallback or fail closed.
    return { ok: false, reason: "unknown_tenant_workspace" };
  }

  if (!resolvedWorkspaceId) {
    return { ok: false, reason: "unknown_tenant_workspace" };
  }

  // Check for an ACTIVE WorkspaceMember row for the exact resolved workspace.
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: input.userId,
      workspaceId: resolvedWorkspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (membership) {
    return {
      ok: true,
      isPlatform: false,
      workspaceId: resolvedWorkspaceId,
      workspaceRole: membership.role,
    };
  }

  // If no staff WorkspaceMember exists, verify if the user is a consumer (BUYER / SELLER).
  // Consumers are authorized to sign in on active tenant websites.
  let role = input.userRole;
  if (role === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    role = user?.role ?? null;
  }

  if (isConsumerRole(role)) {
    return {
      ok: true,
      isPlatform: false,
      workspaceId: resolvedWorkspaceId,
    };
  }

  return { ok: false, reason: "no_active_membership" };
}

/**
 * Authoritative workspace access check for protected routes / tenant APIs.
 * Requires request hostname -> active Workspace -> ACTIVE WorkspaceMember.
 * Does NOT rely on User.role or cookie workspace alone.
 */
export async function requireTenantWorkspaceAccess(input: {
  userId: string;
  request: Request;
  requiredRole?: "STAFF" | "OWNER_ADMIN";
  deps?: RequestTenancyDeps;
}): Promise<{
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceMemberRole;
  canManageWorkspace: boolean;
  userId: string;
} | null> {
  if (!input.userId) return null;

  const tenancy = await resolveRequestTenancy(input.request, input.deps);
  if (!tenancy.ok) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: input.userId,
      workspaceId: tenancy.workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });

  if (!membership) return null;

  const isOwnerAdmin =
    membership.role === "OWNER" || membership.role === "ADMIN";

  if (input.requiredRole === "OWNER_ADMIN" && !isOwnerAdmin) {
    return null;
  }

  return {
    workspaceId: tenancy.workspaceId,
    workspaceSlug: tenancy.workspaceSlug,
    workspaceRole: membership.role,
    canManageWorkspace: isOwnerAdmin,
    userId: input.userId,
  };
}

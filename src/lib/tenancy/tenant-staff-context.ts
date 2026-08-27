/**
 * Stage 3K.5.8G — hostname-authoritative tenant staff CRM context.
 *
 * Authority: request hostname → workspaceId → ACTIVE WorkspaceMember.
 * Cookie and OrganizationMembership never override tenant hostname.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveRequestTenancy,
  type RequestTenancyDeps,
  type RequestTenancySuccess,
} from "@/lib/tenancy/resolve-request-tenancy";
import type { RequestWorkspaceAuthDenyReason } from "@/lib/tenancy/request-workspace-auth";
import { RequestWorkspaceAuthError } from "@/lib/tenancy/request-workspace-auth";
import { isActiveHostnameBoundReadMode } from "@/lib/crm-read-scope";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";

/**
 * Hostname-bound staff CRM only when BOTH domain + read scopes are workspace.
 * Partial dashboard flips (READ without DOMAIN) must keep legacy Houzzat behavior.
 */
export function shouldUseHostnameBoundStaffContext(): boolean {
  return isActiveHostnameBoundReadMode();
}

export type TenantStaffContext = RequestTenancySuccess & {
  userId: string;
  workspaceRole: WorkspaceMemberRole;
  canManageWorkspace: boolean;
  canSeeTeamLeads: boolean;
  /** False on tenant hosts — global platform admin is not implied by User.role. */
  isPlatformAdmin: false;
  /** True when hostname resolved to a verified tenant workspace (not legacy Houzzat fallback). */
  isHostnameBoundTenant: boolean;
};

/**
 * Whether /admin global platform queries may run on this host.
 * ONLY HouzzatPRO platform root — never Houzzat tenant hosts.
 */
export function isPlatformAdminSurfaceHostname(hostname: string): boolean {
  return isHouzzatProPlatformRoot(hostname);
}

/**
 * Hostname eligible for hostname-bound tenant CRM / Command Centre.
 * Platform root is never tenant-bound. All other hosts fail closed via
 * resolveRequestTenancy (unknown hosts deny).
 */
export function isTenantHostnameBoundCrmHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (isHouzzatProPlatformRoot(host)) return false;
  if (!isTenantDomainScopeWorkspace()) return false;
  // Platform tenant subdomains (*.houzzatpro.com) and verified custom domains
  // (e.g. houzzat.com) are candidate tenant hosts; membership proves access.
  return true;
}

export function shouldEnforceTenantHostnameCrmIsolation(
  hostname: string | null | undefined,
): boolean {
  if (!isTenantDomainScopeWorkspace()) return false;
  if (!hostname) return false;
  return isTenantHostnameBoundCrmHost(hostname);
}

/**
 * Resolve tenant staff access from request hostname — membership required, no ADMIN bypass.
 */
export async function resolveTenantStaffContext(
  request: Request,
  user: { id: string; role: string },
  deps?: RequestTenancyDeps,
): Promise<TenantStaffContext | null> {
  const tenancy = await resolveRequestTenancy(request, deps);
  if (!tenancy.ok) return null;

  if (!isTenantHostnameBoundCrmHost(tenancy.hostname)) {
    return null;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: tenancy.workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });

  if (!member) return null;

  const canSeeTeamLeads =
    member.role === "OWNER" || member.role === "ADMIN";

  return {
    ...tenancy,
    userId: user.id,
    workspaceRole: member.role,
    canManageWorkspace: canSeeTeamLeads,
    canSeeTeamLeads,
    isPlatformAdmin: false,
    isHostnameBoundTenant: true,
  };
}

/** Non-throwing hostname-bound tenant staff resolver. */
export async function tryTenantStaffContext(
  request: Request,
  user: { id: string; role: string },
  deps?: RequestTenancyDeps,
): Promise<TenantStaffContext | null> {
  return resolveTenantStaffContext(request, user, deps);
}

export async function requireTenantStaffContext(
  request: Request,
  user: { id: string; role: string },
  deps?: RequestTenancyDeps,
): Promise<TenantStaffContext> {
  if (!user.id) {
    throw new RequestWorkspaceAuthError("unauthenticated");
  }

  const tenancy = await resolveRequestTenancy(request, deps);
  if (!tenancy.ok) {
    throw new RequestWorkspaceAuthError(
      tenancy.reason as RequestWorkspaceAuthDenyReason,
    );
  }

  if (!isTenantHostnameBoundCrmHost(tenancy.hostname)) {
    throw new RequestWorkspaceAuthError(
      "platform_surface",
      "Tenant CRM requires a verified tenant hostname",
    );
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: tenancy.workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });

  if (!member) {
    throw new RequestWorkspaceAuthError(
      "workspace_membership_required",
      "User is not an ACTIVE member of the request workspace",
    );
  }

  const canSeeTeamLeads =
    member.role === "OWNER" || member.role === "ADMIN";

  return {
    ...tenancy,
    userId: user.id,
    workspaceRole: member.role,
    canManageWorkspace: canSeeTeamLeads,
    canSeeTeamLeads,
    isPlatformAdmin: false,
    isHostnameBoundTenant: true,
  };
}

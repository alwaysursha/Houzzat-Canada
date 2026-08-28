/**
 * Stage 3K.5.9 — Tenant Command Centre authorization.
 *
 * Platform /admin (global) and tenant Command Centre are different security
 * boundaries. Hostname is the tenancy authority; User.role=ADMIN never bypasses
 * tenant membership. OrganizationMembership is never used as read authority.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import {
  isPlatformAdminSurfaceHostname,
  isTenantHostnameBoundCrmHost,
  tryTenantStaffContext,
  type TenantStaffContext,
} from "@/lib/tenancy/tenant-staff-context";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { executeTenantAuthorityShadow } from "@/lib/tenancy/tenant-authority-shadow";

export type AdminSurfaceMode = "platform" | "tenant" | "deny";

export type TenantCommandCentreAuth = TenantStaffContext & {
  surface: "tenant";
  canAccessTenantCommandCentre: true;
};

const TENANT_COMMAND_CENTRE_ROLES: ReadonlySet<WorkspaceMemberRole> = new Set([
  "OWNER",
  "ADMIN",
]);

/** Paths allowed under /admin on tenant hosts (everything else → /admin). */
export const TENANT_COMMAND_CENTRE_PATH_ALLOWLIST = [
  "/admin",
  "/admin/mls",
  "/admin/lead-routing",
  "/admin/people",
  "/admin/analytics",
  "/admin/notifications",
  "/admin/search",
] as const;

/**
 * Modules intentionally blocked until workspace ownership is modeled:
 * landings, ads, partners, fsbo, pre-construction, visitors, settings.
 */
export const TENANT_COMMAND_CENTRE_BLOCKED_MODULES = [
  "landings",
  "ads",
  "partners",
  "fsbo",
  "pre-construction",
  "visitors",
  "settings",
] as const;

export function isTenantCommandCentrePathAllowed(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return (TENANT_COMMAND_CENTRE_PATH_ALLOWLIST as readonly string[]).some(
    (allowed) => path === allowed,
  );
}

/**
 * Sync hostname classification for middleware (no DB).
 * Custom domains fall through to layout fail-closed.
 */
export function isLikelyTenantCommandCentreHost(hostname: string): boolean {
  return isTenantHostnameBoundCrmHost(hostname);
}

export function resolveAdminSurfaceMode(
  hostname: string | null | undefined,
): AdminSurfaceMode {
  if (!hostname) {
    return isTenantDomainScopeWorkspace() ? "deny" : "platform";
  }
  if (isPlatformAdminSurfaceHostname(hostname)) return "platform";
  if (isTenantHostnameBoundCrmHost(hostname)) return "tenant";
  return isTenantDomainScopeWorkspace() ? "deny" : "platform";
}

export function canAccessTenantCommandCentreRole(
  role: WorkspaceMemberRole,
): boolean {
  return TENANT_COMMAND_CENTRE_ROLES.has(role);
}

/**
 * Authorize tenant Command Centre: ACTIVE WorkspaceMember OWNER/ADMIN on
 * hostname workspace. User.role is ignored for privilege (no ADMIN bypass).
 */
export async function authorizeTenantCommandCentre(
  request: Request,
  user: { id: string; role: string },
): Promise<TenantCommandCentreAuth | null> {
  if (!user.id) return null;

  const hostname = extractTrustedRequestHostname(request);
  if (resolveAdminSurfaceMode(hostname) !== "tenant") return null;

  const ctx = await tryTenantStaffContext(request, user);
  if (!ctx) {
    await executeTenantAuthorityShadow({
      location: "authorizeTenantCommandCentre",
      request,
      user,
      currentDecision: { allowed: false, hostname },
    });
    return null;
  }
  if (!canAccessTenantCommandCentreRole(ctx.workspaceRole)) {
    await executeTenantAuthorityShadow({
      location: "authorizeTenantCommandCentre",
      request,
      user,
      currentDecision: {
        allowed: false,
        workspaceId: ctx.workspaceId,
        workspaceRole: ctx.workspaceRole,
        hostname,
      },
    });
    return null;
  }

  await executeTenantAuthorityShadow({
    location: "authorizeTenantCommandCentre",
    request,
    user,
    currentDecision: {
      allowed: true,
      workspaceId: ctx.workspaceId,
      workspaceRole: ctx.workspaceRole,
      hostname,
    },
  });

  return {
    ...ctx,
    surface: "tenant",
    canAccessTenantCommandCentre: true,
  };
}

/** Predicate helpers for selftests / loaders — workspaceId equality only. */
export function tenantCommandCentreLeadWhere(workspaceId: string) {
  return { workspaceId };
}

export function tenantCommandCentreTaskWhere(workspaceId: string) {
  return { workspaceId };
}

export function tenantCommandCentreAppointmentWhere(workspaceId: string) {
  return { lead: { workspaceId } };
}

export function tenantCommandCentreMemberWhere(workspaceId: string) {
  return { workspaceId, status: "ACTIVE" as const };
}

export function recordBelongsToTenantCommandCentreWorkspace(
  recordWorkspaceId: string | null | undefined,
  commandCentreWorkspaceId: string,
): boolean {
  return (
    typeof recordWorkspaceId === "string" &&
    recordWorkspaceId.length > 0 &&
    recordWorkspaceId === commandCentreWorkspaceId
  );
}

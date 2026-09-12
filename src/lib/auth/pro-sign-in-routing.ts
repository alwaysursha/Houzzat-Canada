/**
 * HouzzatPro sign-in destination + callback helpers (pure / shared).
 * Server role remains authoritative — shell is UX only.
 */

import type {
  PlatformOperatorRole,
  PlatformOperatorStatus,
  WorkspaceMemberRole,
} from "@prisma/client";
import {
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
} from "@/lib/mobile/app-shell";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { isStaffWorkspaceMemberRole } from "@/lib/mobile/workspace-destination";
import { isAdminRole, isAgentRole, isStaffRole } from "@/lib/roles";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";

/** Reject open redirects; keep internal app paths only. */
export function sanitizeStaffCallbackPath(
  callbackUrl: string | null | undefined,
  fallback = HOUZZATPRO_START_PATH,
): string {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//") ||
    callbackUrl.includes("://")
  ) {
    return fallback;
  }
  if (
    callbackUrl.startsWith("/auth") ||
    callbackUrl.startsWith("/pro/sign-in")
  ) {
    return fallback;
  }
  return callbackUrl;
}

/**
 * Master Admin Command Centre callback. Same-origin /platform only.
 * Page still requires an ACTIVE MASTER_ADMIN PlatformOperator — this is
 * routing, not authorization.
 */
export function isPlatformOperatorCallbackPath(
  callbackUrl: string | null | undefined,
): boolean {
  const relative = relativeCallbackPathForVercelTestOrApp(callbackUrl);
  if (!relative) return false;
  const pathname = relative.split("?")[0] ?? "";
  return pathname === "/platform" || pathname.startsWith("/platform/");
}

/**
 * Relative callback path. Absolute URLs are accepted only for the exact
 * houzzat-vercel-test.vercel.app origin (never *.vercel.app).
 */
export function relativeCallbackPathForVercelTestOrApp(
  callbackUrl: string | null | undefined,
): string | null {
  if (!callbackUrl) return null;
  const trimmed = callbackUrl.trim();
  if (isSafeRelativeAppPath(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    if (!isHouzzatVercelTestHost(url.hostname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * After credentials on houzzat-vercel-test.vercel.app: stay on this origin.
 * Never mint tenant handoff to Cloudflare / app.houzzatpro.com.
 */
export function resolveVercelTestPostCredentialsHref(input: {
  hostname: string | null | undefined;
  callbackUrl?: string | null;
  returnPath?: string | null;
}): string | null {
  if (!isHouzzatVercelTestHost(input.hostname)) return null;
  if (isPlatformOperatorCallbackPath(input.callbackUrl)) {
    return sanitizeStaffCallbackPath(
      relativeCallbackPathForVercelTestOrApp(input.callbackUrl),
      "/platform",
    );
  }
  if (shouldStayOnVercelTestOnboarding(input)) {
    return "/onboarding";
  }
  const relative = relativeCallbackPathForVercelTestOrApp(input.callbackUrl);
  if (relative) {
    const pathname = (relative.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
    // /pro is a Capacitor bootstrap surface — blank on this host.
    if (pathname !== "/pro") {
      return sanitizeStaffCallbackPath(relative);
    }
  }
  return null;
}

/**
 * Plain /pro/sign-in on the Vercel test host (no staff callback).
 * This-host staff (tenant_destination) → /admin or /agent.
 * ACTIVE MASTER_ADMIN without this-host membership → /platform.
 * Never /pro, never Cloudflare handoff.
 */
export function resolveVercelTestPlainLoginHref(input: {
  kind?: string | null;
  destination?: string | null;
  membership?: { role?: string | null } | null;
  memberships?: Array<{ role?: string | null }> | null;
} | null): string {
  const kind = input?.kind ?? "";
  const dest = input?.destination ?? null;
  if (
    kind === "tenant_destination" &&
    (dest === "/admin" ||
      dest === "/agent" ||
      dest === "/onboarding" ||
      dest === "/pro/for-staff")
  ) {
    return dest;
  }

  return "/platform";
}

/** Physical Vercel R2 upload test host. Exact hostname only — never `*.vercel.app`. */
export const HOUZZAT_VERCEL_TEST_HOSTNAME = "houzzat-vercel-test.vercel.app";

export function isHouzzatVercelTestHost(
  hostname: string | null | undefined,
): boolean {
  if (!hostname) return false;
  return hostname.trim().toLowerCase() === HOUZZAT_VERCEL_TEST_HOSTNAME;
}

/**
 * Vercel-test credentials only: ACTIVE MASTER_ADMIN may create a session
 * on houzzat-vercel-test.vercel.app without hostname WorkspaceMember.
 * Does not grant /admin, /agent, or CRM. /platform still uses
 * requirePlatformOperator. Production hosts unchanged.
 */
export function isVercelTestMasterAdminCredentialsException(input: {
  hostname: string | null | undefined;
  operator:
    | {
        role: PlatformOperatorRole;
        status: PlatformOperatorStatus;
      }
    | null
    | undefined;
}): boolean {
  if (!isHouzzatVercelTestHost(input.hostname)) return false;
  const operator = input.operator;
  if (!operator) return false;

  switch (operator.status) {
    case "DISABLED":
      return false;
    case "ACTIVE":
      break;
    default: {
      const _exhaustive: never = operator.status;
      return _exhaustive;
    }
  }

  switch (operator.role) {
    case "MASTER_ADMIN":
      return true;
    case "SALES":
    case "BILLING":
      return false;
    default: {
      const _exhaustive: never = operator.role;
      return _exhaustive;
    }
  }
}

function isSafeRelativeAppPath(
  raw: string | null | undefined,
): raw is string {
  return (
    !!raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("://")
  );
}

/** Same-origin OWNER onboarding callback. `/onboarding` only — not nested paths. */
export function isOwnerOnboardingCallbackPath(
  callbackUrl: string | null | undefined,
): boolean {
  if (!isSafeRelativeAppPath(callbackUrl)) return false;
  const pathname = (callbackUrl.split("?")[0] ?? "").replace(/\/+$/, "");
  return pathname === "/onboarding";
}

/**
 * Vercel-test-only: stay on houzzat-vercel-test.vercel.app/onboarding.
 * Production HouzzatPRO hosts still bootstrap/handoff to canonical tenant.
 */
export function shouldStayOnVercelTestOnboarding(input: {
  hostname: string | null | undefined;
  callbackUrl?: string | null;
  returnPath?: string | null;
}): boolean {
  if (!isHouzzatVercelTestHost(input.hostname)) return false;
  return (
    isOwnerOnboardingCallbackPath(input.callbackUrl) ||
    isOwnerOnboardingCallbackPath(input.returnPath)
  );
}

/**
 * Edge-safe: do not bounce /admin|/agent using User.role when the host is a
 * tenant CRM hostname (TENANT_DOMAIN_SCOPE=workspace, not platform root /
 * app bootstrap) or the exact Vercel test host. Layouts still require
 * ACTIVE hostname-bound WorkspaceMember (OWNER / ADMIN / AGENT).
 * User.role is not tenant authority.
 */
export function shouldDeferStaffWebRoleToHostnameMembership(
  hostname: string | null | undefined,
): boolean {
  if (isHouzzatVercelTestHost(hostname)) return true;
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  if (!host) return false;
  if (host === "houzzatpro.com" || host === "www.houzzatpro.com") return false;
  if (isPlatformMobileBootstrapHost(host)) return false;
  return isTenantDomainScopeWorkspace();
}

function workspaceRoleGrantsTenantStaffWeb(
  workspaceRole: WorkspaceMemberRole | null | undefined,
): boolean {
  if (!workspaceRole) return false;
  return isStaffWorkspaceMemberRole(workspaceRole);
}

function workspaceRoleGrantsTenantCommandCentre(
  workspaceRole: WorkspaceMemberRole | null | undefined,
): boolean {
  if (!workspaceRole) return false;
  switch (workspaceRole) {
    case "OWNER":
    case "ADMIN":
      return true;
    case "AGENT":
      return false;
    default: {
      const _exhaustive: never = workspaceRole;
      return _exhaustive;
    }
  }
}

/**
 * After Pro credentials sign-in: honor deep staff callbacks when User.role
 * or hostname-bound WorkspaceMember role permits; never send AGENT into
 * Admin; consumer without tenant staff membership → staff-only screen.
 */
export function resolveProPostSignInHref(
  callbackUrl: string | null | undefined,
  role?: string | null,
  workspaceRole?: WorkspaceMemberRole | null,
): string {
  const target = sanitizeStaffCallbackPath(callbackUrl);
  const staffByMembership = workspaceRoleGrantsTenantStaffWeb(workspaceRole);
  const canCommandCentre =
    isAdminRole(role) || workspaceRoleGrantsTenantCommandCentre(workspaceRole);
  const canAgentDesk = isAgentRole(role) || staffByMembership;

  if (!isStaffRole(role) && !staffByMembership) {
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (target.startsWith("/admin")) {
    if (canCommandCentre) return target;
    return "/agent";
  }

  if (target.startsWith("/agent")) {
    if (canAgentDesk) return target;
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (target === HOUZZATPRO_START_PATH || target.startsWith("/pro")) {
    if (canCommandCentre) return "/admin";
    if (role === "AGENT" || workspaceRole === "AGENT") return "/agent";
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (canCommandCentre) return "/admin";
  if (role === "AGENT" || workspaceRole === "AGENT") return "/agent";
  return HOUZZATPRO_STAFF_ONLY_PATH;
}

export function staffSignInHref(
  shell: "houzzatpro" | "web" | string,
  callbackUrl: string,
): string {
  const safe = sanitizeStaffCallbackPath(
    callbackUrl,
    callbackUrl.startsWith("/admin") ? "/admin" : "/agent",
  );
  const path = shell === "houzzatpro" ? "/pro/sign-in" : "/auth/sign-in";
  return `${path}?callbackUrl=${encodeURIComponent(safe)}`;
}

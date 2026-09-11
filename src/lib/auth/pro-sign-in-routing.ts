/**
 * HouzzatPro sign-in destination + callback helpers (pure / shared).
 * Server role remains authoritative — shell is UX only.
 */

import type {
  PlatformOperatorRole,
  PlatformOperatorStatus,
} from "@prisma/client";
import {
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
} from "@/lib/mobile/app-shell";
import { isAdminRole, isAgentRole, isStaffRole } from "@/lib/roles";

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
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//") ||
    callbackUrl.includes("://")
  ) {
    return false;
  }
  const pathname = callbackUrl.split("?")[0] ?? "";
  return pathname === "/platform" || pathname.startsWith("/platform/");
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
 * Edge-safe: on houzzat-vercel-test.vercel.app, do not bounce /admin|/agent
 * using User.role. Layouts still require ACTIVE WorkspaceMember on the
 * hostname workspace (OWNER / ADMIN / AGENT). Production hosts unchanged.
 */
export function shouldDeferStaffWebRoleToHostnameMembership(
  hostname: string | null | undefined,
): boolean {
  return isHouzzatVercelTestHost(hostname);
}

/**
 * After Pro credentials sign-in: honor deep staff callbacks when the role
 * permits; never send AGENT into Admin; BUYER → staff-only screen.
 */
export function resolveProPostSignInHref(
  callbackUrl: string | null | undefined,
  role?: string | null,
): string {
  const target = sanitizeStaffCallbackPath(callbackUrl);

  if (!isStaffRole(role)) {
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (target.startsWith("/admin")) {
    if (isAdminRole(role)) return target;
    return "/agent";
  }

  if (target.startsWith("/agent")) {
    if (isAgentRole(role)) return target;
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (target === HOUZZATPRO_START_PATH || target.startsWith("/pro")) {
    if (isAdminRole(role)) return "/admin";
    if (role === "AGENT") return "/agent";
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }

  if (isAdminRole(role)) return "/admin";
  if (role === "AGENT") return "/agent";
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

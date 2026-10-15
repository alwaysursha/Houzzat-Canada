/** Stage 3K.5.10 — tenant mobile destination from WorkspaceMember role. */
import type { WorkspaceMemberRole } from "@prisma/client";
import {
  HOUZZATPRO_PRIVATE_UI_UA_MARKER,
  prefersProFullCrmExperience,
} from "@/lib/mobile/app-shell";

/** Allowlisted owner onboarding post-handoff path (Stage 6.10C.3). */
export const MOBILE_HANDOFF_ONBOARDING_PATH = "/onboarding" as const;

/**
 * Agent Launchpad (`AgentLaunchpadPage` + Quick Modules) — default cold-start
 * landing for FullCRM Pro shells (Private sideload + production FullCRM
 * candidate). Legacy InstantShell Play builds and mobile Chrome unchanged.
 */
export const PRIVATE_PRO_DEFAULT_LANDING_PATH = "/agent" as const;

export type MobileStaffPathDestination =
  | "/admin"
  | "/agent"
  | "/pro/for-staff"
  | typeof MOBILE_HANDOFF_ONBOARDING_PATH;

export function isHouzzatProPrivateUiUserAgent(
  userAgent: string | null | undefined,
): boolean {
  return Boolean(userAgent?.includes(HOUZZATPRO_PRIVATE_UI_UA_MARKER));
}

/**
 * Remap role CRM defaults for FullCRM Pro shells (Private UI or production
 * FullCRM marker). OWNER/ADMIN role default `/admin` → Launchpad `/agent`.
 * AGENT already lands on `/agent`. Preserves onboarding, deep agent/admin
 * paths, and any non-default destination (push / pending intent / explicit
 * return). Legacy Play PRO without FullCRM marker stays on `/admin`.
 */
export function resolveHouzzatProPrivateStartupDestination(
  destination: string,
  userAgent?: string | null,
): string {
  if (!prefersProFullCrmExperience(userAgent)) return destination;
  if (destination === "/admin") {
    return PRIVATE_PRO_DEFAULT_LANDING_PATH;
  }
  return destination;
}

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
): path is "/admin" | "/agent" | typeof MOBILE_HANDOFF_ONBOARDING_PATH {
  return (
    path === "/admin" ||
    path === "/agent" ||
    path === MOBILE_HANDOFF_ONBOARDING_PATH
  );
}

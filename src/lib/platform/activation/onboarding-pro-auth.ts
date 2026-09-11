/**
 * Stage 6.10C.3 — OWNER onboarding → platform Pro sign-in + handoff return.
 * Tenant authority remains hostname → WorkspaceDomain → membership.
 * workspaceHint is never authoritative.
 *
 * Client-safe: must not import next/headers or other server-only modules
 * (used from HouzzatProSignInScreen / ProWorkspaceBootstrap).
 */

import {
  HOUZZATPRO_APP_BOOTSTRAP_ORIGIN,
} from "@/lib/mobile/platform-bootstrap";
import {
  MOBILE_HANDOFF_ONBOARDING_PATH,
  resolveWorkspaceMemberMobileDestination,
  type MobileStaffPathDestination,
} from "@/lib/mobile/workspace-destination";
import type { WorkspaceMemberRole } from "@prisma/client";

/** Only safe relative tenant path carried through handoff for onboarding. */
export const OWNER_ONBOARDING_RETURN_PATH = MOBILE_HANDOFF_ONBOARDING_PATH;

export const OWNER_ONBOARDING_AUTH_QUERY = {
  returnPath: "returnPath",
  workspaceHint: "workspaceHint",
} as const;

/** Allowlisted post-handoff paths beyond role CRM defaults. */
const ALLOWED_OWNER_RETURN_PATHS = new Set<string>([
  OWNER_ONBOARDING_RETURN_PATH,
]);

/** Same shape as `isValidWorkspaceIdShape` — kept local to stay client-bundle safe. */
const WORKSPACE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function isWorkspaceHintIdShape(workspaceId: string): boolean {
  return WORKSPACE_ID_RE.test(workspaceId);
}

/**
 * Sanitize a client/query return path for tenant handoff.
 * Rejects absolute, protocol-relative, external, and encoded bypass attempts.
 */
export function sanitizeOwnerOnboardingReturnPath(
  raw: string | null | undefined,
): typeof OWNER_ONBOARDING_RETURN_PATH | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  if (trimmed.includes("\\")) return null;
  if (trimmed.includes("@")) return null;
  // Reject path traversal / nested tricks
  if (trimmed.includes("..")) return null;
  // No query/hash on return path (avoid open-redirect carriers)
  if (trimmed.includes("?") || trimmed.includes("#")) return null;
  // Normalize: strip trailing slash except root (not allowed anyway)
  const normalized =
    trimmed.length > 1 && trimmed.endsWith("/")
      ? trimmed.slice(0, -1)
      : trimmed;
  if (!ALLOWED_OWNER_RETURN_PATHS.has(normalized)) return null;
  return OWNER_ONBOARDING_RETURN_PATH;
}

/** Non-authoritative workspace id hint from query — shape check only. */
export function sanitizeWorkspaceHintId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!isWorkspaceHintIdShape(trimmed)) return null;
  return trimmed;
}

export function buildOwnerOnboardingProSignInUrl(input: {
  workspaceId: string;
  returnPath?: string | null;
}): string {
  const returnPath =
    sanitizeOwnerOnboardingReturnPath(input.returnPath) ??
    OWNER_ONBOARDING_RETURN_PATH;
  const hint = sanitizeWorkspaceHintId(input.workspaceId);
  const url = new URL(`${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/pro/sign-in`);
  url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.returnPath, returnPath);
  if (hint) {
    url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint, hint);
  }
  return url.toString();
}

/**
 * Same-origin Pro sign-in for houzzat-vercel-test.vercel.app only.
 * Production continues to use buildOwnerOnboardingProSignInUrl (app.houzzatpro.com).
 */
export function buildHouzzatVercelTestOnboardingSignInUrl(input: {
  workspaceId: string;
  returnPath?: string | null;
}): string {
  const returnPath =
    sanitizeOwnerOnboardingReturnPath(input.returnPath) ??
    OWNER_ONBOARDING_RETURN_PATH;
  const hint = sanitizeWorkspaceHintId(input.workspaceId);
  const url = new URL("/pro/sign-in", "https://houzzat.invalid");
  url.searchParams.set("callbackUrl", OWNER_ONBOARDING_RETURN_PATH);
  url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.returnPath, returnPath);
  if (hint) {
    url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint, hint);
  }
  return `${url.pathname}${url.search}`;
}

export function parseOwnerOnboardingAuthSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): {
  returnPath: typeof OWNER_ONBOARDING_RETURN_PATH | null;
  workspaceHint: string | null;
} {
  return {
    returnPath: sanitizeOwnerOnboardingReturnPath(
      params.get(OWNER_ONBOARDING_AUTH_QUERY.returnPath),
    ),
    workspaceHint: sanitizeWorkspaceHintId(
      params.get(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint),
    ),
  };
}

/**
 * Resolve post-handoff destination: allowlisted return path, else role CRM path.
 */
export function resolveHandoffDestinationWithReturnPath(input: {
  workspaceRole: WorkspaceMemberRole;
  returnPath?: string | null;
}): MobileStaffPathDestination {
  const safe = sanitizeOwnerOnboardingReturnPath(input.returnPath);
  if (safe) return safe;
  return resolveWorkspaceMemberMobileDestination(input.workspaceRole);
}

/** Prefer validated membership matching non-authoritative hint. */
export function selectMembershipForWorkspaceHint<
  T extends { workspaceId: string },
>(memberships: T[], workspaceHint: string | null | undefined): T | null {
  const hint = sanitizeWorkspaceHintId(workspaceHint);
  if (!hint) return null;
  return memberships.find((m) => m.workspaceId === hint) ?? null;
}

/** Append Pro bootstrap query so return metadata survives /pro navigation. */
export function appendOwnerOnboardingAuthQuery(
  path: string,
  meta: {
    returnPath?: string | null;
    workspaceHint?: string | null;
  },
): string {
  const returnPath = sanitizeOwnerOnboardingReturnPath(meta.returnPath);
  const hint = sanitizeWorkspaceHintId(meta.workspaceHint);
  if (!returnPath && !hint) return path;
  const url = new URL(path, "https://houzzat.invalid");
  if (returnPath) {
    url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.returnPath, returnPath);
  }
  if (hint) {
    url.searchParams.set(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint, hint);
  }
  return `${url.pathname}${url.search}`;
}

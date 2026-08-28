/**
 * Stage 3K.5.18 — Non-Blocking Tenant Authority Shadow Comparison & Diagnostic Logging.
 *
 * Compares current runtime staff authorization decision with canonical
 * resolveTenantAuthority() result without altering runtime flow.
 *
 * Privacy / Safety:
 * NEVER logs emails, passwords, tokens, cookies, handoff codes, or PII.
 * Uses masked IDs for diagnostics.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import {
  resolveTenantAuthority,
  type TenantAuthorityResult,
  type TenantAuthorityFailureReason,
  type TenantAuthorityDeps,
} from "@/lib/tenancy/tenant-authority";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";

export type TenantAuthorityMismatchType =
  | "NO_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "ROLE_MISMATCH"
  | "CURRENT_ALLOW_NEW_DENY"
  | "CURRENT_DENY_NEW_ALLOW"
  | "HOST_RESOLUTION_MISMATCH";

export type TenantAuthorityShadowPayload = {
  event: "tenant_authority_shadow";
  location: string;
  host: string | null;
  userIdMasked: string | null;
  currentAllowed: boolean;
  newAllowed: boolean;
  currentWorkspaceIdMasked: string | null;
  newWorkspaceIdMasked: string | null;
  currentRole: WorkspaceMemberRole | string | null;
  newRole: WorkspaceMemberRole | null;
  newFailureReason: TenantAuthorityFailureReason | null;
  mismatchType: TenantAuthorityMismatchType;
};

export type CurrentAuthDecision = {
  allowed: boolean;
  workspaceId?: string | null;
  workspaceRole?: WorkspaceMemberRole | string | null;
  userId?: string | null;
  hostname?: string | null;
};

export function maskIdentifier(id: string | null | undefined): string | null {
  if (!id) return null;
  const str = id.trim();
  if (str.length <= 8) return `***${str.slice(-3)}`;
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

export function classifyAuthorityMismatch(
  current: CurrentAuthDecision,
  newAuth: TenantAuthorityResult,
): TenantAuthorityMismatchType {
  const currentAllowed = current.allowed;
  const newAllowed = newAuth.ok;

  if (currentAllowed && !newAllowed) {
    return "CURRENT_ALLOW_NEW_DENY";
  }

  if (!currentAllowed && newAllowed) {
    return "CURRENT_DENY_NEW_ALLOW";
  }

  if (currentAllowed && newAllowed) {
    if (
      current.workspaceId &&
      newAuth.workspaceId &&
      current.workspaceId !== newAuth.workspaceId
    ) {
      return "WORKSPACE_MISMATCH";
    }

    if (
      current.workspaceRole &&
      newAuth.workspaceRole &&
      current.workspaceRole !== newAuth.workspaceRole
    ) {
      return "ROLE_MISMATCH";
    }
  }

  return "NO_MISMATCH";
}

export type TenantAuthorityShadowDeps = TenantAuthorityDeps;

/**
 * Executes a non-blocking shadow comparison between current live authority
 * and resolveTenantAuthority().
 *
 * Guarantees:
 * 1. Catches and suppresses any internal errors (never throws to caller).
 * 2. Does NOT modify the current decision.
 * 3. Safe masked logging of mismatches.
 */
export async function executeTenantAuthorityShadow(input: {
  location: string;
  request: Request | string;
  user: { id?: string | null } | null;
  currentDecision: CurrentAuthDecision;
  deps?: TenantAuthorityShadowDeps;
  onLog?: (payload: TenantAuthorityShadowPayload) => void;
}): Promise<TenantAuthorityShadowPayload | null> {
  try {
    const rawHostname =
      typeof input.request === "string"
        ? (input.request.startsWith("http://") ||
          input.request.startsWith("https://")
            ? new URL(input.request).hostname
            : input.request)
        : extractTrustedRequestHostname(input.request);

    const newAuth = await resolveTenantAuthority(
      input.request,
      input.user,
      input.deps,
    );
    const mismatchType = classifyAuthorityMismatch(
      input.currentDecision,
      newAuth,
    );

    const payload: TenantAuthorityShadowPayload = {
      event: "tenant_authority_shadow",
      location: input.location,
      host: rawHostname ?? null,
      userIdMasked: maskIdentifier(input.user?.id),
      currentAllowed: input.currentDecision.allowed,
      newAllowed: newAuth.ok,
      currentWorkspaceIdMasked: maskIdentifier(
        input.currentDecision.workspaceId,
      ),
      newWorkspaceIdMasked: maskIdentifier(
        newAuth.ok ? newAuth.workspaceId : newAuth.workspaceId ?? null,
      ),
      currentRole: input.currentDecision.workspaceRole ?? null,
      newRole: newAuth.ok ? newAuth.workspaceRole : null,
      newFailureReason: newAuth.ok ? null : newAuth.reason,
      mismatchType,
    };

    if (input.onLog) {
      input.onLog(payload);
    } else if (mismatchType !== "NO_MISMATCH") {
      // Non-blocking diagnostic log only for observed mismatches
      console.info("[tenant_authority_shadow_mismatch]", JSON.stringify(payload));
    }

    return payload;
  } catch (err) {
    // Non-blocking: never interrupt runtime flow
    return null;
  }
}

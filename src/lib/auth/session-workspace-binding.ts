/**
 * Phase 3 JWT/session workspace binding.
 * Tenant tokens must carry workspaceId and match hostname workspace.
 */
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { resolveWorkspaceFromHostname } from "@/lib/tenancy/resolve-workspace-host";

export type SessionWorkspaceBinding =
  | { ok: true; isPlatform: true; workspaceId: null }
  | { ok: true; isPlatform: false; workspaceId: string }
  | { ok: false; reason: "unknown_tenant" | "workspace_mismatch" | "missing_token_workspace" };

export async function resolveHostnameWorkspaceForAuth(
  request: Request | null | undefined,
): Promise<
  | { ok: true; isPlatform: true; workspaceId: null }
  | { ok: true; isPlatform: false; workspaceId: string }
  | { ok: false }
> {
  if (!request) return { ok: false };
  const hostname = extractTrustedRequestHostname(request);
  if (isPlatformMobileBootstrapHost(hostname) || (hostname && isHouzzatProPlatformRoot(hostname))) {
    return { ok: true, isPlatform: true, workspaceId: null };
  }
  const tenancy = await resolveRequestTenancy(request);
  if (tenancy.ok) {
    return { ok: true, isPlatform: false, workspaceId: tenancy.workspaceId };
  }
  if (hostname) {
    const resolved = await resolveWorkspaceFromHostname(hostname);
    if (resolved.ok) {
      return { ok: true, isPlatform: false, workspaceId: resolved.workspaceId };
    }
  }
  return { ok: false };
}

/**
 * Reject tenant sessions whose JWT workspaceId does not match hostname workspace.
 * Platform sessions must not silently authorize tenant hosts.
 *
 * Legacy JWTs without workspaceId fail with `missing_token_workspace` on tenant
 * hosts. Callers may upgrade in-place only when DB User.workspaceId matches the
 * hostname workspace; otherwise the session must be cleared (force re-login).
 */
export function assertTokenWorkspaceBinding(input: {
  tokenWorkspaceId: string | null | undefined;
  isPlatformSession: boolean | undefined;
  hostnameIsPlatform: boolean;
  hostnameWorkspaceId: string | null;
}): SessionWorkspaceBinding {
  if (input.hostnameIsPlatform) {
    return { ok: true, isPlatform: true, workspaceId: null };
  }
  if (!input.hostnameWorkspaceId) {
    return { ok: false, reason: "unknown_tenant" };
  }
  if (input.isPlatformSession) {
    return { ok: false, reason: "workspace_mismatch" };
  }
  if (!input.tokenWorkspaceId) {
    return { ok: false, reason: "missing_token_workspace" };
  }
  if (input.tokenWorkspaceId !== input.hostnameWorkspaceId) {
    return { ok: false, reason: "workspace_mismatch" };
  }
  return {
    ok: true,
    isPlatform: false,
    workspaceId: input.hostnameWorkspaceId,
  };
}

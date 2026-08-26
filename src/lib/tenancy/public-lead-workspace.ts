/**
 * Stage 3K.5.2 — public lead workspace plumbing from trusted request tenancy.
 */
import { isTenantPublicLeadScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import {
  resolveWorkspaceFromRequest,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { resolveDefaultWorkspaceIdForRouting } from "@/lib/workspace-routing";

const CLIENT_WORKSPACE_OVERRIDE_KEYS = [
  "workspaceId",
  "workspaceSlug",
  "domain",
  "hostname",
  "tenant",
  "tenantSlug",
] as const;

export type ClientWorkspaceOverrideRejection = {
  rejected: true;
  keys: string[];
};

/** Detect client attempts to choose workspace — must be ignored/rejected. */
export function detectClientWorkspaceOverride(
  body: Record<string, unknown> | null | undefined,
): ClientWorkspaceOverrideRejection | null {
  if (!body || typeof body !== "object") return null;
  const keys = CLIENT_WORKSPACE_OVERRIDE_KEYS.filter(
    (key) => body[key] !== undefined && body[key] !== null && body[key] !== "",
  );
  if (keys.length === 0) return null;
  return { rejected: true, keys: [...keys] };
}

/**
 * Resolve workspaceId for public lead routing from trusted server request tenancy.
 * Legacy scope: unchanged Houzzat default routing.
 */
export async function resolvePublicLeadWorkspaceIdFromRequest(
  request: Request,
  deps?: HostResolutionDeps,
): Promise<string | null> {
  if (!isTenantPublicLeadScopeWorkspace()) {
    return resolveDefaultWorkspaceIdForRouting();
  }

  const host = await resolveWorkspaceFromRequest(request, deps);
  if (!host.ok) {
    return null;
  }
  return host.workspaceId;
}


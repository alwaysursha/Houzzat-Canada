import { cache } from "react";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import {
  resolveWorkspaceFromHostname,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";

/**
 * Server-only: trusted request hostname → workspace domain row → SUSPENDED status.
 * Never reads query params, cookies, or client workspace identifiers.
 */
export async function isPlatformSuspendedHostRequest(
  request: Request,
  deps?: HostResolutionDeps,
): Promise<boolean> {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) return false;
  const result = await resolveWorkspaceFromHostname(hostname, deps);
  return !result.ok && result.reason === "workspace_suspended";
}

export async function isPlatformSuspendedHostFromHeaders(
  deps?: HostResolutionDeps,
): Promise<boolean> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) return false;
  return isPlatformSuspendedHostRequest(request, deps);
}

/** Per-request dedupe for layouts and metadata. */
export const resolvePlatformSuspendedHost = cache(async (): Promise<boolean> => {
  return isPlatformSuspendedHostFromHeaders();
});

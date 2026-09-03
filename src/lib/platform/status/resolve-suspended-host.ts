import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import { lookupActiveWorkspaceDomainRow } from "@/lib/tenancy/workspace-domain-probe";

/**
 * Server-only: trusted request hostname → workspace domain row → SUSPENDED status.
 * Reads workspace status from the domain row so a cached or generic host-deny
 * (workspace_inactive) still presents the branded suspended page.
 * Never reads query params, cookies, or client workspace identifiers.
 */
export async function isPlatformSuspendedHostRequest(
  request: Request,
  deps?: HostResolutionDeps,
): Promise<boolean> {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) return false;

  const row = deps?.lookupActiveDomain
    ? await deps.lookupActiveDomain(hostname)
    : await lookupActiveWorkspaceDomainRow(prisma, hostname);

  return row?.workspaceStatus === "SUSPENDED";
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

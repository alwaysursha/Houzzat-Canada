/**
 * Stage 6.11G.10B2 — request-boundary listing entitlement context.
 *
 * Trusted hostname → G.7C/G.10A → entitlement snapshot for provider methods.
 * Does NOT force-enable G5 enforcement (production flag stays OFF).
 *
 * Host deny → empty authorities (ready for fail-closed when flag ON).
 * Never invents Houzzat/global fallback.
 */

import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import {
  resolveListingEntitlementForHostname,
  type ListingEntitlementForHostnameResult,
  type ResolveListingEntitlementForHostnameInput,
} from "@/lib/tenancy/listing-entitlement/resolve-for-hostname";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement/types";

/** Empty snapshot for host deny / no MLS authority — never `undefined`. */
export function emptyListingEntitlementSnapshot(
  workspaceId = "",
): WorkspaceListingEntitlement {
  return { workspaceId, authorities: [] };
}

export type RequestListingEntitlementContext = {
  /** Always defined. Host deny or zero authority → authorities: []. */
  entitlement: WorkspaceListingEntitlement;
  resolution: ListingEntitlementForHostnameResult;
  hostname: string | null;
};

/**
 * Resolve listing entitlement once per HTTP request from the trusted Host.
 * Prisma/infra failures propagate (do not swallow into unentitled provider calls).
 */
export async function resolveListingEntitlementContextForRequest(
  request: Request,
  options?: Omit<
    ResolveListingEntitlementForHostnameInput,
    "hostname" | "requiredCapability"
  >,
): Promise<RequestListingEntitlementContext> {
  const hostname = extractTrustedRequestHostname(request);
  const resolution = await resolveListingEntitlementForHostname({
    hostname,
    hostDeps: options?.hostDeps,
    prisma: options?.prisma,
  });

  if (!resolution.ok) {
    return {
      hostname: resolution.hostname,
      resolution,
      entitlement: emptyListingEntitlementSnapshot(""),
    };
  }

  // Preserve empty authorities as [] — do not convert to undefined.
  return {
    hostname: resolution.host.hostname,
    resolution,
    entitlement: {
      workspaceId: resolution.entitlement.workspaceId,
      authorities: [...resolution.entitlement.authorities],
    },
  };
}

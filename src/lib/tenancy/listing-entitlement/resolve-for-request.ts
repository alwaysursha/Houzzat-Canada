/**
 * Stage 6.11G.10B2 — request-boundary listing entitlement context.
 *
 * Trusted hostname → G.7C/G.10A → entitlement snapshot for provider methods.
 * Does NOT force-enable G5 enforcement (production flag stays OFF).
 *
 * Host deny → empty authorities (ready for fail-closed when flag ON).
 * Never invents Houzzat/global fallback.
 */

import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
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

type HostnameEntitlementOptions = Omit<
  ResolveListingEntitlementForHostnameInput,
  "hostname" | "requiredCapability"
>;

/**
 * Shared primitive: trusted hostname string → entitlement context.
 * Used by API Request path and SSR server-page path.
 */
export async function resolveListingEntitlementContextForHostname(
  hostname: string | null,
  options?: HostnameEntitlementOptions,
): Promise<RequestListingEntitlementContext> {
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

/**
 * Resolve listing entitlement once per HTTP request from the trusted Host.
 * Prisma/infra failures propagate (do not swallow into unentitled provider calls).
 */
export async function resolveListingEntitlementContextForRequest(
  request: Request,
  options?: HostnameEntitlementOptions,
): Promise<RequestListingEntitlementContext> {
  const hostname = extractTrustedRequestHostname(request);
  return resolveListingEntitlementContextForHostname(hostname, options);
}

/**
 * Stage 6.11G.10B3A — RSC / marketing SSR path.
 *
 * Next.js `headers()` → synthetic Request → same trusted Host extraction as APIs.
 * Missing Host → empty entitlement (never Houzzat default).
 * Prisma/infra failures propagate (do not catch into unentitled MLS).
 *
 * Requires request-scoped rendering (marketing layout is `force-dynamic`).
 */
export async function resolveListingEntitlementContextForServerPage(
  options?: HostnameEntitlementOptions,
): Promise<RequestListingEntitlementContext> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) {
    return {
      hostname: null,
      resolution: {
        ok: false,
        reason: "missing_hostname",
        hostname: null,
        verifiedHostname: false,
      },
      entitlement: emptyListingEntitlementSnapshot(""),
    };
  }
  return resolveListingEntitlementContextForRequest(request, options);
}

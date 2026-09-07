/**
 * Stage 6.11G.10A — hostname-facing MLS listing entitlement wrapper.
 *
 * Uses G.7C authoritative hostname resolution ONLY.
 * Never uses legacy marketing / Houzzat-default host fallback.
 *
 * Caching: core + hostname resolvers are deterministic and uncached so Node
 * route handlers and selftests stay correct. RSC callers may wrap
 * `resolveListingEntitlementForHostnameCached` (React.cache, request-scoped).
 */

import { cache } from "react";
import type { PrismaClient } from "@prisma/client";
import {
  resolveAuthoritativeWorkspaceFromHostname,
  type AuthoritativeHostResolutionDeps,
  type AuthoritativeWorkspaceHostDenyReason,
  type AuthoritativeWorkspaceHostResult,
} from "@/lib/tenancy/resolve-authoritative-workspace-host";
import { resolveWorkspaceListingEntitlement } from "./resolve";
import type {
  ListingDataCapability,
  WorkspaceListingEntitlement,
} from "./types";

export type ListingEntitlementForHostnameSuccess = {
  ok: true;
  entitlement: WorkspaceListingEntitlement;
  host: Extract<AuthoritativeWorkspaceHostResult, { ok: true }>;
};

export type ListingEntitlementForHostnameFailure = {
  ok: false;
  reason: AuthoritativeWorkspaceHostDenyReason;
  hostname: string | null;
  verifiedHostname: false;
};

export type ListingEntitlementForHostnameResult =
  | ListingEntitlementForHostnameSuccess
  | ListingEntitlementForHostnameFailure;

export type ResolveListingEntitlementForHostnameInput = {
  hostname: string | null | undefined;
  requiredCapability?: ListingDataCapability;
  /** Injectable G.7C host deps (selftests). */
  hostDeps?: AuthoritativeHostResolutionDeps;
  prisma?: PrismaClient;
};

/**
 * Public/request path: hostname → G.7C → trusted workspaceId → entitlement.
 * Host deny is separate from empty authorities.
 */
export async function resolveListingEntitlementForHostname(
  input: ResolveListingEntitlementForHostnameInput,
): Promise<ListingEntitlementForHostnameResult> {
  const host = await resolveAuthoritativeWorkspaceFromHostname(
    input.hostname,
    input.hostDeps,
  );
  if (!host.ok) {
    return {
      ok: false,
      reason: host.reason,
      hostname: host.hostname,
      verifiedHostname: false,
    };
  }

  const entitlement = await resolveWorkspaceListingEntitlement({
    trustedWorkspaceId: host.workspaceId,
    requiredCapability: input.requiredCapability,
    prisma: input.prisma,
  });

  return { ok: true, entitlement, host };
}

/**
 * Request-scoped RSC helper (React.cache). Do not use with injectable fixtures —
 * call `resolveListingEntitlementForHostname` directly in tests/route handlers
 * that pass deps.
 */
export const resolveListingEntitlementForHostnameCached = cache(
  async (
    hostname: string | null,
    requiredCapability?: ListingDataCapability,
  ): Promise<ListingEntitlementForHostnameResult> => {
    return resolveListingEntitlementForHostname({
      hostname,
      requiredCapability,
    });
  },
);

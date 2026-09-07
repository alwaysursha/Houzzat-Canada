/**
 * Stage 6.11G.10A — INTERNAL MLS listing entitlement resolver.
 *
 * TRUST BOUNDARY:
 *   `trustedWorkspaceId` must already come from a fail-closed trusted source
 *   (typically G.7C authoritative hostname → ACTIVE WorkspaceDomain → ACTIVE
 *   Workspace). Never expose an HTTP route that accepts arbitrary client
 *   workspaceId to obtain authority.
 *
 * This answers source/capability authority only — not IDX/VOW display policy,
 * not Preview Listing Provider, not FSBO/manual channel policy.
 *
 * Fail-closed:
 *   - Normal no-authority → authorities: []
 *   - Prisma/infra read failures → THROW (do not convert to empty)
 */

import type { PrismaClient } from "@prisma/client";
import {
  ENTITLEMENT_ELIGIBLE_CONNECTION_STATUS,
  type WorkspaceDataConnectionCapabilityKind,
} from "@/lib/tenancy/data-connection";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { normalizeRecognizedListingProviderKey } from "./provider-key";
import type {
  ListingDataCapability,
  ListingSourceAuthority,
  WorkspaceListingEntitlement,
} from "./types";

export type ResolveWorkspaceListingEntitlementInput = {
  /**
   * INTERNAL — must be a trusted workspace id (e.g. from G.7C).
   * Not for client-submitted workspaceId.
   */
  trustedWorkspaceId: string;
  /** When set, only authorities granting this capability are returned. */
  requiredCapability?: ListingDataCapability;
  prisma?: PrismaClient;
  /**
   * Optional provider recognition (defaults to production registry).
   * Injectable for adversarial selftests exercising multi-provider isolation
   * without widening RECOGNIZED_LISTING_DATA_PROVIDER_KEYS.
   */
  normalizeProviderKey?: (
    raw: string | null | undefined,
  ) => string | null;
};

function compareAuthority(a: ListingSourceAuthority, b: ListingSourceAuthority): number {
  if (a.organizationId !== b.organizationId) {
    return a.organizationId < b.organizationId ? -1 : 1;
  }
  if (a.providerKey !== b.providerKey) {
    return a.providerKey < b.providerKey ? -1 : 1;
  }
  return 0;
}

/**
 * Resolve MLS listing entitlement for a trusted workspace.
 * Read-only Prisma selects only (no multi-write helpers, no bulk updates).
 */
export async function resolveWorkspaceListingEntitlement(
  input: ResolveWorkspaceListingEntitlementInput,
): Promise<WorkspaceListingEntitlement> {
  const workspaceId = input.trustedWorkspaceId?.trim() ?? "";
  if (!workspaceId) {
    return { workspaceId: "", authorities: [] };
  }

  const db = input.prisma ?? defaultPrisma;

  // Prisma errors must propagate (infra failure ≠ empty entitlement).
  const memberships = await db.workspaceRealEstateOrganizationMembership.findMany({
    where: {
      workspaceId,
      status: "VERIFIED",
    },
    select: { organizationId: true },
  });

  if (memberships.length === 0) {
    return { workspaceId, authorities: [] };
  }

  const verifiedOrgIds = [
    ...new Set(memberships.map((m) => m.organizationId)),
  ];

  const connections = await db.workspaceDataConnection.findMany({
    where: {
      workspaceId,
      organizationId: { in: verifiedOrgIds },
      status: ENTITLEMENT_ELIGIBLE_CONNECTION_STATUS,
    },
    select: {
      organizationId: true,
      providerKey: true,
      capabilities: {
        select: { capability: true },
      },
    },
  });

  const normalizeProvider =
    input.normalizeProviderKey ?? normalizeRecognizedListingProviderKey;

  const authorities: ListingSourceAuthority[] = [];

  for (const connection of connections) {
    const providerKey = normalizeProvider(connection.providerKey);
    if (!providerKey) continue;

    const sourceAuthorityKey = buildListingSourceAuthorityKey(
      connection.organizationId,
      providerKey,
    );
    if (!sourceAuthorityKey) continue;

    const capabilities = [
      ...new Set(
        connection.capabilities.map(
          (c) => c.capability as WorkspaceDataConnectionCapabilityKind,
        ),
      ),
    ];

    if (input.requiredCapability) {
      if (!capabilities.includes(input.requiredCapability)) continue;
    }

    authorities.push({
      organizationId: connection.organizationId,
      providerKey,
      sourceAuthorityKey,
      capabilities,
    });
  }

  authorities.sort(compareAuthority);

  return { workspaceId, authorities };
}

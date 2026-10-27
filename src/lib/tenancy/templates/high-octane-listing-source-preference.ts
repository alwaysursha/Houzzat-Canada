/**
 * Saved HIGH OCTANE source choice.
 * The latest platform audit row is the selection. Reading it does not create
 * a connection, copy a credential, or grant Houzzat's TRREB entitlement.
 * IDX website approval and VOW approval are not inferred from a subscription.
 */
import type { PrismaClient } from "@prisma/client";
import { ITSO_SOURCE_SELECT_ACTION } from "@/lib/listings/itso/itso-source-preference";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { PROPTX_TRREB_ORGANIZATION_SLUG } from "@/lib/proptx/listing-provenance";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { CURRENT_PROPTX_PROVIDER_KEY } from "@/lib/tenancy/listing-provenance/contract";
import {
  emptyHighOctanePropTxReadiness,
  parseStoredHighOctaneListingSource,
  type HighOctaneListingSourceRequest,
  type HighOctanePropTxReadiness,
  type StoredHighOctaneListingSource,
} from "@/lib/tenancy/templates/high-octane-proptx-source";

function requestedFromMetadata(metadata: unknown): StoredHighOctaneListingSource | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return parseStoredHighOctaneListingSource(
    (metadata as { requested?: unknown }).requested,
  );
}

export async function readHighOctaneListingSourceRequest(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<StoredHighOctaneListingSource | null> {
  const id = workspaceId.trim();
  if (!id) return null;
  const row = await db.platformAuditEvent.findFirst({
    where: {
      action: ITSO_SOURCE_SELECT_ACTION,
      entityType: "Workspace",
      entityId: id,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  return requestedFromMetadata(row?.metadata);
}

/**
 * PropTx readiness for the given workspace id only.
 * Credential material stays in storage; this returns whether a reference exists.
 */
export async function readHighOctanePropTxReadiness(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<HighOctanePropTxReadiness> {
  const id = workspaceId.trim();
  const empty = emptyHighOctanePropTxReadiness(id);
  if (!id) return empty;
  const workspace = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      domains: {
        where: { role: "PRIMARY", status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
      realEstateOrganizationMemberships: {
        where: { organization: { slug: PROPTX_TRREB_ORGANIZATION_SLUG } },
        select: { status: true },
        take: 1,
      },
      dataConnections: {
        where: {
          providerKey: CURRENT_PROPTX_PROVIDER_KEY,
          organization: { slug: PROPTX_TRREB_ORGANIZATION_SLUG },
        },
        select: {
          workspaceId: true,
          providerKey: true,
          status: true,
          credentialRef: true,
          capabilities: { select: { capability: true } },
          organization: { select: { slug: true } },
        },
        take: 1,
      },
    },
  });
  if (!workspace || workspace.id !== id) return empty;
  const connection = workspace.dataConnections[0] ?? null;
  return {
    workspaceId: id,
    connection: connection
      ? {
          workspaceId: connection.workspaceId,
          providerKey: connection.providerKey,
          organizationSlug: connection.organization.slug,
          status: connection.status,
          credentialRefPresent: Boolean(connection.credentialRef?.trim()),
          capabilities: connection.capabilities.map((row) => row.capability),
        }
      : null,
    membershipStatus: workspace.realEstateOrganizationMemberships[0]?.status ?? null,
    primaryDomainActive: workspace.domains.length > 0,
    idxWebsiteApproved: false,
    vowApproved: false,
  };
}

export async function recordHighOctaneListingSourceRequest(input: {
  workspaceId: string;
  operatorId: string;
  requested: HighOctaneListingSourceRequest;
  db?: PrismaClient;
}): Promise<void> {
  const db = input.db ?? defaultPrisma;
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: ITSO_SOURCE_SELECT_ACTION,
      entityType: "Workspace",
      entityId: input.workspaceId,
      summary: `HIGH OCTANE listing source set to ${input.requested}`,
      metadata: { requested: input.requested },
    },
    db,
  );
}

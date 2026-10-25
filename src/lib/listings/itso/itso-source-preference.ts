/**
 * Saved HIGH OCTANE source choice.
 * The latest platform audit row is the selection. It does not create a
 * connection, store a credential, or grant TRREB access.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  ITSO_LIVE_SOURCE_UNAVAILABLE,
  itsoLiveInputFromConnection,
  type ItsoConnectionStatus,
  type ItsoLiveSourceInput,
  type ItsoSourceRequest,
} from "@/lib/listings/itso/itso-sources";

export const ITSO_SOURCE_SELECT_ACTION = "high-octane.itso-source.select" as const;

export function parseItsoSourceRequest(raw: unknown): ItsoSourceRequest | null {
  if (raw === "demo" || raw === "live" || raw === "disabled") return raw;
  return null;
}

function requestedFromMetadata(metadata: unknown): ItsoSourceRequest | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return parseItsoSourceRequest((metadata as { requested?: unknown }).requested);
}

export async function readItsoSourceRequest(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ItsoSourceRequest | null> {
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

export async function readItsoLiveSourceInput(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ItsoLiveSourceInput> {
  const id = workspaceId.trim();
  if (!id) return ITSO_LIVE_SOURCE_UNAVAILABLE;
  const connection = await db.workspaceDataConnection.findFirst({
    where: { workspaceId: id, providerKey: "itso" },
    select: {
      credentialRef: true,
      status: true,
      capabilities: { select: { id: true }, take: 1 },
    },
  });
  if (!connection) return ITSO_LIVE_SOURCE_UNAVAILABLE;
  return itsoLiveInputFromConnection({
    credentialRef: connection.credentialRef,
    status: connection.status as ItsoConnectionStatus,
    feedType: null,
    entitlementActive: connection.status === "ACTIVE" && connection.capabilities.length > 0,
    metadataConfirmed: false,
  });
}

export async function recordItsoSourceRequest(input: {
  workspaceId: string;
  operatorId: string;
  requested: ItsoSourceRequest;
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
      summary: `HIGH OCTANE ITSO source set to ${input.requested}`,
      metadata: { requested: input.requested },
    },
    db,
  );
}

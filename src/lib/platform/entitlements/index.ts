/**
 * Stage 6.2A — runtime entitlement helpers.
 * Authority: Workspace.currentSubscriptionId + WorkspaceEntitlement + WorkspaceSeatQuota.
 * Do NOT read Stripe as entitlement authority.
 */

import type { PrismaClient, Subscription } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type WorkspaceSeatQuotaView = {
  workspaceId: string;
  includedSeats: number;
  additionalSeats: number;
  seatLimit: number;
};

export async function getCurrentWorkspaceSubscription(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<Subscription | null> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { currentSubscriptionId: true },
  });
  if (!workspace?.currentSubscriptionId) return null;

  return db.subscription.findUnique({
    where: { id: workspace.currentSubscriptionId },
  });
}

export async function workspaceHasFeature(
  workspaceId: string,
  featureCode: string,
  db: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const now = new Date();
  const row = await db.workspaceEntitlement.findUnique({
    where: {
      workspaceId_featureCode: { workspaceId, featureCode },
    },
    select: {
      enabled: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!row || !row.enabled) return false;
  if (row.startsAt && row.startsAt > now) return false;
  if (row.endsAt && row.endsAt <= now) return false;
  return true;
}

export async function getWorkspaceSeatQuota(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<WorkspaceSeatQuotaView | null> {
  const row = await db.workspaceSeatQuota.findUnique({
    where: { workspaceId },
    select: {
      workspaceId: true,
      includedSeats: true,
      additionalSeats: true,
      seatLimit: true,
    },
  });
  return row;
}

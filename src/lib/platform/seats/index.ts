/**
 * Stage 6.2A — seat consumption + expansion helpers.
 *
 * Counts:
 * - WorkspaceMember ACTIVE
 * - WorkspaceMember SUSPENDED
 * - WorkspaceInvite PENDING and not expired
 *
 * Does not count removed members, accepted/cancelled/expired invites.
 * Invite TTL authority = 14 days (WorkspaceInvite.expiresAt + WORKSPACE_INVITE_TTL_MS).
 */

import type { PlanCode, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { planAllowsAdditionalSeats } from "@/lib/platform/catalog/plans";
import { WORKSPACE_INVITE_TTL_MS } from "@/lib/workspace-invite";

export { WORKSPACE_INVITE_TTL_MS };

export type SeatConsumptionBreakdown = {
  workspaceId: string;
  activeMembers: number;
  suspendedMembers: number;
  pendingUnexpiredInvites: number;
  consumed: number;
};

export async function getWorkspaceSeatConsumption(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<SeatConsumptionBreakdown> {
  const [activeMembers, suspendedMembers, pendingUnexpiredInvites] =
    await Promise.all([
      db.workspaceMember.count({
        where: { workspaceId, status: "ACTIVE" },
      }),
      db.workspaceMember.count({
        where: { workspaceId, status: "SUSPENDED" },
      }),
      db.workspaceInvite.count({
        where: {
          workspaceId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      }),
    ]);

  return {
    workspaceId,
    activeMembers,
    suspendedMembers,
    pendingUnexpiredInvites,
    consumed: activeMembers + suspendedMembers + pendingUnexpiredInvites,
  };
}

export function planAllowsSeatExpansion(planCode: PlanCode): boolean {
  return planAllowsAdditionalSeats(planCode);
}

/**
 * Solo forever forbids additional seats. Team/Brokerage allow expansion.
 * Grandfathered / null planCode: expansion policy comes from profile recipe,
 * not this helper.
 */
export function assertAdditionalSeatAllowedForPlan(planCode: PlanCode): void {
  if (!planAllowsAdditionalSeats(planCode)) {
    throw new Error(
      `Plan ${planCode} forbids additional seats (included seats only)`,
    );
  }
}

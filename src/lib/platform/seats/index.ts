/**
 * Stage 6.2A — seat consumption + expansion helpers.
 *
 * Counts:
 * - WorkspaceMember ACTIVE
 * - WorkspaceMember SUSPENDED
 * - WorkspaceInvite PENDING and not expired
 *
 * Does not count removed members, accepted/cancelled/expired invites.
 * Invite TTL authority = 14 days (WorkspaceInvite.expiresAt).
 * OWNER membership consumes a seat when ACTIVE or SUSPENDED.
 */

import type { PlanCode, PrismaClient, WorkspaceMemberStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { planAllowsAdditionalSeats } from "@/lib/platform/catalog/plans";
import { getWorkspaceSeatQuota } from "@/lib/platform/entitlements";

/** Same 14-day pending-invite window used by WorkspaceInvite.expiresAt. */
export const WORKSPACE_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const SEAT_LIMIT_REACHED = "SEAT_LIMIT_REACHED";
export const SEAT_QUOTA_MISSING = "SEAT_QUOTA_MISSING";

export const SEAT_LIMIT_REACHED_MESSAGE =
  "You've used all seats included in your plan.";

export class WorkspaceSeatError extends Error {
  readonly code: typeof SEAT_LIMIT_REACHED | typeof SEAT_QUOTA_MISSING;
  readonly status: number;

  constructor(
    message: string,
    code: typeof SEAT_LIMIT_REACHED | typeof SEAT_QUOTA_MISSING,
    status = 403,
  ) {
    super(message);
    this.name = "WorkspaceSeatError";
    this.code = code;
    this.status = status;
  }
}

export type SeatConsumptionBreakdown = {
  workspaceId: string;
  activeMembers: number;
  suspendedMembers: number;
  pendingUnexpiredInvites: number;
  consumed: number;
};

export type WorkspaceSeatCapacity = {
  workspaceId: string;
  includedSeats: number;
  additionalSeats: number;
  seatLimit: number;
  consumed: number;
  remaining: number;
  atCapacity: boolean;
  breakdown: SeatConsumptionBreakdown;
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

export async function getWorkspaceSeatCapacity(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<WorkspaceSeatCapacity | null> {
  const quota = await getWorkspaceSeatQuota(workspaceId, db);
  if (!quota) return null;
  const breakdown = await getWorkspaceSeatConsumption(workspaceId, db, now);
  const remaining = Math.max(0, quota.seatLimit - breakdown.consumed);
  return {
    workspaceId,
    includedSeats: quota.includedSeats,
    additionalSeats: quota.additionalSeats,
    seatLimit: quota.seatLimit,
    consumed: breakdown.consumed,
    remaining,
    atCapacity: breakdown.consumed >= quota.seatLimit,
    breakdown,
  };
}

/**
 * New invite / new member occupies one additional seat.
 * Already-counted ACTIVE or SUSPENDED memberships are not expansions.
 */
export async function assertWorkspaceSeatAvailableForInvite(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<WorkspaceSeatCapacity> {
  const capacity = await getWorkspaceSeatCapacity(workspaceId, db, now);
  if (!capacity) {
    throw new WorkspaceSeatError(
      "Seat limit is not provisioned for this workspace.",
      SEAT_QUOTA_MISSING,
      403,
    );
  }
  if (capacity.atCapacity) {
    throw new WorkspaceSeatError(
      SEAT_LIMIT_REACHED_MESSAGE,
      SEAT_LIMIT_REACHED,
      403,
    );
  }
  return capacity;
}

export function projectConsumedAfterInviteAcceptance(input: {
  consumed: number;
  pendingInviteCounts: boolean;
  existingMemberCounts: boolean;
}): number {
  let projected = input.consumed;
  if (input.pendingInviteCounts) projected -= 1;
  if (!input.existingMemberCounts) projected += 1;
  return projected;
}

export function memberStatusConsumesSeat(
  status: WorkspaceMemberStatus | null | undefined,
): boolean {
  return status === "ACTIVE" || status === "SUSPENDED";
}

/**
 * Accepting a counted pending invite is a conversion, not an expansion.
 * Reject only when projected occupancy would exceed the provisioned limit
 * (quota reduced, or extra seats taken another way).
 */
export async function assertWorkspaceInviteAcceptanceWithinSeatLimit(input: {
  workspaceId: string;
  inviteStatus: string;
  inviteExpiresAt: Date;
  existingMemberStatus?: WorkspaceMemberStatus | null;
  db?: PrismaClient;
  now?: Date;
}): Promise<WorkspaceSeatCapacity> {
  const db = input.db ?? defaultPrisma;
  const now = input.now ?? new Date();
  const capacity = await getWorkspaceSeatCapacity(input.workspaceId, db, now);
  if (!capacity) {
    throw new WorkspaceSeatError(
      "Seat limit is not provisioned for this workspace.",
      SEAT_QUOTA_MISSING,
      403,
    );
  }

  const pendingInviteCounts =
    input.inviteStatus === "PENDING" &&
    input.inviteExpiresAt.getTime() > now.getTime();
  const projected = projectConsumedAfterInviteAcceptance({
    consumed: capacity.consumed,
    pendingInviteCounts,
    existingMemberCounts: memberStatusConsumesSeat(input.existingMemberStatus),
  });

  if (projected > capacity.seatLimit) {
    throw new WorkspaceSeatError(
      SEAT_LIMIT_REACHED_MESSAGE,
      SEAT_LIMIT_REACHED,
      403,
    );
  }
  return capacity;
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

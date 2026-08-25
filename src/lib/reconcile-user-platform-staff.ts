/**
 * Stage 3I.1 — derive platform staff identity from ALL ACTIVE WorkspaceMemberships.
 *
 * User.role / AgentProfile are global. WorkspaceMember.role/status are tenant-local.
 * No Workspace API may set User.role from a single-membership change alone.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Reconcile global User.role + AgentProfile.active from every ACTIVE membership
 * on an ACTIVE Workspace. Platform ADMIN is never demoted here.
 *
 * Call only after membership remove (not suspend). Suspend is WorkspaceMember-only.
 */
export async function reconcileUserPlatformStaffState(
  userId: string,
  db: Db = prisma,
): Promise<{
  activeSeatCount: number;
  role: string;
  agentProfileActive: boolean | null;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      agentProfile: { select: { active: true } },
    },
  });
  if (!user) {
    return { activeSeatCount: 0, role: "UNKNOWN", agentProfileActive: null };
  }

  const activeSeatCount = await db.workspaceMember.count({
    where: {
      userId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
  });

  // Platform ADMIN stays ADMIN regardless of workspace seats.
  if (user.role === "ADMIN") {
    if (activeSeatCount > 0) {
      await db.agentProfile.upsert({
        where: { userId },
        create: { userId, active: true },
        update: { active: true },
      });
      return {
        activeSeatCount,
        role: "ADMIN",
        agentProfileActive: true,
      };
    }
    return {
      activeSeatCount,
      role: "ADMIN",
      agentProfileActive: user.agentProfile?.active ?? null,
    };
  }

  if (activeSeatCount > 0) {
    if (user.role !== "AGENT") {
      await db.user.update({
        where: { id: userId },
        data: {
          role: "AGENT",
          isBuyer: false,
          isSeller: false,
        },
      });
    }
    await db.agentProfile.upsert({
      where: { userId },
      create: { userId, active: true },
      update: { active: true },
    });
    return {
      activeSeatCount,
      role: "AGENT",
      agentProfileActive: true,
    };
  }

  // Zero ACTIVE workspace staff seats → consumer (AGENT only; never ADMIN).
  if (user.role === "AGENT") {
    await db.user.update({
      where: { id: userId },
      data: {
        role: "BUYER",
        isBuyer: true,
        isSeller: false,
        activeMode: "BUYER",
      },
    });
    await db.agentProfile.upsert({
      where: { userId },
      create: { userId, active: false },
      update: { active: false },
    });
    return {
      activeSeatCount: 0,
      role: "BUYER",
      agentProfileActive: false,
    };
  }

  return {
    activeSeatCount: 0,
    role: user.role,
    agentProfileActive: user.agentProfile?.active ?? null,
  };
}

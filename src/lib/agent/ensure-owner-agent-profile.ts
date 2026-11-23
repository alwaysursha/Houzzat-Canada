/**
 * An owner who also works as the tenant's agent needs one AgentProfile on the
 * same user. This never creates a second user, membership, or lead assignment.
 * An existing profile is left untouched, including an inactive one.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export type OwnerAgentProfilePlan =
  | { action: "unchanged" }
  | { action: "skip"; reason: "not-owner" | "inactive-member" | "not-the-working-agent" }
  | {
      action: "create";
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      designation: string | null;
    };

export function planOwnerAgentProfile(input: {
  role: string;
  membershipActive: boolean;
  isPrimaryAgent: boolean;
  assignedLeadCount: number;
  workspaceHasOtherActiveAgentProfile: boolean;
  hasProfile: boolean;
  name: string | null;
  phone: string | null;
  /** Workspace public title. Used only for the primary agent, and only when saved. */
  publicDesignation: string | null;
}): OwnerAgentProfilePlan {
  if (input.role !== "OWNER") return { action: "skip", reason: "not-owner" };
  if (!input.membershipActive) return { action: "skip", reason: "inactive-member" };
  if (input.hasProfile) return { action: "unchanged" };
  const workingAgent =
    input.isPrimaryAgent ||
    input.assignedLeadCount > 0 ||
    !input.workspaceHasOtherActiveAgentProfile;
  if (!workingAgent) return { action: "skip", reason: "not-the-working-agent" };

  const parts = (input.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  const phone = input.phone?.trim() || null;
  const designation =
    input.isPrimaryAgent && input.publicDesignation?.trim()
      ? input.publicDesignation.trim()
      : null;
  return { action: "create", firstName, lastName, phone, designation };
}

export async function ensureOwnerAgentProfile(
  db: PrismaClient,
  input: { workspaceId: string; userId: string },
): Promise<OwnerAgentProfilePlan> {
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: {
      role: true,
      status: true,
      user: {
        select: {
          name: true,
          phone: true,
          agentProfile: { select: { id: true } },
        },
      },
      workspace: {
        select: {
          primaryAgentId: true,
          professionalIdentity: { select: { agentDesignation: true } },
        },
      },
    },
  });
  if (!member) return { action: "skip", reason: "not-owner" };

  const otherActiveAgentProfileCount = await db.workspaceMember.count({
    where: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      userId: { not: input.userId },
      user: { agentProfile: { is: { active: true } } },
    },
  });
  const assignedLeadCount = await db.lead.count({
    where: { workspaceId: input.workspaceId, assignedAgentId: input.userId },
  });
  const plan = planOwnerAgentProfile({
    role: member.role,
    membershipActive: member.status === "ACTIVE",
    isPrimaryAgent: member.workspace.primaryAgentId === input.userId,
    assignedLeadCount,
    workspaceHasOtherActiveAgentProfile: otherActiveAgentProfileCount > 0,
    hasProfile: Boolean(member.user.agentProfile),
    name: member.user.name,
    phone: member.user.phone,
    publicDesignation: member.workspace.professionalIdentity?.agentDesignation ?? null,
  });
  if (plan.action !== "create") return plan;

  try {
    await db.agentProfile.create({
      data: {
        userId: input.userId,
        active: true,
        firstName: plan.firstName,
        lastName: plan.lastName,
        phone: plan.phone,
        designation: plan.designation,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { action: "unchanged" };
    }
    throw error;
  }
  return plan;
}

export async function ensureActiveOwnerAgentProfiles(db: PrismaClient): Promise<
  Array<{ workspaceId: string; userId: string; plan: OwnerAgentProfilePlan }>
> {
  const owners = await db.workspaceMember.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { workspaceId: true, userId: true },
  });
  const results: Array<{ workspaceId: string; userId: string; plan: OwnerAgentProfilePlan }> = [];
  for (const owner of owners) {
    const plan = await ensureOwnerAgentProfile(db, owner);
    results.push({ ...owner, plan });
  }
  return results;
}

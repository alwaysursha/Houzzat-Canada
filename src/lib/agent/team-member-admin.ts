import type { AgentOrgContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export type MemberWorkload = {
  leads: number;
  openTasks: number;
  appointments: number;
};

export async function getMemberWorkload(
  organizationId: string,
  userId: string,
): Promise<MemberWorkload> {
  const [leads, openTasks, appointments] = await Promise.all([
    prisma.lead.count({
      where: { organizationId, assignedAgentId: userId },
    }),
    prisma.agentTask.count({
      where: {
        organizationId,
        assigneeId: userId,
        status: "OPEN",
      },
    }),
    prisma.appointment.count({
      where: {
        agentId: userId,
        OR: [{ lead: { organizationId } }, { leadId: null }],
      },
    }),
  ]);
  return { leads, openTasks, appointments };
}

async function assertManagedMember(
  ctx: AgentOrgContext,
  membershipId: string,
) {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      id: membershipId,
      organizationId: ctx.organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          agentProfile: { select: { id: true, active: true } },
        },
      },
    },
  });
  if (!membership) {
    return { ok: false as const, error: "Member not found." };
  }
  if (membership.userId === ctx.user.id) {
    return { ok: false as const, error: "You can’t manage your own seat this way." };
  }
  if (membership.user.role === "ADMIN" && !ctx.isPlatformAdmin) {
    return {
      ok: false as const,
      error: "Only a platform admin can manage another admin seat.",
    };
  }
  return { ok: true as const, membership };
}

/** Soft-disable CRM access; keeps the account + membership. */
export async function disableTeamMember(
  ctx: AgentOrgContext,
  membershipId: string,
) {
  const checked = await assertManagedMember(ctx, membershipId);
  if (!checked.ok) return checked;

  const { membership } = checked;
  await prisma.agentProfile.upsert({
    where: { userId: membership.userId },
    create: { userId: membership.userId, active: false },
    update: { active: false },
  });

  return { ok: true as const, userId: membership.userId };
}

/** Re-enable a previously disabled agent seat. */
export async function enableTeamMember(
  ctx: AgentOrgContext,
  membershipId: string,
) {
  const checked = await assertManagedMember(ctx, membershipId);
  if (!checked.ok) return checked;

  await prisma.agentProfile.upsert({
    where: { userId: checked.membership.userId },
    create: { userId: checked.membership.userId, active: true },
    update: { active: true },
  });

  return { ok: true as const, userId: checked.membership.userId };
}

/**
 * Remove agent from the team. Transfers CRM ownership, then demotes the user
 * back to a consumer account (buyer tools re-enabled).
 */
export async function deleteTeamMember(input: {
  ctx: AgentOrgContext;
  membershipId: string;
  transferToUserId: string;
}) {
  const checked = await assertManagedMember(input.ctx, input.membershipId);
  if (!checked.ok) return checked;

  const fromUserId = checked.membership.userId;
  if (input.transferToUserId === fromUserId) {
    return { ok: false as const, error: "Pick a different teammate for transfer." };
  }

  const target = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: input.ctx.organizationId,
      userId: input.transferToUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          agentProfile: { select: { active: true } },
        },
      },
    },
  });
  if (!target) {
    return { ok: false as const, error: "Transfer target is not on this team." };
  }
  if (target.user.agentProfile && !target.user.agentProfile.active) {
    return {
      ok: false as const,
      error: "Transfer target’s agent seat is disabled.",
    };
  }

  const orgId = input.ctx.organizationId;

  const transferred = await prisma.$transaction(async (tx) => {
    const leads = await tx.lead.updateMany({
      where: { organizationId: orgId, assignedAgentId: fromUserId },
      data: { assignedAgentId: input.transferToUserId },
    });
    const tasks = await tx.agentTask.updateMany({
      where: { organizationId: orgId, assigneeId: fromUserId },
      data: { assigneeId: input.transferToUserId },
    });
    const appointments = await tx.appointment.updateMany({
      where: {
        agentId: fromUserId,
        OR: [{ lead: { organizationId: orgId } }, { leadId: null }],
      },
      data: { agentId: input.transferToUserId },
    });
    const handoffs = await tx.referralHandoff.updateMany({
      where: { agentId: fromUserId },
      data: { agentId: input.transferToUserId },
    });
    const cmas = await tx.cmaReport.updateMany({
      where: { agentId: fromUserId },
      data: { agentId: input.transferToUserId },
    });

    await tx.crmRoutingWeight.deleteMany({ where: { agentId: fromUserId } });

    await tx.organizationMembership.delete({
      where: { id: checked.membership.id },
    });

    await tx.agentProfile.upsert({
      where: { userId: fromUserId },
      create: { userId: fromUserId, active: false },
      update: { active: false },
    });

    // Restore consumer access; leave platform ADMIN untouched.
    if (checked.membership.user.role !== "ADMIN") {
      await tx.user.update({
        where: { id: fromUserId },
        data: {
          role: "BUYER",
          isBuyer: true,
          isSeller: false,
          activeMode: "BUYER",
        },
      });
    }

    return {
      leads: leads.count,
      tasks: tasks.count,
      appointments: appointments.count,
      handoffs: handoffs.count,
      cmas: cmas.count,
    };
  });

  return {
    ok: true as const,
    userId: fromUserId,
    transferred,
  };
}

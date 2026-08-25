/**
 * Stage 3I / 3I.1 — WorkspaceMember mutations (WORKSPACE_TEAM_SCOPE=workspace only).
 *
 * Suspend/remove are workspace-scoped (WorkspaceMember.status / row delete).
 * Suspend NEVER mutates global User.role or AgentProfile.
 * Remove calls reconcileUserPlatformStaffState across ALL ACTIVE seats.
 */
import type { Prisma, WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";
import { reconcileUserPlatformStaffState } from "@/lib/reconcile-user-platform-staff";
import {
  assertWorkspaceMemberInContext,
  workspaceAdminCanChangeRole,
  workspaceAdminCanRemoveMember,
  workspaceAdminCanSuspendMember,
} from "@/lib/workspace-team";

export type WorkspaceTeamResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status?: number };

function requireWorkspaceManage(
  ctx: AgentOrgContext,
): WorkspaceTeamResult<{ workspaceId: string }> {
  if (!ctx.workspaceId) {
    return { ok: false, error: "Workspace required.", status: 403 };
  }
  if (!ctx.canManageWorkspace || !ctx.workspaceRole) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }
  if (ctx.workspaceStatus && ctx.workspaceStatus !== "ACTIVE") {
    return { ok: false, error: "Workspace is not active.", status: 403 };
  }
  return { ok: true, workspaceId: ctx.workspaceId };
}

/**
 * Routing cleanup for ONE workspace only — never deletes weights for other
 * workspaces' CrmRoutingSettings rows.
 */
export async function scrubWorkspaceRoutingForMember(
  workspaceId: string,
  userId: string,
  tx: Prisma.TransactionClient,
) {
  const settings = await tx.crmRoutingSettings.findFirst({
    where: { workspaceId },
    select: { id: true, listingAgentId: true },
  });
  if (settings) {
    await tx.crmRoutingWeight.deleteMany({
      where: { settingsId: settings.id, agentId: userId },
    });
    if (settings.listingAgentId === userId) {
      await tx.crmRoutingSettings.update({
        where: { id: settings.id },
        data: { listingAgentId: null },
      });
    }
  }

  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { primaryAgentId: true },
  });
  if (workspace?.primaryAgentId === userId) {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { primaryAgentId: null },
    });
  }
}

/**
 * Atomic final-OWNER guard: mutation succeeds only if another ACTIVE OWNER remains
 * (or target is not OWNER). Prevents concurrent orphan races.
 */
async function assertNotFinalOwnerOrThrow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  membershipId: string,
  role: WorkspaceMemberRole,
) {
  if (role !== "OWNER") return;
  const otherOwners = await tx.workspaceMember.count({
    where: {
      workspaceId,
      role: "OWNER",
      status: "ACTIVE",
      id: { not: membershipId },
    },
  });
  if (otherOwners < 1) {
    throw new Error("FINAL_OWNER");
  }
}

export async function suspendWorkspaceMember(
  ctx: AgentOrgContext,
  membershipId: string,
): Promise<WorkspaceTeamResult<{ userId: string }>> {
  const gate = requireWorkspaceManage(ctx);
  if (!gate.ok) return gate;

  const membership = await assertWorkspaceMemberInContext(ctx, membershipId);
  if (!membership) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  if (
    !workspaceAdminCanSuspendMember(
      ctx.workspaceRole,
      membership.role,
      membership.userId,
      ctx.user.id,
    )
  ) {
    return { ok: false, error: "You can’t suspend this member.", status: 403 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await assertNotFinalOwnerOrThrow(
        tx,
        gate.workspaceId,
        membership.id,
        membership.role,
      );
      await tx.workspaceMember.update({
        where: { id: membership.id },
        data: { status: "SUSPENDED" },
      });
      // Workspace-only suspension — never AgentProfile / User.role.
      await scrubWorkspaceRoutingForMember(
        gate.workspaceId,
        membership.userId,
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FINAL_OWNER") {
      return {
        ok: false,
        error: "Cannot suspend the final Workspace owner.",
        status: 400,
      };
    }
    throw error;
  }

  return { ok: true, userId: membership.userId };
}

export async function reactivateWorkspaceMember(
  ctx: AgentOrgContext,
  membershipId: string,
): Promise<WorkspaceTeamResult<{ userId: string }>> {
  const gate = requireWorkspaceManage(ctx);
  if (!gate.ok) return gate;

  const membership = await assertWorkspaceMemberInContext(ctx, membershipId);
  if (!membership) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  if (
    !workspaceAdminCanSuspendMember(
      ctx.workspaceRole,
      membership.role,
      membership.userId,
      ctx.user.id,
    )
  ) {
    return {
      ok: false,
      error: "You can’t reactivate this member.",
      status: 403,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({
      where: { id: membership.id },
      data: { status: "ACTIVE", joinedAt: membership.joinedAt ?? new Date() },
    });
    // Reactivation may restore staff need — reconcile from all seats.
    await reconcileUserPlatformStaffState(membership.userId, tx);
  });

  return { ok: true, userId: membership.userId };
}

export async function changeWorkspaceMemberRole(
  ctx: AgentOrgContext,
  membershipId: string,
  nextRole: WorkspaceMemberRole,
): Promise<WorkspaceTeamResult<{ userId: string; role: WorkspaceMemberRole }>> {
  const gate = requireWorkspaceManage(ctx);
  if (!gate.ok) return gate;

  if (nextRole === "OWNER") {
    return {
      ok: false,
      error: "Cannot promote to OWNER via team API.",
      status: 400,
    };
  }

  const membership = await assertWorkspaceMemberInContext(ctx, membershipId);
  if (!membership) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  if (membership.userId === ctx.user.id) {
    return { ok: false, error: "You can’t change your own role.", status: 400 };
  }
  if (membership.role === "OWNER") {
    return { ok: false, error: "Cannot change OWNER role.", status: 403 };
  }
  if (!workspaceAdminCanChangeRole(ctx.workspaceRole, membership.role)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }
  if (ctx.workspaceRole === "ADMIN" && nextRole !== "AGENT") {
    return {
      ok: false,
      error: "Admins can only manage AGENT seats.",
      status: 403,
    };
  }
  if (
    ctx.workspaceRole === "OWNER" &&
    nextRole !== "ADMIN" &&
    nextRole !== "AGENT"
  ) {
    return { ok: false, error: "Invalid role.", status: 400 };
  }

  await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { role: nextRole },
  });

  return { ok: true, userId: membership.userId, role: nextRole };
}

export async function removeWorkspaceMember(input: {
  ctx: AgentOrgContext;
  membershipId: string;
  transferToUserId: string;
}): Promise<
  WorkspaceTeamResult<{
    userId: string;
    transferred: {
      leads: number;
      tasks: number;
      appointments: number;
    };
  }>
> {
  const gate = requireWorkspaceManage(input.ctx);
  if (!gate.ok) return gate;

  const membership = await assertWorkspaceMemberInContext(
    input.ctx,
    input.membershipId,
  );
  if (!membership) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  if (
    !workspaceAdminCanRemoveMember(
      input.ctx.workspaceRole,
      membership.role,
      membership.userId,
      input.ctx.user.id,
    )
  ) {
    return { ok: false, error: "You can’t remove this member.", status: 403 };
  }

  const fromUserId = membership.userId;
  if (input.transferToUserId === fromUserId) {
    return {
      ok: false,
      error: "Pick a different teammate for transfer.",
      status: 400,
    };
  }

  const target = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: gate.workspaceId,
      userId: input.transferToUserId,
      status: "ACTIVE",
    },
  });
  if (!target) {
    return {
      ok: false,
      error: "Transfer target must be an ACTIVE member of this Workspace.",
      status: 400,
    };
  }

  try {
    const transferred = await prisma.$transaction(async (tx) => {
      await assertNotFinalOwnerOrThrow(
        tx,
        gate.workspaceId,
        membership.id,
        membership.role,
      );

      const leads = await tx.lead.updateMany({
        where: {
          workspaceId: gate.workspaceId,
          assignedAgentId: fromUserId,
        },
        data: { assignedAgentId: input.transferToUserId },
      });
      const tasks = await tx.agentTask.updateMany({
        where: {
          workspaceId: gate.workspaceId,
          assigneeId: fromUserId,
        },
        data: { assigneeId: input.transferToUserId },
      });
      const appointments = await tx.appointment.updateMany({
        where: {
          agentId: fromUserId,
          lead: { workspaceId: gate.workspaceId },
        },
        data: { agentId: input.transferToUserId },
      });

      await scrubWorkspaceRoutingForMember(
        gate.workspaceId,
        fromUserId,
        tx,
      );

      await tx.workspaceMember.delete({ where: { id: membership.id } });

      // Global role only via authoritative multi-workspace reconcile.
      await reconcileUserPlatformStaffState(fromUserId, tx);

      return {
        leads: leads.count,
        tasks: tasks.count,
        appointments: appointments.count,
      };
    });

    if (transferred.leads > 0) {
      void sendPushToUser(input.transferToUserId, {
        type: "lead_reassigned",
        title: "Leads assigned to you",
        body:
          transferred.leads === 1
            ? "1 lead was transferred to you"
            : `${transferred.leads} leads were transferred to you`,
        href: "/agent/leads",
      });
    }

    return { ok: true, userId: fromUserId, transferred };
  } catch (error) {
    if (error instanceof Error && error.message === "FINAL_OWNER") {
      return {
        ok: false,
        error: "Cannot remove the final Workspace owner.",
        status: 400,
      };
    }
    throw error;
  }
}

export async function setWorkspacePrimaryAgent(
  ctx: AgentOrgContext,
  userId: string,
): Promise<WorkspaceTeamResult<{ primaryAgentId: string }>> {
  const gate = requireWorkspaceManage(ctx);
  if (!gate.ok) return gate;
  if (ctx.workspaceRole !== "OWNER") {
    return {
      ok: false,
      error: "Only the Workspace owner can set the Primary Agent.",
      status: 403,
    };
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: gate.workspaceId,
      userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN", "AGENT"] },
      user: {
        disabledAt: null,
        agentProfile: { is: { active: true } },
      },
    },
    select: { userId: true },
  });
  if (!member) {
    return {
      ok: false,
      error:
        "Primary Agent must be an ACTIVE Workspace member with an active agent profile.",
      status: 400,
    };
  }

  await prisma.workspace.update({
    where: { id: gate.workspaceId },
    data: { primaryAgentId: userId },
  });

  return { ok: true, primaryAgentId: userId };
}

/**
 * Stage 3H/3I — WorkspaceMember-based team management (behind WORKSPACE_TEAM_SCOPE).
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { isWorkspaceTeamScope } from "@/lib/workspace-scope-flags";
import { prisma } from "@/lib/prisma";

export function usesWorkspaceTeamScope(ctx: AgentOrgContext): boolean {
  return isWorkspaceTeamScope() && Boolean(ctx.workspaceId);
}

export function workspaceTeamCanManage(ctx: AgentOrgContext): boolean {
  if (!usesWorkspaceTeamScope(ctx)) return ctx.canSeeTeamLeads;
  return ctx.canManageWorkspace;
}

/**
 * OWNER: invite ADMIN or AGENT.
 * ADMIN: invite AGENT only.
 * AGENT: none.
 * Never invite OWNER via this API.
 */
export function workspaceAdminCanInviteRole(
  actorRole: AgentOrgContext["workspaceRole"],
  inviteRole: WorkspaceMemberRole,
): boolean {
  if (inviteRole === "OWNER") return false;
  if (actorRole === "OWNER") return inviteRole === "ADMIN" || inviteRole === "AGENT";
  if (actorRole === "ADMIN") return inviteRole === "AGENT";
  return false;
}

export function workspaceAdminCanChangeRole(
  actorRole: AgentOrgContext["workspaceRole"],
  targetRole: string,
): boolean {
  if (targetRole === "OWNER") return false;
  if (actorRole === "OWNER") return targetRole === "ADMIN" || targetRole === "AGENT";
  if (actorRole === "ADMIN") return targetRole === "AGENT";
  return false;
}

export function workspaceAdminCanRemoveMember(
  actorRole: AgentOrgContext["workspaceRole"],
  targetRole: string,
  targetUserId: string,
  actorUserId: string,
): boolean {
  if (targetUserId === actorUserId) return false;
  if (targetRole === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "AGENT";
  return false;
}

/** Same matrix as remove for suspend/reactivate. */
export function workspaceAdminCanSuspendMember(
  actorRole: AgentOrgContext["workspaceRole"],
  targetRole: string,
  targetUserId: string,
  actorUserId: string,
): boolean {
  return workspaceAdminCanRemoveMember(
    actorRole,
    targetRole,
    targetUserId,
    actorUserId,
  );
}

export async function getWorkspaceTeamPayload(ctx: AgentOrgContext) {
  if (!ctx.workspaceId) {
    return null;
  }

  const [members, invites, workspace] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            agentProfile: { select: { active: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workspaceInvite.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        brokerageAffiliation: true,
        primaryAgentId: true,
      },
    }),
  ]);

  const activeSeatCount = members.filter((m) => m.status === "ACTIVE").length;

  return {
    workspace,
    primaryAgentId: workspace?.primaryAgentId ?? null,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      isPrimaryAgent: workspace?.primaryAgentId === m.userId,
      user: m.user,
    })),
    invites,
    canManage: workspaceTeamCanManage(ctx),
    /** Billing/seats deferred — structure only for future plans. */
    seats: {
      activeSeatCount,
      seatLimit: null as number | null,
      billingDeferred: true as const,
    },
  };
}

export async function assertWorkspaceMemberInContext(
  ctx: AgentOrgContext,
  membershipId: string,
) {
  if (!ctx.workspaceId) return null;
  return prisma.workspaceMember.findFirst({
    where: { id: membershipId, workspaceId: ctx.workspaceId },
    include: {
      user: { select: { id: true, role: true } },
    },
  });
}

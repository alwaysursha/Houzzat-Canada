/**
 * Stage 3H — WorkspaceMember-based team management (behind WORKSPACE_TEAM_SCOPE).
 */
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
      },
    }),
  ]);

  return {
    workspace,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      user: m.user,
    })),
    invites,
    canManage: workspaceTeamCanManage(ctx),
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

export function workspaceAdminCanChangeRole(
  actorRole: AgentOrgContext["workspaceRole"],
  targetRole: string,
): boolean {
  if (actorRole === "OWNER") return true;
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

/**
 * Stage 3H/3I/3I.2 — WorkspaceMember-based team management (behind WORKSPACE_TEAM_SCOPE).
 *
 * Authority is fail-closed: when WORKSPACE_TEAM_SCOPE=workspace, missing workspace
 * context MUST NOT fall back to OrganizationInvite / OrganizationMembership.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { isActiveHostnameBoundReadMode, isWorkspaceReadMode } from "@/lib/crm-read-scope";
import { isWorkspaceTeamScope } from "@/lib/workspace-scope-flags";
import { prisma } from "@/lib/prisma";

export type TeamAuthority =
  | { mode: "legacy"; organizationId: string }
  | { mode: "workspace"; workspaceId: string }
  | { mode: "unavailable"; reason: "WORKSPACE_CONTEXT_REQUIRED" };

/**
 * Single authoritative resolver for Team GET + all Team mutations.
 * Workspace flag without a resolved workspaceId → unavailable (fail closed).
 */
export function resolveTeamAuthority(ctx: AgentOrgContext): TeamAuthority {
  const useWorkspaceTeam = isWorkspaceTeamScope() || isActiveHostnameBoundReadMode();
  if (useWorkspaceTeam) {
    if (!ctx.workspaceId) {
      return { mode: "unavailable", reason: "WORKSPACE_CONTEXT_REQUIRED" };
    }
    return { mode: "workspace", workspaceId: ctx.workspaceId };
  }
  return { mode: "legacy", organizationId: ctx.organizationId };
}

/** True only when Team operations must use WorkspaceMember / WorkspaceInvite. */
export function usesWorkspaceTeamScope(ctx: AgentOrgContext): boolean {
  return resolveTeamAuthority(ctx).mode === "workspace";
}

export function workspaceTeamCanManage(ctx: AgentOrgContext): boolean {
  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "workspace") return ctx.canManageWorkspace;
  if (authority.mode === "legacy") return ctx.canSeeTeamLeads;
  return false;
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
      where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
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

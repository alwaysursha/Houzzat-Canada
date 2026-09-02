/**
 * Stage 5.13 — Mobile v2 Team payload + capabilities (WorkspaceMember canonical).
 */

import type { WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { buildMobileStatisticsContext } from "@/lib/mobile/v2/statistics-context";
import { prisma } from "@/lib/prisma";
import {
  workspaceAdminCanChangeRole,
  workspaceAdminCanInviteRole,
  workspaceAdminCanRemoveMember,
  workspaceAdminCanSuspendMember,
  workspaceTeamCanManage,
} from "@/lib/workspace-team";

export async function buildMobileTeamContext(opts: {
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
}): Promise<AgentOrgContext | null> {
  return buildMobileStatisticsContext(opts);
}

export type MobileTeamCapabilities = {
  canInvite: boolean;
  canManageMembers: boolean;
  canSuspend: boolean;
  canRemove: boolean;
  canSetPrimaryAgent: boolean;
  allowedInviteRoles: Array<"ADMIN" | "AGENT">;
  canOpenStatistics: boolean;
};

export function buildTeamCapabilities(
  role: WorkspaceMemberRole,
): MobileTeamCapabilities {
  const canManage = role === "OWNER" || role === "ADMIN";
  const allowedInviteRoles: Array<"ADMIN" | "AGENT"> = [];
  if (workspaceAdminCanInviteRole(role, "ADMIN")) allowedInviteRoles.push("ADMIN");
  if (workspaceAdminCanInviteRole(role, "AGENT")) allowedInviteRoles.push("AGENT");

  return {
    canInvite: allowedInviteRoles.length > 0,
    canManageMembers: canManage,
    canSuspend: canManage,
    canRemove: canManage,
    canSetPrimaryAgent: role === "OWNER",
    allowedInviteRoles,
    canOpenStatistics: canManage,
  };
}

export type MobileTeamMemberDto = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: WorkspaceMemberRole;
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
  isPrimaryAgent: boolean;
  agentProfileActive: boolean | null;
  canChangeRole: boolean;
  canSuspend: boolean;
  canReactivate: boolean;
  canRemove: boolean;
  canSetPrimaryAgent: boolean;
  allowedNextRoles: Array<"ADMIN" | "AGENT">;
};

export type MobileTeamInviteDto = {
  inviteId: string;
  email: string;
  role: WorkspaceMemberRole;
  status: string;
  createdAt: string;
  expiresAt: string;
};

export async function loadMobileTeamPayload(ctx: AgentOrgContext) {
  if (!ctx.workspaceId || !ctx.workspaceRole) return null;

  const canManage = workspaceTeamCanManage(ctx);
  const capabilities = buildTeamCapabilities(ctx.workspaceRole);

  const memberStatuses: Array<"ACTIVE" | "SUSPENDED"> = canManage
    ? ["ACTIVE", "SUSPENDED"]
    : ["ACTIVE"];

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: { in: memberStatuses },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          agentProfile: { select: { active: true, phone: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const invites = canManage
    ? await prisma.workspaceInvite.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      })
    : [];

  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      primaryAgentId: true,
    },
  });

  const actorRole = ctx.workspaceRole;
  const actorUserId = ctx.user.id;

  const memberDtos: MobileTeamMemberDto[] = members.map((m) => {
    const canChange =
      canManage &&
      m.userId !== actorUserId &&
      m.role !== "OWNER" &&
      workspaceAdminCanChangeRole(actorRole, m.role);
    const canSuspend =
      canManage &&
      m.status === "ACTIVE" &&
      workspaceAdminCanSuspendMember(
        actorRole,
        m.role,
        m.userId,
        actorUserId,
      );
    const canReactivate =
      canManage &&
      m.status === "SUSPENDED" &&
      workspaceAdminCanSuspendMember(
        actorRole,
        m.role,
        m.userId,
        actorUserId,
      );
    const canRemove =
      canManage &&
      workspaceAdminCanRemoveMember(
        actorRole,
        m.role,
        m.userId,
        actorUserId,
      );

    const allowedNextRoles: Array<"ADMIN" | "AGENT"> = [];
    if (canChange && actorRole === "OWNER") {
      if (m.role === "ADMIN") allowedNextRoles.push("AGENT");
      if (m.role === "AGENT") allowedNextRoles.push("ADMIN");
    }

    return {
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.agentProfile?.phone ?? m.user.phone ?? null,
      avatarUrl: m.user.image,
      role: m.role,
      status: m.status,
      isPrimaryAgent: workspace?.primaryAgentId === m.userId,
      agentProfileActive: m.user.agentProfile?.active ?? null,
      canChangeRole: canChange && allowedNextRoles.length > 0,
      canSuspend,
      canReactivate,
      canRemove,
      canSetPrimaryAgent:
        actorRole === "OWNER" &&
        m.status === "ACTIVE" &&
        m.user.agentProfile?.active === true &&
        workspace?.primaryAgentId !== m.userId,
      allowedNextRoles,
    };
  });

  const inviteDtos: MobileTeamInviteDto[] = invites.map((i) => ({
    inviteId: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
  }));

  const activeCount = memberDtos.filter((m) => m.status === "ACTIVE").length;

  return {
    workspace: {
      id: workspace?.id ?? ctx.workspaceId,
      name: workspace?.name ?? ctx.workspaceName ?? "Workspace",
      primaryAgentId: workspace?.primaryAgentId ?? null,
    },
    memberCount: activeCount,
    capabilities,
    members: memberDtos,
    pendingInvites: inviteDtos,
  };
}

export async function loadMobileTeamMemberDetail(
  ctx: AgentOrgContext,
  membershipId: string,
): Promise<MobileTeamMemberDto | null> {
  const payload = await loadMobileTeamPayload(ctx);
  if (!payload) return null;
  return (
    payload.members.find((m) => m.membershipId === membershipId) ?? null
  );
}

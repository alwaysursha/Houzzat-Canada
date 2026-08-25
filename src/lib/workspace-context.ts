/**
 * Stage 3F/3H — Workspace staff context from ACTIVE WorkspaceMember rows.
 * Tenant access is never inferred from brokerageAffiliation, User.role, or slug alone.
 */
import type {
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WorkspaceStaffContext = {
  workspaceId: string | null;
  workspaceRole: WorkspaceMemberRole | null;
  workspaceMemberStatus: WorkspaceMemberStatus | null;
  workspaceStatus: WorkspaceStatus | null;
  workspaceName: string | null;
  isWorkspaceMember: boolean;
  /** ACTIVE member on an ACTIVE workspace — required for WORKSPACE read mode. */
  isWorkspaceCrmAllowed: boolean;
  /**
   * True when >1 ACTIVE membership and no valid active Workspace selection.
   * Legacy name retained for crm-read-scope compatibility.
   */
  hasAmbiguousWorkspaceMembership: boolean;
  hasMultipleWorkspaces: boolean;
  requiresWorkspaceSelection: boolean;
  canManageWorkspace: boolean;
};

const EMPTY_WORKSPACE_CONTEXT: WorkspaceStaffContext = {
  workspaceId: null,
  workspaceRole: null,
  workspaceMemberStatus: null,
  workspaceStatus: null,
  workspaceName: null,
  isWorkspaceMember: false,
  isWorkspaceCrmAllowed: false,
  hasAmbiguousWorkspaceMembership: false,
  hasMultipleWorkspaces: false,
  requiresWorkspaceSelection: false,
  canManageWorkspace: false,
};

type MembershipRow = {
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  workspaceId: string;
  workspace: {
    id: string;
    status: WorkspaceStatus;
    name: string;
  };
};

function buildWorkspaceContext(
  member: MembershipRow,
  options: {
    hasMultipleWorkspaces: boolean;
    requiresWorkspaceSelection: boolean;
  },
): WorkspaceStaffContext {
  const workspaceActive = member.workspace.status === "ACTIVE";
  const memberActive = member.status === "ACTIVE";
  const canManageWorkspace =
    workspaceActive && memberActive && (member.role === "OWNER" || member.role === "ADMIN");

  return {
    workspaceId: member.workspaceId,
    workspaceRole: member.role,
    workspaceMemberStatus: member.status,
    workspaceStatus: member.workspace.status,
    workspaceName: member.workspace.name,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: workspaceActive && memberActive,
    hasAmbiguousWorkspaceMembership: options.requiresWorkspaceSelection,
    hasMultipleWorkspaces: options.hasMultipleWorkspaces,
    requiresWorkspaceSelection: options.requiresWorkspaceSelection,
    canManageWorkspace,
  };
}

export async function resolveWorkspaceStaffContext(
  userId: string,
  activeWorkspaceId?: string | null,
): Promise<WorkspaceStaffContext> {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: {
      role: true,
      status: true,
      workspaceId: true,
      workspace: { select: { id: true, status: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    return { ...EMPTY_WORKSPACE_CONTEXT };
  }

  const hasMultipleWorkspaces = memberships.length > 1;

  if (memberships.length === 1) {
    return buildWorkspaceContext(memberships[0]!, {
      hasMultipleWorkspaces: false,
      requiresWorkspaceSelection: false,
    });
  }

  if (!activeWorkspaceId) {
    return {
      ...EMPTY_WORKSPACE_CONTEXT,
      hasMultipleWorkspaces: true,
      requiresWorkspaceSelection: true,
      hasAmbiguousWorkspaceMembership: true,
    };
  }

  const selected = memberships.find((m) => m.workspaceId === activeWorkspaceId);
  if (!selected) {
    return {
      ...EMPTY_WORKSPACE_CONTEXT,
      hasMultipleWorkspaces: true,
      requiresWorkspaceSelection: true,
      hasAmbiguousWorkspaceMembership: true,
    };
  }

  return buildWorkspaceContext(selected, {
    hasMultipleWorkspaces: true,
    requiresWorkspaceSelection: false,
  });
}

export async function listActiveWorkspaceMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: {
      role: true,
      workspaceId: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          brokerageAffiliation: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

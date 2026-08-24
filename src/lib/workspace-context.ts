/**
 * Stage 3F — Workspace staff context resolved from ACTIVE WorkspaceMember rows.
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
  isWorkspaceMember: boolean;
  /** ACTIVE member on an ACTIVE workspace — required for WORKSPACE read mode. */
  isWorkspaceCrmAllowed: boolean;
  /** Multiple ACTIVE memberships — workspace mode must fail closed until explicit picker exists. */
  hasAmbiguousMembership: boolean;
};

const EMPTY_WORKSPACE_CONTEXT: WorkspaceStaffContext = {
  workspaceId: null,
  workspaceRole: null,
  workspaceMemberStatus: null,
  workspaceStatus: null,
  isWorkspaceMember: false,
  isWorkspaceCrmAllowed: false,
  hasAmbiguousMembership: false,
};

export async function resolveWorkspaceStaffContext(
  userId: string,
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
      workspace: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length > 1) {
    return {
      ...EMPTY_WORKSPACE_CONTEXT,
      hasAmbiguousMembership: true,
    };
  }

  if (memberships.length === 0) {
    return { ...EMPTY_WORKSPACE_CONTEXT };
  }

  const member = memberships[0]!;
  const workspaceActive = member.workspace.status === "ACTIVE";

  return {
    workspaceId: member.workspaceId,
    workspaceRole: member.role,
    workspaceMemberStatus: member.status,
    workspaceStatus: member.workspace.status,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: workspaceActive && member.status === "ACTIVE",
    hasAmbiguousMembership: false,
  };
}

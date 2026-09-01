/**
 * Stage 5.0 — Workspace-scoped Mobile v2 auth (no lead required).
 * Used by global Tasks list / create / patch.
 */

import type { WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export type MobileWorkspaceAccessOk = {
  ok: true;
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
};

export type MobileWorkspaceAccessErr = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export async function authorizeMobileWorkspaceAccess(
  request: Request,
): Promise<MobileWorkspaceAccessOk | MobileWorkspaceAccessErr> {
  const authResult = authenticateMobileRequest(request, "mobile_workspace_access");
  if (!authResult.ok) {
    return {
      ok: false,
      status: authResult.status,
      code: "AUTH_REQUIRED",
      message: authResult.error,
    };
  }

  const { sub: userId, wsId: workspaceId } = authResult.payload;

  if (!workspaceId || authResult.payload.type !== "mobile_workspace_access") {
    return {
      ok: false,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "A valid workspace session token is required",
    };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      role: true,
      status: true,
      workspace: { select: { status: true } },
    },
  });

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.workspace.status !== "ACTIVE"
  ) {
    return {
      ok: false,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "Inactive or unauthorized workspace membership",
    };
  }

  if (
    membership.role !== "AGENT" &&
    membership.role !== "OWNER" &&
    membership.role !== "ADMIN"
  ) {
    return {
      ok: false,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "Unsupported workspace role",
    };
  }

  return {
    ok: true,
    userId,
    workspaceId,
    role: membership.role,
  };
}

/** Resolve organizationId for a workspace (AgentTask requires organizationId). */
export async function resolveOrganizationIdForWorkspace(
  workspaceId: string,
): Promise<string | null> {
  const lead = await prisma.lead.findFirst({
    where: { workspaceId },
    select: { organizationId: true },
  });
  return lead?.organizationId ?? null;
}

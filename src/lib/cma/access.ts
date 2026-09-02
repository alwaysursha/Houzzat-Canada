/**
 * Stage 5.12A — Advanced CMA authorization (workspace-bound).
 */

import type { WorkspaceMemberRole } from "@prisma/client";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export type CmaAccessOk = {
  ok: true;
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
};

export type CmaAccessErr = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export async function authorizeMobileCmaWorkspace(
  request: Request,
): Promise<CmaAccessOk | CmaAccessErr> {
  const access = await authorizeMobileWorkspaceAccess(request);
  if (!access.ok) return access;
  return {
    ok: true,
    userId: access.userId,
    workspaceId: access.workspaceId,
    role: access.role,
  };
}

export function canAccessCmaInWorkspace(input: {
  role: WorkspaceMemberRole;
  cmaAgentId: string;
  userId: string;
}): boolean {
  if (input.role === "OWNER" || input.role === "ADMIN") return true;
  if (input.role === "AGENT") return input.cmaAgentId === input.userId;
  return false;
}

/** Load CMA by id within workspace; cross-tenant → null (caller maps to 404). */
export async function findWorkspaceCma(input: {
  id: string;
  workspaceId: string;
}) {
  return prisma.cmaReport.findFirst({
    where: {
      id: input.id,
      workspaceId: input.workspaceId,
    },
  });
}

export async function assertLeadInWorkspace(input: {
  leadId: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
}): Promise<{ ok: true } | CmaAccessErr> {
  const lead = await prisma.lead.findFirst({
    where: {
      id: input.leadId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      assignedAgentId: true,
      workspaceId: true,
    },
  });
  if (!lead) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Lead not found",
    };
  }
  if (input.role === "AGENT" && lead.assignedAgentId !== input.userId) {
    // Align with typical agent CRM: assigned leads only unless OWNER/ADMIN
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Lead not found",
    };
  }
  return { ok: true };
}

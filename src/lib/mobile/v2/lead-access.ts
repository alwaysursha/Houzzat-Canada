/**
 * Stage 4.5 — Shared Mobile v2 lead access authorization.
 *
 * Reuses Stage 4.3A / 4.4 workspace + role visibility rules for both
 * Lead Detail reads and Lead Action writes (notes, status).
 */

import type { WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export type MobileLeadAccessOk = {
  ok: true;
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
  lead: {
    id: string;
    workspaceId: string | null;
    organizationId: string | null;
    assignedAgentId: string | null;
    status: string;
    firstRespondedAt: Date | null;
    notes: string | null;
    listingMls: string | null;
  };
};

export type MobileLeadAccessErr = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

/**
 * Authenticate workspace token, validate ACTIVE membership, and authorize
 * access to a specific lead under Stage 4.3A visibility rules.
 */
export async function authorizeMobileLeadAccess(
  request: Request,
  leadId: string,
): Promise<MobileLeadAccessOk | MobileLeadAccessErr> {
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

  if (!leadId) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Missing leadId parameter",
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
      workspace: {
        select: { status: true },
      },
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

  const role = membership.role;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      workspaceId: true,
      organizationId: true,
      assignedAgentId: true,
      status: true,
      firstRespondedAt: true,
      notes: true,
      listingMls: true,
    },
  });

  if (!lead || lead.workspaceId !== workspaceId) {
    return {
      ok: false,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found in current workspace",
    };
  }

  if (role === "AGENT") {
    const isAssigned = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;
    if (!isAssigned && !isPond) {
      return {
        ok: false,
        status: 404,
        code: "LEAD_NOT_FOUND",
        message: "Lead not found or access restricted",
      };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
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
    role,
    lead,
  };
}

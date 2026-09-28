import type { OrgMembershipRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  canAccessLead,
  parseCrmReadScope,
  type CrmScopeContext,
} from "@/lib/crm-read-scope";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";
import { resolveOrganizationIdForWorkspace } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

/**
 * Cookie-less staff context for the existing call-outcome route.
 * Workspace id comes from the verified mobile workspace token, never the body.
 * Returns null when there is no usable mobile session so web callers are unchanged.
 */
export async function requireMobileCallOutcomeContext(
  request: Request,
): Promise<AgentOrgContext | null> {
  const authResult = authenticateMobileRequest(request, "mobile_workspace_access");
  if (!authResult.ok || authResult.payload.type !== "mobile_workspace_access") {
    return null;
  }
  const workspaceId = authResult.payload.wsId;
  const userId = authResult.payload.sub;
  if (!workspaceId || !userId) return null;

  const [user, membership, orgMemberships] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, disabledAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        phone: true,
        role: true,
      },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        role: true,
        status: true,
        workspace: { select: { name: true, status: true } },
      },
    }),
    prisma.organizationMembership.findMany({
      where: { userId },
      select: { organizationId: true },
    }),
  ]);

  if (
    !user ||
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.workspace.status !== "ACTIVE"
  ) {
    return null;
  }
  if (
    membership.role !== "OWNER" &&
    membership.role !== "ADMIN" &&
    membership.role !== "AGENT"
  ) {
    return null;
  }

  let organizationIds = orgMemberships.map((row) => row.organizationId);
  if (!organizationIds.length) {
    const fallback = await resolveOrganizationIdForWorkspace(workspaceId);
    if (fallback) organizationIds = [fallback];
  }
  const organizationId = organizationIds[0];
  if (!organizationId) return null;

  const canSeeTeamLeads = membership.role === "OWNER" || membership.role === "ADMIN";
  const membershipRole: OrgMembershipRole =
    membership.role === "OWNER" ? "OWNER" : membership.role === "ADMIN" ? "ADMIN" : "AGENT";

  return {
    user,
    organizationId,
    organizationName: membership.workspace.name,
    organizationIds,
    membershipRole,
    canSeeTeamLeads,
    isPlatformAdmin: false,
    workspaceId,
    workspaceRole: membership.role,
    workspaceMemberStatus: membership.status,
    workspaceStatus: membership.workspace.status,
    workspaceName: membership.workspace.name,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: canSeeTeamLeads,
    readScope: parseCrmReadScope(),
  };
}

/**
 * Mobile tokens are workspace-scoped. canAccessLead stays as the intra-workspace
 * rule. This only rejects a lead outside the workspace bound into the token,
 * including legacy mode where team visibility would otherwise be global.
 */
export function canAccessLeadForMobileCallOutcome(
  ctx: CrmScopeContext,
  lead: {
    organizationId: string | null;
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  if (!ctx.workspaceId || !lead.workspaceId || lead.workspaceId !== ctx.workspaceId) {
    return false;
  }
  return canAccessLead(ctx, lead);
}

/**
 * Stage 5.9 — Build AgentOrgContext for Mobile v2 Statistics.
 * Reuses canonical loadAgentStatistics (web /agent/statistics).
 *
 * Desk cookie is forced null: AGENT → My desk; OWNER/ADMIN → Team overview.
 */

import type { Role, WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import { resolveOrganizationIdForWorkspace } from "@/lib/mobile/v2/workspace-access";

export {
  MOBILE_STATISTICS_RANGES,
  parseMobileStatisticsRange,
  type MobileStatisticsRange,
} from "@/lib/mobile/v2/statistics-range";

export async function buildMobileStatisticsContext(opts: {
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
}): Promise<AgentOrgContext | null> {
  const user = await prisma.user.findFirst({
    where: { id: opts.userId, disabledAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      phone: true,
      role: true,
    },
  });
  if (!user?.email) return null;

  const organizationId = await resolveOrganizationIdForWorkspace(
    opts.workspaceId,
  );
  if (!organizationId) {
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: opts.userId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return null;
    return buildCtx(user, membership.organizationId, opts);
  }

  return buildCtx(user, organizationId, opts);
}

function buildCtx(
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    phone: string | null;
    role: Role;
  },
  organizationId: string,
  opts: {
    userId: string;
    workspaceId: string;
    role: WorkspaceMemberRole;
  },
): AgentOrgContext {
  const canSeeTeamLeads = opts.role === "OWNER" || opts.role === "ADMIN";
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      phone: user.phone,
      role: user.role,
    },
    organizationId,
    organizationName: "",
    organizationIds: [organizationId],
    membershipRole: canSeeTeamLeads ? "OWNER" : "AGENT",
    canSeeTeamLeads,
    isPlatformAdmin: false,
    workspaceId: opts.workspaceId,
    workspaceRole: opts.role,
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: null,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: canSeeTeamLeads,
    readScope: "workspace",
  };
}

/**
 * Stage 5.9 — Build AgentOrgContext for Mobile v2 Statistics.
 * Reuses canonical loadAgentStatistics (web /agent/statistics).
 *
 * Desk cookie is forced null: AGENT → My desk; OWNER/ADMIN → Team overview.
 */

import type { Role, WorkspaceMemberRole } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { ensureBrokerageOrganization } from "@/lib/agent/brokerage";
import { prisma } from "@/lib/prisma";
import { resolveOrganizationIdForWorkspace } from "@/lib/mobile/v2/workspace-access";

export {
  MOBILE_STATISTICS_RANGES,
  parseMobileStatisticsRange,
  type MobileStatisticsRange,
} from "@/lib/mobile/v2/statistics-range";

type MobileContextUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  role: Role;
};

export type MobileStatisticsContextDeps = {
  findUser?: (userId: string) => Promise<MobileContextUser | null>;
  /** Existing path: organization id stored on a lead in this workspace. */
  resolveLeadOrganizationId?: (workspaceId: string) => Promise<string | null>;
  /** Existing path: caller's OrganizationMembership, oldest first. */
  resolveMembershipOrganizationId?: (userId: string) => Promise<string | null>;
  /**
   * Desktop hostname-bound fallback. Seat sync stays off.
   * Tests inject this so resolution does not touch a live database.
   */
  resolveBrokerageOrganization?: () => Promise<{ id: string }>;
};

async function defaultFindUser(userId: string): Promise<MobileContextUser | null> {
  return prisma.user.findFirst({
    where: { id: userId, disabledAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      phone: true,
      role: true,
    },
  });
}

async function defaultMembershipOrganizationId(
  userId: string,
): Promise<string | null> {
  const membership = await prisma.organizationMembership.findFirst({
    where: { userId },
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  return membership?.organizationId ?? null;
}

/** Launchpad returns the desk-context 403 only when this is false. */
export function isLaunchpadDeskContextResolved(
  ctx: AgentOrgContext | null,
): ctx is AgentOrgContext {
  return ctx != null;
}

export async function buildMobileStatisticsContext(
  opts: {
    userId: string;
    workspaceId: string;
    role: WorkspaceMemberRole;
  },
  deps?: MobileStatisticsContextDeps,
): Promise<AgentOrgContext | null> {
  const findUser = deps?.findUser ?? defaultFindUser;
  const resolveLeadOrganizationId =
    deps?.resolveLeadOrganizationId ?? resolveOrganizationIdForWorkspace;
  const resolveMembershipOrganizationId =
    deps?.resolveMembershipOrganizationId ?? defaultMembershipOrganizationId;
  const resolveBrokerageOrganization =
    deps?.resolveBrokerageOrganization ??
    (() => ensureBrokerageOrganization(false));

  const user = await findUser(opts.userId);
  if (!user?.email) return null;

  const leadOrganizationId = await resolveLeadOrganizationId(opts.workspaceId);
  if (leadOrganizationId) return buildCtx(user, leadOrganizationId, opts);

  const membershipOrganizationId = await resolveMembershipOrganizationId(
    opts.userId,
  );
  if (membershipOrganizationId) {
    return buildCtx(user, membershipOrganizationId, opts);
  }

  const brokerage = await resolveBrokerageOrganization();
  if (!brokerage.id) return null;
  return buildCtx(user, brokerage.id, opts);
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

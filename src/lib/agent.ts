import type { OrgMembershipRole, Prisma, Role, WorkspaceMemberRole, WorkspaceMemberStatus, WorkspaceStatus } from "@prisma/client";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { ensureBrokerageOrganization } from "@/lib/agent/brokerage";
import {
  assertAssigneeEligibleForWorkspace,
  isWorkspacePublicLeadScope,
  PublicLeadRoutingError,
  resolveOrganizationForWorkspaceLeadDesk,
  resolveTrustedPublicLeadWorkspaceId,
} from "@/lib/workspace-lead-desk";
import { userQualifiesForLegacyBrokerageOrgSeat } from "@/lib/agent/brokerage-seat-sync";
import {
  canAccessLead as canAccessLeadScoped,
  leadScopeWhere as leadScopeWhereScoped,
  parseCrmReadScope,
  type CrmReadScopeMode,
} from "@/lib/crm-read-scope";
import { isAdminRole, isAgentRole } from "@/lib/constants";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import {
  isPlatformAdminSurfaceHostname,
  shouldUseHostnameBoundStaffContext,
  tryTenantStaffContext,
} from "@/lib/tenancy/tenant-staff-context";
import { resolveWorkspaceStaffContext } from "@/lib/workspace-context";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";

const agentUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

export type AgentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  role: Role;
};

export type AgentOrgContext = {
  user: AgentUser;
  /** Brokerage desk org (single team under the Team Leader). */
  organizationId: string;
  organizationName: string;
  /** Desk org ids used for lead visibility (single-team model → one id). */
  organizationIds: string[];
  membershipRole: OrgMembershipRole;
  /** Team Leader (platform ADMIN or org OWNER/ADMIN) sees all team leads. */
  canSeeTeamLeads: boolean;
  /** Platform Houzzat ADMIN — Team Leader / ops. */
  isPlatformAdmin: boolean;
  /** Resolved from ACTIVE WorkspaceMember — never from brokerageAffiliation. */
  workspaceId: string | null;
  workspaceRole: WorkspaceMemberRole | null;
  workspaceMemberStatus: WorkspaceMemberStatus | null;
  workspaceStatus: WorkspaceStatus | null;
  workspaceName: string | null;
  isWorkspaceMember: boolean;
  isWorkspaceCrmAllowed: boolean;
  hasAmbiguousWorkspaceMembership: boolean;
  hasMultipleWorkspaces: boolean;
  requiresWorkspaceSelection: boolean;
  canManageWorkspace: boolean;
  readScope: CrmReadScopeMode;
};

export { parseCrmReadScope, type CrmReadScopeMode };

/** Lightweight staff gate for Agent layout chrome — no brokerage / desk I/O. */
export type AgentGate = {
  user: AgentUser;
  isPlatformAdmin: boolean;
};

/**
 * Security-only CRM entry check (auth + role + soft-disable).
 * Layouts use this so Admin/Agent shells can paint before brokerage work.
 */
export const requireAgentGate = cache(async (): Promise<AgentGate | null> => {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) return null;
  if (!isAgentRole(session.user.role)) return null;

  const isPlatformAdmin = isAdminRole(session.user.role);

  // Platform admins: session role is enough (JWT rechecked periodically).
  if (isPlatformAdmin) {
    if (!session.user.id || !session.user.email) return null;
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        phone: null,
        role: session.user.role,
      },
      isPlatformAdmin: true,
    };
  }

  // Field agents: confirm seat is still active (security).
  return requireAgentUser().then((user) =>
    user ? { user, isPlatformAdmin: false } : null,
  );
});

export const requireAgentUser = cache(async (): Promise<AgentUser | null> => {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) return null;

  let user: AgentUser | null = null;
  if (session.user.id) {
    user = await prisma.user.findFirst({
      where: { id: session.user.id, disabledAt: null },
      select: agentUserSelect,
    });
  }
  if (!user && session.user.email) {
    user = await prisma.user.findFirst({
      where: {
        email: session.user.email.trim().toLowerCase(),
        disabledAt: null,
      },
      select: agentUserSelect,
    });
  }

  if (!user || !isAgentRole(user.role)) return null;

  // Soft-disabled agent seats cannot use CRM (platform admins still can).
  if (!isAdminRole(user.role)) {
    const profile = await prisma.agentProfile.findUnique({
      where: { userId: user.id },
      select: { active: true },
    });
    if (profile && !profile.active) return null;
  }

  return user;
});

function healAgentSeatFlags(userId: string): Promise<unknown> {
  return (async () => {
    const flags = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBuyer: true, isSeller: true },
    });
    if (flags && (flags.isBuyer || flags.isSeller)) {
      await prisma.user.update({
        where: { id: userId },
        data: { isBuyer: false, isSeller: false },
      });
    }
    await prisma.agentProfile.upsert({
      where: { userId },
      create: { userId, active: true },
      update: {},
    });
  })();
}

async function resolveLegacyOrgMembership(
  user: AgentUser,
  brokerageId: string,
): Promise<{ role: OrgMembershipRole }> {
  const isPlatformAdmin = isAdminRole(user.role);
  const membershipRole: OrgMembershipRole = isPlatformAdmin ? "OWNER" : "AGENT";

  const existing = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: brokerageId,
        userId: user.id,
      },
    },
    select: { role: true },
  });

  let membership = existing;
  const qualifiesForOrgSeat = await userQualifiesForLegacyBrokerageOrgSeat(
    user.id,
  );
  if (!existing && qualifiesForOrgSeat) {
    membership = await prisma.organizationMembership.create({
      data: {
        organizationId: brokerageId,
        userId: user.id,
        role: membershipRole,
      },
      select: { role: true },
    });
  } else if (!existing) {
    membership = { role: membershipRole };
  } else if (
    qualifiesForOrgSeat &&
    isPlatformAdmin &&
    existing.role !== "OWNER"
  ) {
    membership = await prisma.organizationMembership.update({
      where: {
        organizationId_userId: {
          organizationId: brokerageId,
          userId: user.id,
        },
      },
      data: { role: "OWNER" },
      select: { role: true },
    });
  }

  return { role: membership?.role ?? membershipRole };
}

async function buildHostnameBoundAgentContext(
  user: AgentUser,
  request: Request,
): Promise<AgentOrgContext | null> {
  const tenant = await tryTenantStaffContext(request, user);
  if (!tenant) return null;

  const brokerage = await ensureBrokerageOrganization();
  const orgMembership = await resolveLegacyOrgMembership(user, brokerage.id);

  const workspaceRow = await prisma.workspace.findUnique({
    where: { id: tenant.workspaceId },
    select: { name: true, status: true },
  });
  if (!workspaceRow || workspaceRow.status !== "ACTIVE") {
    return null;
  }

  scheduleWorkerSideEffect(
    healAgentSeatFlags(user.id).catch((error) => {
      console.error("[agent] seat heal failed", error);
    }),
  );

  return {
    user,
    organizationId: brokerage.id,
    organizationName: brokerage.name,
    organizationIds: [brokerage.id],
    membershipRole: orgMembership.role,
    canSeeTeamLeads: tenant.canSeeTeamLeads,
    isPlatformAdmin: false,
    workspaceId: tenant.workspaceId,
    workspaceRole: tenant.workspaceRole,
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: workspaceRow.status,
    workspaceName: workspaceRow.name,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: tenant.canManageWorkspace,
    readScope: "workspace",
  };
}

/**
 * CRM context for an explicit Request (API routes).
 * Workspace read mode: hostname-bound tenant staff context only.
 */
export async function requireAgentContextForRequest(
  request: Request,
): Promise<AgentOrgContext | null> {
  const user = await requireAgentUser();
  if (!user) return null;

  const hostname = extractTrustedRequestHostname(request);
  if (hostname && !isPlatformAdminSurfaceHostname(hostname)) {
    return buildHostnameBoundAgentContext(user, request);
  }

  if (shouldUseHostnameBoundStaffContext()) {
    return buildHostnameBoundAgentContext(user, request);
  }

  return requireAgentContext();
}

/** Alias for API route handlers. */
export const requireAgentContextFromRequest = requireAgentContextForRequest;

/**
 * CRM context: one brokerage team. Admin = Team Leader; agents are members.
 * Workspace read mode: hostname is authoritative — cookie/org/ADMIN never override.
 * Cached per RSC request so layout + page share one auth/org round-trip.
 */
export const requireAgentContext = cache(
  async (): Promise<AgentOrgContext | null> => {
    const user = await requireAgentUser();
    if (!user) return null;

    const readScope = parseCrmReadScope();

    const request = await buildSyntheticRequestFromHeaders();
    if (request) {
      const hostname = extractTrustedRequestHostname(request);
      if (hostname && !isPlatformAdminSurfaceHostname(hostname)) {
        return buildHostnameBoundAgentContext(user, request);
      }
    }

    if (shouldUseHostnameBoundStaffContext()) {
      if (!request) return null;
      return buildHostnameBoundAgentContext(user, request);
    }

    const isPlatformAdmin = isAdminRole(user.role);
    const brokerage = await ensureBrokerageOrganization();
    const orgMembership = await resolveLegacyOrgMembership(
      user,
      brokerage.id,
    );

    const canSeeTeamLeads =
      isPlatformAdmin ||
      orgMembership.role === "OWNER" ||
      orgMembership.role === "ADMIN";

    const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
    const workspace = await resolveWorkspaceStaffContext(
      user.id,
      activeWorkspaceId,
    );

    if (!isPlatformAdmin) {
      scheduleWorkerSideEffect(
        healAgentSeatFlags(user.id).catch((error) => {
          console.error("[agent] seat heal failed", error);
        }),
      );
    }

    return {
      user,
      organizationId: brokerage.id,
      organizationName: brokerage.name,
      organizationIds: [brokerage.id],
      membershipRole: orgMembership.role,
      canSeeTeamLeads,
      isPlatformAdmin,
      workspaceId: workspace.workspaceId,
      workspaceRole: workspace.workspaceRole,
      workspaceMemberStatus: workspace.workspaceMemberStatus,
      workspaceStatus: workspace.workspaceStatus,
      workspaceName: workspace.workspaceName,
      isWorkspaceMember: workspace.isWorkspaceMember,
      isWorkspaceCrmAllowed: workspace.isWorkspaceCrmAllowed,
      hasAmbiguousWorkspaceMembership: workspace.hasAmbiguousWorkspaceMembership,
      hasMultipleWorkspaces: workspace.hasMultipleWorkspaces,
      requiresWorkspaceSelection: workspace.requiresWorkspaceSelection,
      canManageWorkspace: workspace.canManageWorkspace,
      readScope,
    };
  },
);

/** Lead visibility for list/detail queries. */
export function leadScopeWhere(
  ctx: AgentOrgContext,
  view: "mine" | "pond" | "team" = "mine",
): Prisma.LeadWhereInput {
  return leadScopeWhereScoped(ctx, view);
}

export function canAccessLead(
  ctx: AgentOrgContext,
  lead: {
    organizationId: string | null;
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  return canAccessLeadScoped(ctx, lead);
}

/**
 * Prefer round-robin inside the brokerage.
 * Falls back to any active agent (legacy).
 */
export async function pickAssigneeAgentId(organizationId?: string | null) {
  if (organizationId) {
    const member = await prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        user: {
          role: { in: ["AGENT", "ADMIN"] },
          agentProfile: { active: true },
          disabledAt: null,
        },
      },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (member) return member.userId;
  }

  const agent = await prisma.user.findFirst({
    where: {
      role: "AGENT",
      agentProfile: { active: true },
      disabledAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return agent?.id ?? null;
}

/** Shared brokerage desk for public inbound leads. */
export async function resolveDefaultOrganizationId(): Promise<string | null> {
  const brokerage = await ensureBrokerageOrganization();
  return brokerage.id;
}

/**
 * Public inquiries land in the shared Pond (unassigned) so any agent can claim
 * and the Team Leader can assign from the desk.
 * Org backfill for stray leads runs in ensureBrokerageOrganization side effects —
 * do not updateMany on every public lead POST (Worker hot path).
 */
export async function resolvePublicLeadDesk(
  request?: Request | null,
): Promise<{
  assignedAgentId: null;
  organizationId: string | null;
  workspaceId?: string | null;
}> {
  if (isWorkspacePublicLeadScope() && request) {
    const workspaceId = await resolveTrustedPublicLeadWorkspaceId(request);
    if (!workspaceId) {
      throw new PublicLeadRoutingError(
        "workspace_not_resolved",
        "Public lead desk requires a verified tenant hostname",
      );
    }
    const organizationId = await resolveOrganizationForWorkspaceLeadDesk(
      workspaceId,
    );
    return {
      assignedAgentId: null,
      organizationId,
      workspaceId,
    };
  }

  const organizationId = await resolveDefaultOrganizationId();
  return {
    assignedAgentId: null,
    organizationId,
  };
}

/** Resolve org for a new lead from assignee — workspace-aware when lead scope is workspace. */
export async function resolveOrganizationIdForAssignee(
  assigneeId: string | null | undefined,
  workspaceId?: string | null,
): Promise<string | null> {
  if (isWorkspacePublicLeadScope() && workspaceId) {
    if (assigneeId) {
      await assertAssigneeEligibleForWorkspace(workspaceId, assigneeId);
    }
    return resolveOrganizationForWorkspaceLeadDesk(workspaceId);
  }
  return resolveDefaultOrganizationId();
}

/** @deprecated Prefer canSeeTeamLeads from requireAgentContext */
export function canManageAllLeads(role: string) {
  return isAdminRole(role);
}

/**
 * Response SLA clock: only when pipeline moves NEW_LEAD → ATTEMPTED_CONTACT.
 * Prefer setting firstRespondedAt in the status patch; this is a safe idempotent helper.
 */
export async function markLeadFirstResponse(leadId: string, agentId: string) {
  await prisma.lead.updateMany({
    where: {
      id: leadId,
      firstRespondedAt: null,
      status: "ATTEMPTED_CONTACT",
    },
    data: { firstRespondedAt: new Date() },
  });
  void agentId;
}

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
import { isHouzzatVercelTestHost } from "@/lib/auth/pro-sign-in-routing";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isStaffWorkspaceMemberRole } from "@/lib/mobile/workspace-destination";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import {
  isTenantHostnameBoundCrmHost,
  shouldUseHostnameBoundStaffContext,
  tryTenantStaffContext,
} from "@/lib/tenancy/tenant-staff-context";
import { resolveWorkspaceStaffContext } from "@/lib/workspace-context";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";
import { executeTenantAuthorityShadow } from "@/lib/tenancy/tenant-authority-shadow";

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

  const isPlatformAdmin = isAdminRole(session.user.role);

  // Platform User.role ADMIN is not tenant CRM authority. On tenant hosts,
  // hostname-bound WorkspaceMember is required (requireAgentUser).
  if (isPlatformAdmin && !(await isHostnameBoundStaffAuthorityHost())) {
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

  const user = await requireAgentUser();
  return user ? { user, isPlatformAdmin: false } : null;
});

export const requireAgentUser = cache(async (): Promise<AgentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Phase 3: resolve by session user id only. Email fallback is unsafe when
  // the same email may exist in multiple workspaces.
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, disabledAt: null },
    select: agentUserSelect,
  });

  if (!user) return null;

  // Hostname → WorkspaceDomain → ACTIVE Workspace → ACTIVE WorkspaceMember.
  // User.role=BUYER with OWNER/ADMIN/AGENT membership is tenant staff.
  if (await isHostnameBoundStaffMember(user.id)) return user;

  if (await isHostnameBoundStaffAuthorityHost()) {
    return null;
  }

  if (!isAgentRole(user.role)) {
    return null;
  }

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

async function isHostnameBoundStaffAuthorityHost(): Promise<boolean> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) return false;
  const hostname = extractTrustedRequestHostname(request);
  if (isHouzzatVercelTestHost(hostname)) return true;
  if (!hostname) return false;
  return (
    shouldUseHostnameBoundStaffContext() &&
    isTenantHostnameBoundCrmHost(hostname)
  );
}

async function isHostnameBoundStaffMember(userId: string): Promise<boolean> {
  if (!userId) return false;
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) return false;
  const tenant = await tryTenantStaffContext(request, {
    id: userId,
    role: "",
  });
  if (!tenant) return false;
  return isStaffWorkspaceMemberRole(tenant.workspaceRole);
}

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
    const profile = await prisma.agentProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!profile) {
      await prisma.agentProfile.create({
        data: { userId, active: true },
      });
    }
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

export type AgentContextFromRequestOptions = {
  /**
   * Opt-in DB writes (seat sync / agentProfile heal). Defaults to false.
   * Neon HTTP cannot Prisma.upsert; CRM GET/RSC must never set this true.
   * Auth, role, hostname/workspace membership, and lead access are unchanged.
   */
  sideEffects?: boolean;
};

async function buildHostnameBoundAgentContext(
  user: AgentUser,
  request: Request,
  allowSideEffects: boolean,
): Promise<AgentOrgContext | null> {
  const tenant = await tryTenantStaffContext(request, user);
  if (!tenant) return null;

  const brokerage = await ensureBrokerageOrganization(allowSideEffects);
  const orgMembership = await resolveLegacyOrgMembership(user, brokerage.id);

  const workspaceRow = await prisma.workspace.findUnique({
    where: { id: tenant.workspaceId },
    select: { name: true, status: true },
  });
  if (!workspaceRow || workspaceRow.status !== "ACTIVE") {
    return null;
  }

  if (allowSideEffects) {
    scheduleWorkerSideEffect(
      healAgentSeatFlags(user.id).catch((error) => {
        console.error("[agent] seat heal failed", error);
      }),
    );
  }

  await executeTenantAuthorityShadow({
    location: "buildHostnameBoundAgentContext",
    request,
    user,
    currentDecision: {
      allowed: true,
      workspaceId: tenant.workspaceId,
      workspaceRole: tenant.workspaceRole,
    },
  });

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
  options?: AgentContextFromRequestOptions,
): Promise<AgentOrgContext | null> {
  const allowSideEffects = options?.sideEffects === true;
  const user = await requireAgentUser();
  if (!user) return null;

  if (
    isHouzzatVercelTestHost(extractTrustedRequestHostname(request)) ||
    shouldUseHostnameBoundStaffContext()
  ) {
    return buildHostnameBoundAgentContext(user, request, allowSideEffects);
  }

  return buildLegacyAgentContext(user, allowSideEffects);
}

async function buildLegacyAgentContext(
  user: AgentUser,
  allowSideEffects: boolean,
): Promise<AgentOrgContext | null> {
  const readScope = parseCrmReadScope();
  const request = await buildSyntheticRequestFromHeaders();

  if (shouldUseHostnameBoundStaffContext()) {
    if (!request) return null;
    return buildHostnameBoundAgentContext(user, request, allowSideEffects);
  }

  const isPlatformAdmin = isAdminRole(user.role);
  const brokerage = await ensureBrokerageOrganization(allowSideEffects);
  const orgMembership = await resolveLegacyOrgMembership(user, brokerage.id);

  const canSeeTeamLeads =
    isPlatformAdmin ||
    orgMembership.role === "OWNER" ||
    orgMembership.role === "ADMIN";

  const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const workspace = await resolveWorkspaceStaffContext(
    user.id,
    activeWorkspaceId,
  );

  if (allowSideEffects && !isPlatformAdmin) {
    scheduleWorkerSideEffect(
      healAgentSeatFlags(user.id).catch((error) => {
        console.error("[agent] seat heal failed", error);
      }),
    );
  }

  if (request) {
    await executeTenantAuthorityShadow({
      location: "requireAgentContext_legacy",
      request,
      user,
      currentDecision: {
        allowed: true,
        workspaceId: workspace.workspaceId,
        workspaceRole: workspace.workspaceRole,
      },
    });
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
    const request = await buildSyntheticRequestFromHeaders();
    if (
      request &&
      (isHouzzatVercelTestHost(extractTrustedRequestHostname(request)) ||
        shouldUseHostnameBoundStaffContext())
    ) {
      return buildHostnameBoundAgentContext(user, request, false);
    }
    return buildLegacyAgentContext(user, false);
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

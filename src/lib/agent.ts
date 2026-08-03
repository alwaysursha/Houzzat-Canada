import type { OrgMembershipRole, Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { ensureBrokerageOrganization } from "@/lib/agent/brokerage";
import { isAdminRole, isAgentRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

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
};

export async function requireAgentUser(): Promise<AgentUser | null> {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) return null;

  let user: AgentUser | null = null;
  if (session.user.id) {
    user = await prisma.user.findFirst({
      where: { id: session.user.id },
      select: agentUserSelect,
    });
  }
  if (!user && session.user.email) {
    user = await prisma.user.findFirst({
      where: { email: session.user.email.trim().toLowerCase() },
      select: agentUserSelect,
    });
  }

  if (!user || !isAgentRole(user.role)) return null;
  return user;
}

/**
 * CRM context: one brokerage team. Admin = Team Leader; agents are members.
 * Personal “My team” orgs are not used for the desk.
 */
export async function requireAgentContext(): Promise<AgentOrgContext | null> {
  const user = await requireAgentUser();
  if (!user) return null;

  const isPlatformAdmin = isAdminRole(user.role);
  const brokerage = await ensureBrokerageOrganization();

  const membershipRole: OrgMembershipRole = isPlatformAdmin ? "OWNER" : "AGENT";

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: brokerage.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: brokerage.id,
      userId: user.id,
      role: membershipRole,
    },
    update: isPlatformAdmin ? { role: "OWNER" } : {},
  });

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: brokerage.id,
        userId: user.id,
      },
    },
    select: { role: true },
  });

  const canSeeTeamLeads =
    isPlatformAdmin ||
    membership?.role === "OWNER" ||
    membership?.role === "ADMIN";

  return {
    user,
    organizationId: brokerage.id,
    organizationName: brokerage.name,
    organizationIds: [brokerage.id],
    membershipRole: membership?.role ?? membershipRole,
    canSeeTeamLeads,
    isPlatformAdmin,
  };
}

/** Lead visibility for list/detail queries. */
export function leadScopeWhere(
  ctx: AgentOrgContext,
  view: "mine" | "pond" | "team" = "mine",
): Prisma.LeadWhereInput {
  const org = { organizationId: { in: ctx.organizationIds } };

  if (view === "pond") {
    return { ...org, assignedAgentId: null };
  }

  if (view === "team" && ctx.canSeeTeamLeads) {
    return org;
  }

  // Default: my leads + claimable pond in the brokerage.
  return {
    ...org,
    OR: [{ assignedAgentId: ctx.user.id }, { assignedAgentId: null }],
  };
}

export function canAccessLead(
  ctx: AgentOrgContext,
  lead: { organizationId: string | null; assignedAgentId: string | null },
): boolean {
  if (ctx.isPlatformAdmin || ctx.canSeeTeamLeads) return true;
  if (
    lead.organizationId &&
    !ctx.organizationIds.includes(lead.organizationId)
  ) {
    return false;
  }
  if (!lead.assignedAgentId) return true;
  return lead.assignedAgentId === ctx.user.id;
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
 */
export async function resolvePublicLeadDesk(): Promise<{
  assignedAgentId: null;
  organizationId: string | null;
}> {
  const organizationId = await resolveDefaultOrganizationId();
  if (organizationId) {
    await prisma.lead.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
  }
  return {
    assignedAgentId: null,
    organizationId,
  };
}

/** Resolve org for a new lead from assignee — always the brokerage desk. */
export async function resolveOrganizationIdForAssignee(
  _assigneeId: string | null | undefined,
): Promise<string | null> {
  return resolveDefaultOrganizationId();
}

/** @deprecated Prefer canSeeTeamLeads from requireAgentContext */
export function canManageAllLeads(role: string) {
  return isAdminRole(role);
}

export async function markLeadFirstResponse(leadId: string, agentId: string) {
  await prisma.lead.updateMany({
    where: { id: leadId, firstRespondedAt: null },
    data: { firstRespondedAt: new Date() },
  });
  void agentId;
}

import type { OrgMembershipRole, Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
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
  /** Primary desk org (prefer shared brokerage when present). */
  organizationId: string;
  organizationName: string;
  /** Every org this user belongs to — used for lead visibility. */
  organizationIds: string[];
  membershipRole: OrgMembershipRole;
  /** OWNER / org ADMIN see all team leads. */
  canSeeTeamLeads: boolean;
  /** Platform Houzzat ADMIN — ops override, not a team seat. */
  isPlatformAdmin: boolean;
};

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "team"
  );
}

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
 * Ensure the agent has a home Organization (solo = org of one).
 * Returns full CRM context for scoping queries.
 */
export async function requireAgentContext(): Promise<AgentOrgContext | null> {
  const user = await requireAgentUser();
  if (!user) return null;

  const isPlatformAdmin = isAdminRole(user.role);

  // Join shared brokerage desk so agents see the same pond as admin.
  const sharedOrgId = await resolveDefaultOrganizationId();
  if (sharedOrgId && user.role === "AGENT") {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: sharedOrgId,
          userId: user.id,
        },
      },
      create: {
        organizationId: sharedOrgId,
        userId: user.id,
        role: "AGENT",
      },
      update: {},
    });
  }

  let memberships = await prisma.organizationMembership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!memberships.length) {
    const created = await ensurePersonalOrganization(user);
    memberships = [created];
  }

  const sharedMembership = sharedOrgId
    ? memberships.find((m) => m.organizationId === sharedOrgId)
    : null;
  const primary = sharedMembership ?? memberships[0]!;
  const membershipRole = primary.role;
  const canSeeTeamLeads =
    isPlatformAdmin ||
    memberships.some((m) => m.role === "OWNER" || m.role === "ADMIN");

  return {
    user,
    organizationId: primary.organization.id,
    organizationName: primary.organization.name,
    organizationIds: memberships.map((m) => m.organizationId),
    membershipRole,
    canSeeTeamLeads,
    isPlatformAdmin,
  };
}

async function ensurePersonalOrganization(user: AgentUser) {
  const base = slugify(user.name || user.email.split("@")[0] || "agent");
  let slug = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }

  const org = await prisma.organization.create({
    data: {
      name: user.name ? `${user.name}'s team` : "My team",
      slug,
      memberships: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
    select: { id: true, name: true },
  });

  // Attach orphan leads assigned to this agent.
  await prisma.lead.updateMany({
    where: {
      assignedAgentId: user.id,
      organizationId: null,
    },
    data: { organizationId: org.id },
  });

  const membership = await prisma.organizationMembership.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    include: { organization: { select: { id: true, name: true } } },
  });

  return membership;
}

/** Lead visibility for list/detail queries. */
export function leadScopeWhere(
  ctx: AgentOrgContext,
  view: "mine" | "pond" | "team" = "mine",
): Prisma.LeadWhereInput {
  // Platform Houzzat ADMIN can survey the whole desk when needed.
  if (ctx.isPlatformAdmin) {
    if (view === "pond") return { assignedAgentId: null };
    if (view === "team") return {};
    return {
      OR: [{ assignedAgentId: ctx.user.id }, { assignedAgentId: null }],
    };
  }

  const orgIds = ctx.organizationIds.length
    ? ctx.organizationIds
    : [ctx.organizationId];
  const org = { organizationId: { in: orgIds } };

  if (view === "pond") {
    return { ...org, assignedAgentId: null };
  }

  if (view === "team" && ctx.canSeeTeamLeads) {
    return org;
  }

  // Default: my leads + pond (claimable)
  return {
    ...org,
    OR: [{ assignedAgentId: ctx.user.id }, { assignedAgentId: null }],
  };
}

export function canAccessLead(
  ctx: AgentOrgContext,
  lead: { organizationId: string | null; assignedAgentId: string | null },
): boolean {
  if (ctx.isPlatformAdmin) return true;
  const orgIds = ctx.organizationIds.length
    ? ctx.organizationIds
    : [ctx.organizationId];
  if (lead.organizationId && !orgIds.includes(lead.organizationId)) {
    return false;
  }
  if (ctx.canSeeTeamLeads) return true;
  if (!lead.assignedAgentId) return true;
  return lead.assignedAgentId === ctx.user.id;
}

/**
 * Prefer round-robin inside the default / first org that has active agents.
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

/** Shared brokerage / default desk for public inbound leads. */
export async function resolveDefaultOrganizationId(): Promise<string | null> {
  const fromEnv = process.env.DEFAULT_ORGANIZATION_ID?.trim();
  if (fromEnv) {
    const exists = await prisma.organization.findUnique({
      where: { id: fromEnv },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const withAgents = await prisma.organizationMembership.findFirst({
    where: {
      user: {
        role: "AGENT",
        disabledAt: null,
        agentProfile: { active: true },
      },
    },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  if (withAgents) return withAgents.organizationId;

  const any = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return any?.id ?? null;
}

/**
 * Public inquiries land in the shared Pond (unassigned) so any agent can claim
 * and admins can assign from the desk.
 */
export async function resolvePublicLeadDesk(): Promise<{
  assignedAgentId: null;
  organizationId: string | null;
}> {
  const organizationId = await resolveDefaultOrganizationId();
  if (organizationId) {
    // Attach orphan desk leads so agents on the shared org can see them.
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

/** Resolve org for a new lead from assignee membership. */
export async function resolveOrganizationIdForAssignee(
  assigneeId: string | null | undefined,
): Promise<string | null> {
  if (!assigneeId) return resolveDefaultOrganizationId();

  const sharedOrgId = await resolveDefaultOrganizationId();
  if (sharedOrgId) {
    const onShared = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: sharedOrgId,
          userId: assigneeId,
        },
      },
      select: { organizationId: true },
    });
    if (onShared) return sharedOrgId;
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: assigneeId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  if (membership) return membership.organizationId;

  const user = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: agentUserSelect,
  });
  if (!user || !isAgentRole(user.role)) return null;
  const created = await ensurePersonalOrganization(user);
  return created.organizationId;
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

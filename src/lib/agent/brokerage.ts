import { cookies } from "next/headers";
import {
  DESK_AGENT_ALL,
  DESK_AGENT_COOKIE,
} from "@/lib/agent/desk-constants";
import { SITE_NAME } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export { DESK_AGENT_ALL, DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";

export type TeamAgentOption = {
  id: string;
  name: string | null;
  email: string;
  role: "AGENT" | "ADMIN";
};

/**
 * One brokerage org for the install: Team Leader (Admin) + Agents.
 * Migrates stray personal-org memberships/leads/tasks into this desk.
 */
export async function ensureBrokerageOrganization(): Promise<{
  id: string;
  name: string;
}> {
  const fromEnv = process.env.DEFAULT_ORGANIZATION_ID?.trim();
  let org = fromEnv
    ? await prisma.organization.findUnique({
        where: { id: fromEnv },
        select: { id: true, name: true },
      })
    : null;

  if (!org) {
    // Prefer an org that already has agent seats.
    const withAgents = await prisma.organizationMembership.findFirst({
      where: {
        user: { role: "AGENT", disabledAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        organization: { select: { id: true, name: true } },
      },
    });
    org = withAgents?.organization ?? null;
  }

  if (!org) {
    org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  }

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: `${SITE_NAME} Team`,
        slug: "houzzat-team",
      },
      select: { id: true, name: true },
    });
  } else if (
    /'s team$/i.test(org.name) ||
    org.name === "My team"
  ) {
    // Soft-rename personal-looking desks to the brokerage label.
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { name: `${SITE_NAME} Team` },
      select: { id: true, name: true },
    });
  }

  const brokerageId = org.id;

  // Team leaders (platform ADMIN) → OWNER on the brokerage.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", disabledAt: null },
    select: { id: true },
  });
  for (const admin of admins) {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: brokerageId,
          userId: admin.id,
        },
      },
      create: {
        organizationId: brokerageId,
        userId: admin.id,
        role: "OWNER",
      },
      update: { role: "OWNER" },
    });
  }

  // Field agents → AGENT seats on the same brokerage (no personal teams).
  const agents = await prisma.user.findMany({
    where: { role: "AGENT", disabledAt: null },
    select: { id: true },
  });
  for (const agent of agents) {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: brokerageId,
          userId: agent.id,
        },
      },
      create: {
        organizationId: brokerageId,
        userId: agent.id,
        role: "AGENT",
      },
      update: {},
    });
  }

  // Pull CRM data into the single desk.
  await prisma.lead.updateMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: { not: brokerageId } }],
    },
    data: { organizationId: brokerageId },
  });
  await prisma.agentTask.updateMany({
    where: { organizationId: { not: brokerageId } },
    data: { organizationId: brokerageId },
  });

  return org;
}

export async function listTeamAgents(
  organizationId: string,
): Promise<TeamAgentOption[]> {
  const members = await prisma.organizationMembership.findMany({
    where: {
      organizationId,
      user: {
        disabledAt: null,
        role: { in: ["AGENT", "ADMIN"] },
      },
    },
    select: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members
    .filter((m) => m.user.role === "AGENT" || m.user.role === "ADMIN")
    .map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role as "AGENT" | "ADMIN",
    }));
}

/**
 * Which agent's desk is in view.
 * Field agents always see their own desk.
 * Team Leaders (Admin) pick a desk from Admin HQ; CRM respects that cookie.
 */
export async function resolveDeskView(ctx: {
  user: { id: string };
  organizationId: string;
  canSeeTeamLeads: boolean;
}): Promise<{
  /** null = whole team overview */
  deskAgentId: string | null;
  teamAgents: TeamAgentOption[];
  deskLabel: string;
}> {
  const teamAgents = await listTeamAgents(ctx.organizationId);
  const fieldAgents = teamAgents.filter((a) => a.role === "AGENT");

  if (!ctx.canSeeTeamLeads) {
    return {
      deskAgentId: ctx.user.id,
      teamAgents: fieldAgents,
      deskLabel: "My desk",
    };
  }

  const jar = await cookies();
  const raw = jar.get(DESK_AGENT_COOKIE)?.value?.trim() || DESK_AGENT_ALL;

  if (raw === DESK_AGENT_ALL) {
    return {
      deskAgentId: null,
      teamAgents: fieldAgents,
      deskLabel: "Team overview",
    };
  }

  const match = fieldAgents.find((a) => a.id === raw);
  if (match) {
    return {
      deskAgentId: match.id,
      teamAgents: fieldAgents,
      deskLabel: match.name || match.email,
    };
  }

  return {
    deskAgentId: null,
    teamAgents: fieldAgents,
    deskLabel: "Team overview",
  };
}

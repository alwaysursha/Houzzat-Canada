import { cookies } from "next/headers";
import {
  DESK_AGENT_ALL,
  DESK_AGENT_COOKIE,
} from "@/lib/agent/desk-constants";
import { SITE_NAME } from "@/lib/constants";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";

export { DESK_AGENT_ALL, DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";

export type TeamAgentOption = {
  id: string;
  name: string | null;
  email: string;
  role: "AGENT" | "ADMIN";
};

let brokerageCache: { org: { id: string; name: string }; at: number } | null =
  null;
const BROKERAGE_CACHE_MS = 5 * 60 * 1000;

/**
 * One brokerage org for the install: Team Leader (Admin) + Agents.
 * Migrates stray personal-org memberships/leads/tasks into this desk.
 * Result is cached briefly — seat/migration sync does not need to run every request.
 */
async function resolveBrokerageOrg(): Promise<{ id: string; name: string }> {
  const fromEnv = process.env.DEFAULT_ORGANIZATION_ID?.trim();
  let org = fromEnv
    ? await prisma.organization.findUnique({
        where: { id: fromEnv },
        select: { id: true, name: true },
      })
    : null;

  if (!org) {
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
    return prisma.organization.create({
      data: {
        name: `${SITE_NAME} Team`,
        slug: "houzzat-team",
      },
      select: { id: true, name: true },
    });
  }

  if (/'s team$/i.test(org.name) || org.name === "My team") {
    return prisma.organization.update({
      where: { id: org.id },
      data: { name: `${SITE_NAME} Team` },
      select: { id: true, name: true },
    });
  }

  return org;
}

async function syncBrokerageSeats(brokerageId: string): Promise<void> {
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
}

export async function ensureBrokerageOrganization(): Promise<{
  id: string;
  name: string;
}> {
  if (
    brokerageCache &&
    Date.now() - brokerageCache.at < BROKERAGE_CACHE_MS
  ) {
    return brokerageCache.org;
  }

  const org = await resolveBrokerageOrg();
  brokerageCache = { org, at: Date.now() };
  // Seat/lead migration must not 500 Admin HQ if a Worker query fails.
  scheduleWorkerSideEffect(
    syncBrokerageSeats(org.id).catch((error) => {
      console.error("[brokerage] seat sync failed", error);
    }),
  );
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
  /** Pass from the layout after reading cookies() — avoids cookies() after Prisma I/O. */
  deskCookie?: string | null;
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

  const raw =
    (ctx.deskCookie !== undefined
      ? ctx.deskCookie
      : (await cookies()).get(DESK_AGENT_COOKIE)?.value
    )?.trim() || DESK_AGENT_ALL;

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

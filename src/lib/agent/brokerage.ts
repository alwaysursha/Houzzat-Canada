import { cache } from "react";
import { cookies } from "next/headers";
import type { OrgMembershipRole } from "@prisma/client";
import { DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";
import {
  isWorkspaceScopedBrokerageSeatSync,
  resolveHouzzatWorkspaceIdForOrgRewrite,
  resolveLegacyBrokerageSeatTargets,
} from "@/lib/agent/brokerage-seat-sync";
import { resolveDeskViewFromFieldAgents } from "@/lib/agent/resolve-desk-view";
import { isActiveHostnameBoundReadMode } from "@/lib/crm-read-scope";
import { SITE_NAME } from "@/lib/constants";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";

export { DESK_AGENT_ALL, DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";
export {
  launchpadIdentityPresentation,
  resolveDeskViewFromFieldAgents,
} from "@/lib/agent/resolve-desk-view";

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
 * Seat/lead migration is opt-in (syncSeats=true) — never on CRM GET/RSC.
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

/**
 * Neon HTTP cannot Prisma.upsert (it starts an interactive transaction).
 * Sequential find + create/update is one statement each.
 */
async function ensureOrganizationMembership(input: {
  organizationId: string;
  userId: string;
  role: OrgMembershipRole;
}) {
  const existing = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { role: true },
  });
  if (!existing) {
    await prisma.organizationMembership.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
      },
    });
    return;
  }
  if (input.role === "OWNER" && existing.role !== "OWNER") {
    await prisma.organizationMembership.update({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
      data: { role: "OWNER" },
    });
  }
}

async function syncBrokerageSeats(brokerageId: string): Promise<void> {
  const seatTargets = await resolveLegacyBrokerageSeatTargets();
  for (const target of seatTargets) {
    await ensureOrganizationMembership({
      organizationId: brokerageId,
      userId: target.userId,
      role: target.orgRole,
    });
  }

  if (isWorkspaceScopedBrokerageSeatSync()) {
    const houzzatWorkspaceId = await resolveHouzzatWorkspaceIdForOrgRewrite();
    if (houzzatWorkspaceId) {
      await prisma.lead.updateMany({
        where: {
          OR: [
            {
              workspaceId: null,
              OR: [
                { organizationId: null },
                { organizationId: { not: brokerageId } },
              ],
            },
            {
              workspaceId: houzzatWorkspaceId,
              organizationId: { not: brokerageId },
            },
          ],
        },
        data: { organizationId: brokerageId },
      });
      await prisma.agentTask.updateMany({
        where: {
          OR: [
            {
              workspaceId: null,
              organizationId: { not: brokerageId },
            },
            {
              workspaceId: houzzatWorkspaceId,
              organizationId: { not: brokerageId },
            },
          ],
        },
        data: { organizationId: brokerageId },
      });
    }
    return;
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

export const ensureBrokerageOrganization = cache(
  async function ensureBrokerageOrganization(
    /**
     * Opt-in only. CRM GET/RSC must leave this false: Neon HTTP cannot run
     * Prisma upsert/transactions, and bulk lead rewrite races Lead Profile.
     */
    syncSeats: boolean = false,
  ): Promise<{
    id: string;
    name: string;
  }> {
    const cached =
      brokerageCache && Date.now() - brokerageCache.at < BROKERAGE_CACHE_MS
        ? brokerageCache.org
        : null;
    const org = cached ?? (await resolveBrokerageOrg());
    if (!cached) {
      brokerageCache = { org, at: Date.now() };
    }
    if (!syncSeats) {
      return org;
    }
    // Seat/lead migration must not 500 the page if a Worker query fails.
    scheduleWorkerSideEffect(
      syncBrokerageSeats(org.id).catch((error) => {
        console.error("[brokerage] seat sync failed", error);
      }),
    );
    return org;
  },
);

export const listTeamAgents = cache(async function listTeamAgents(
  organizationId: string,
  workspaceId?: string | null,
): Promise<TeamAgentOption[]> {
  if (isActiveHostnameBoundReadMode() && workspaceId) {
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
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
});

/**
 * Desk resolution keyed by primitives so layout + page share one result
 * (React cache uses Object.is — object ctx args would miss).
 */
const resolveDeskViewCached = cache(
  async (
    organizationId: string,
    workspaceId: string | null | undefined,
    userId: string,
    canSeeTeamLeads: boolean,
    deskCookie: string | null,
  ): Promise<{
    deskAgentId: string | null;
    teamAgents: TeamAgentOption[];
    deskLabel: string;
  }> => {
    const teamAgents = await listTeamAgents(organizationId, workspaceId);
    const fieldAgents = teamAgents.filter((a) => a.role === "AGENT");
    const resolved = resolveDeskViewFromFieldAgents({
      userId,
      canSeeTeamLeads,
      deskCookie,
      fieldAgents,
    });
    return {
      deskAgentId: resolved.deskAgentId,
      teamAgents: fieldAgents,
      deskLabel: resolved.deskLabel,
    };
  },
);

/**
 * Which agent's desk is in view.
 * Field agents always see their own desk.
 * Team Leaders (Admin) who are field agents default to their own desk when
 * no explicit cookie is set; Team overview requires explicit "all".
 */
export async function resolveDeskView(ctx: {
  user: { id: string };
  organizationId: string;
  workspaceId?: string | null;
  canSeeTeamLeads: boolean;
  /** Pass from the layout after reading cookies() — avoids cookies() after Prisma I/O. */
  deskCookie?: string | null;
}): Promise<{
  /** null = whole team overview */
  deskAgentId: string | null;
  teamAgents: TeamAgentOption[];
  deskLabel: string;
}> {
  const deskCookie =
    ctx.deskCookie !== undefined
      ? ctx.deskCookie
      : ((await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null);

  return resolveDeskViewCached(
    ctx.organizationId,
    ctx.workspaceId,
    ctx.user.id,
    ctx.canSeeTeamLeads,
    deskCookie,
  );
}

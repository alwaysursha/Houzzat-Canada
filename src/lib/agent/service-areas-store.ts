/**
 * Read and write AgentProfile.markets for the signed-in agent.
 * Demo region is copied only while the agent has not saved areas yet.
 */

import type { PrismaClient } from "@prisma/client";
import { nextMarketsAfterProspectSeed } from "@/lib/agent/service-areas";

type ServiceAreaDb = Pick<
  PrismaClient,
  "agentProfile" | "workspaceMember" | "commercialOffer"
>;

export async function seedOwnerServiceAreasFromProspect(
  db: ServiceAreaDb,
  userId: string,
  prospectRegion: string | null | undefined,
): Promise<void> {
  const profile = await db.agentProfile.findUnique({
    where: { userId },
    select: { markets: true, marketsCustomizedAt: true },
  });
  const next = nextMarketsAfterProspectSeed({
    markets: profile?.markets ?? [],
    customized: profile?.marketsCustomizedAt != null,
    prospectRegion,
  });
  if (!next.seeded) return;
  await db.agentProfile.upsert({
    where: { userId },
    create: { userId, active: true, markets: next.markets },
    update: { markets: next.markets },
  });
}

export async function loadAgentServiceAreas(
  db: ServiceAreaDb,
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  const profile = await db.agentProfile.findUnique({
    where: { userId },
    select: { markets: true, marketsCustomizedAt: true },
  });
  const markets = profile?.markets ?? [];
  if (profile?.marketsCustomizedAt != null || markets.length > 0) {
    return markets;
  }

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (member?.role !== "OWNER") return [];

  const offer = await db.commercialOffer.findFirst({
    where: { workspaceId },
    orderBy: { acceptedAt: "desc" },
    select: { prospect: { select: { region: true } } },
  });
  const next = nextMarketsAfterProspectSeed({
    markets,
    customized: false,
    prospectRegion: offer?.prospect.region ?? null,
  });
  if (!next.seeded) return [];
  await db.agentProfile.upsert({
    where: { userId },
    create: { userId, active: true, markets: next.markets },
    update: { markets: next.markets },
  });
  return next.markets;
}

export async function saveAgentServiceAreas(
  db: Pick<PrismaClient, "agentProfile">,
  userId: string,
  markets: string[],
): Promise<string[]> {
  const saved = await db.agentProfile.upsert({
    where: { userId },
    create: {
      userId,
      active: true,
      markets,
      marketsCustomizedAt: new Date(),
    },
    update: {
      markets,
      marketsCustomizedAt: new Date(),
    },
    select: { markets: true },
  });
  return saved.markets;
}

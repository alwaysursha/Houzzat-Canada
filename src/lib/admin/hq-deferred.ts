import { liveSinceDate } from "@/lib/admin/activity";
import { prisma } from "@/lib/prisma";
import { getAdminMlsPulse } from "@/lib/proptx/sync-health";

const emptySync = {
  provider: "proptx" as const,
  listingCount: 0,
  message: "MLS pulse unavailable.",
};

export async function loadAdminJourneyFeed() {
  return prisma.activityEvent
    .findMany({
      where: { type: { not: "HEARTBEAT" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        path: true,
        title: true,
        mlsNumber: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        visitor: { select: { visitorKey: true } },
      },
    })
    .catch((error) => {
      console.error("[admin] journey feed failed", error);
      return [];
    });
}

export async function loadAdminMlsPulse() {
  return getAdminMlsPulse().catch((error) => {
    console.error("[admin] MLS pulse failed", error);
    return emptySync;
  });
}

export async function loadAdminSecondaryCounts() {
  const [landingCount, adCount] = await Promise.all([
    prisma.landingPage.count().catch(() => 0),
    prisma.adCampaign.count().catch(() => 0),
  ]);
  return { landingCount, adCount };
}

/** First-paint HQ stats only — cheap counts, no findMany feeds. */
export async function loadAdminCriticalStats() {
  const since = liveSinceDate();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    liveVisitors,
    peopleCount,
    agentsCount,
    buyersCount,
    sellersCount,
    events24h,
    leads24h,
  ] = await Promise.all([
    prisma.siteSession
      .count({ where: { lastSeenAt: { gte: since } } })
      .catch(() => 0),
    prisma.user.count().catch(() => 0),
    prisma.user.count({ where: { role: "AGENT" } }).catch(() => 0),
    prisma.user
      .count({ where: { isBuyer: true, role: { in: ["BUYER", "SELLER"] } } })
      .catch(() => 0),
    prisma.user.count({ where: { isSeller: true } }).catch(() => 0),
    prisma.activityEvent
      .count({ where: { createdAt: { gte: dayAgo } } })
      .catch(() => 0),
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
  ]);

  return {
    liveVisitors,
    peopleCount,
    agentsCount,
    buyersCount,
    sellersCount,
    events24h,
    leads24h,
  };
}

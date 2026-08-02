import { prisma } from "@/lib/prisma";

const ONLINE_MS = 3 * 60 * 1000;
const HOT_VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export type HotnessSnapshot = {
  hotness: number;
  views24h: number;
  distinctListings24h: number;
  isOnline: boolean;
  lastSeenAt: Date | null;
  binge: boolean;
  slaHoursOpen: number | null;
};

/** Lead quality / urgency signals for Launchpad + table. */
export async function computeHotness(input: {
  leadId: string;
  customerId: string | null;
  status: string;
  score: number;
  createdAt: Date;
  firstRespondedAt: Date | null;
}): Promise<HotnessSnapshot> {
  const since = new Date(Date.now() - HOT_VIEW_WINDOW_MS);
  let views24h = 0;
  let distinctListings24h = 0;
  let lastSeenAt: Date | null = null;
  let isOnline = false;

  if (input.customerId) {
    const [views, lastEvent, lastSession] = await Promise.all([
      prisma.listingView.findMany({
        where: { userId: input.customerId, createdAt: { gte: since } },
        select: { mlsNumber: true, createdAt: true },
      }),
      prisma.activityEvent.findFirst({
        where: { userId: input.customerId, type: { not: "HEARTBEAT" } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.siteSession.findFirst({
        where: { visitor: { userId: input.customerId } },
        orderBy: { lastSeenAt: "desc" },
        select: { lastSeenAt: true },
      }),
    ]);

    views24h = views.length;
    distinctListings24h = new Set(views.map((v) => v.mlsNumber)).size;
    lastSeenAt = lastSession?.lastSeenAt ?? lastEvent?.createdAt ?? null;
    if (lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_MS) {
      isOnline = true;
    }
  }

  const binge = distinctListings24h >= 3;
  let hotness = input.score;
  hotness += Math.min(40, views24h * 3);
  hotness += Math.min(30, distinctListings24h * 8);
  if (isOnline) hotness += 25;
  if (binge) hotness += 20;
  if (input.status === "NEW_LEAD" && !input.firstRespondedAt) hotness += 15;

  let slaHoursOpen: number | null = null;
  if (input.status === "NEW_LEAD" && !input.firstRespondedAt) {
    slaHoursOpen =
      (Date.now() - input.createdAt.getTime()) / (60 * 60 * 1000);
  }

  return {
    hotness: Math.round(hotness),
    views24h,
    distinctListings24h,
    isOnline,
    lastSeenAt,
    binge,
    slaHoursOpen,
  };
}

export async function computeHotnessMap(
  leads: Array<{
    id: string;
    customerId: string | null;
    status: string;
    score: number;
    createdAt: Date;
    firstRespondedAt: Date | null;
  }>,
): Promise<Map<string, HotnessSnapshot>> {
  const map = new Map<string, HotnessSnapshot>();
  // Bound concurrency for Launchpad/table batches.
  const chunk = 12;
  for (let i = 0; i < leads.length; i += chunk) {
    const slice = leads.slice(i, i + chunk);
    const rows = await Promise.all(
      slice.map((l) =>
        computeHotness({
          leadId: l.id,
          customerId: l.customerId,
          status: l.status,
          score: l.score,
          createdAt: l.createdAt,
          firstRespondedAt: l.firstRespondedAt,
        }),
      ),
    );
    slice.forEach((l, idx) => map.set(l.id, rows[idx]!));
  }
  return map;
}

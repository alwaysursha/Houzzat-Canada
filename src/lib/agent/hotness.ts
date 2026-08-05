import { prisma } from "@/lib/prisma";

/** Presence window used for ONLINE badge + Online Leads desk. */
export const ONLINE_MS = 3 * 60 * 1000;
const HOT_VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Look back for last non-heartbeat activity when batching. */
const LAST_EVENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Signed-in users with a site session (or visitor) heartbeat in the ONLINE window.
 * Heartbeats only fire on the consumer site (not /agent or /admin).
 */
export async function findOnlineUserIds(): Promise<string[]> {
  const since = new Date(Date.now() - ONLINE_MS);
  const visitors = await prisma.siteVisitor.findMany({
    where: {
      userId: { not: null },
      lastSeenAt: { gte: since },
    },
    select: { userId: true },
    take: 500,
  });
  return [
    ...new Set(
      visitors
        .map((v) => v.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export type HotnessSnapshot = {
  hotness: number;
  views24h: number;
  distinctListings24h: number;
  isOnline: boolean;
  lastSeenAt: Date | null;
  binge: boolean;
  slaHoursOpen: number | null;
};

type HotLeadInput = {
  leadId: string;
  customerId: string | null;
  status: string;
  score: number;
  createdAt: Date;
  firstRespondedAt: Date | null;
};

function scoreHotness(
  input: HotLeadInput,
  signals: {
    views24h: number;
    distinctListings24h: number;
    lastSeenAt: Date | null;
  },
): HotnessSnapshot {
  const isOnline = Boolean(
    signals.lastSeenAt &&
      Date.now() - signals.lastSeenAt.getTime() < ONLINE_MS,
  );
  const binge = signals.distinctListings24h >= 3;
  let hotness = input.score;
  hotness += Math.min(40, signals.views24h * 3);
  hotness += Math.min(30, signals.distinctListings24h * 8);
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
    views24h: signals.views24h,
    distinctListings24h: signals.distinctListings24h,
    isOnline,
    lastSeenAt: signals.lastSeenAt,
    binge,
    slaHoursOpen,
  };
}

/** Lead quality / urgency signals for a single lead (profile popup). */
export async function computeHotness(
  input: HotLeadInput,
): Promise<HotnessSnapshot> {
  const map = await computeHotnessMap([
    {
      id: input.leadId,
      customerId: input.customerId,
      status: input.status,
      score: input.score,
      createdAt: input.createdAt,
      firstRespondedAt: input.firstRespondedAt,
    },
  ]);
  return (
    map.get(input.leadId) ??
    scoreHotness(input, {
      views24h: 0,
      distinctListings24h: 0,
      lastSeenAt: null,
    })
  );
}

/**
 * Batch hotness for Launchpad / leads table — a few queries instead of 3×N.
 */
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
  if (leads.length === 0) return map;

  const customerIds = [
    ...new Set(
      leads
        .map((l) => l.customerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const viewsByUser = new Map<string, { count: number; mls: Set<string> }>();
  const lastEventByUser = new Map<string, Date>();
  const lastSessionByUser = new Map<string, Date>();

  if (customerIds.length > 0) {
    const viewSince = new Date(Date.now() - HOT_VIEW_WINDOW_MS);
    const eventSince = new Date(Date.now() - LAST_EVENT_WINDOW_MS);

    const [views, events, visitors] = await Promise.all([
      prisma.listingView.findMany({
        where: { userId: { in: customerIds }, createdAt: { gte: viewSince } },
        select: { userId: true, mlsNumber: true },
      }),
      prisma.activityEvent.findMany({
        where: {
          userId: { in: customerIds },
          type: { not: "HEARTBEAT" },
          createdAt: { gte: eventSince },
        },
        select: { userId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(customerIds.length * 8, 80), 4000),
      }),
      prisma.siteVisitor.findMany({
        where: { userId: { in: customerIds } },
        select: {
          userId: true,
          sessions: {
            orderBy: { lastSeenAt: "desc" },
            take: 1,
            select: { lastSeenAt: true },
          },
        },
      }),
    ]);

    for (const row of views) {
      if (!row.userId) continue;
      const bucket = viewsByUser.get(row.userId) ?? {
        count: 0,
        mls: new Set<string>(),
      };
      bucket.count += 1;
      bucket.mls.add(row.mlsNumber);
      viewsByUser.set(row.userId, bucket);
    }

    for (const row of events) {
      if (!row.userId || lastEventByUser.has(row.userId)) continue;
      lastEventByUser.set(row.userId, row.createdAt);
    }

    for (const visitor of visitors) {
      if (!visitor.userId) continue;
      const at = visitor.sessions[0]?.lastSeenAt;
      if (!at) continue;
      const prev = lastSessionByUser.get(visitor.userId);
      if (!prev || at > prev) lastSessionByUser.set(visitor.userId, at);
    }
  }

  for (const lead of leads) {
    const cid = lead.customerId;
    const viewBucket = cid ? viewsByUser.get(cid) : undefined;
    const sessionAt = cid ? (lastSessionByUser.get(cid) ?? null) : null;
    const eventAt = cid ? (lastEventByUser.get(cid) ?? null) : null;
    const lastSeenAt =
      sessionAt && eventAt
        ? sessionAt > eventAt
          ? sessionAt
          : eventAt
        : (sessionAt ?? eventAt);

    map.set(
      lead.id,
      scoreHotness(
        {
          leadId: lead.id,
          customerId: lead.customerId,
          status: lead.status,
          score: lead.score,
          createdAt: lead.createdAt,
          firstRespondedAt: lead.firstRespondedAt,
        },
        {
          views24h: viewBucket?.count ?? 0,
          distinctListings24h: viewBucket?.mls.size ?? 0,
          lastSeenAt,
        },
      ),
    );
  }

  return map;
}

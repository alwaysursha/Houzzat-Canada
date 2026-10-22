import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export type MarketPulse = {
  city: string;
  community: string | null;
  activeCount: number;
  soldCount: number;
  medianListPrice: number | null;
  medianSoldPrice: number | null;
  avgDaysOnMarket: number | null;
  soldOverAskingPct: number | null;
  sampleNote: string;
  soldRestricted: boolean;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

export async function getMarketPulse(opts: {
  city: string;
  community?: string | null;
  includeSold: boolean;
}): Promise<MarketPulse> {
  const placeFilter = {
    city: { equals: opts.city, mode: "insensitive" as const },
    ...(opts.community
      ? {
          community: {
            equals: opts.community,
            mode: "insensitive" as const,
          },
        }
      : {}),
    segment: { in: ["RESIDENTIAL" as const, "COMMERCIAL" as const] },
    transactionType: "SALE" as const,
  };

  const [active, sold] = await Promise.all([
    prisma.listing.findMany({
      where: { ...placeFilter, status: "ACTIVE", ...excludeStagingSnapshotWhere() },
      select: { listPrice: true, daysOnMarket: true },
    }),
    opts.includeSold
      ? prisma.listing.findMany({
          where: {
            ...placeFilter,
            status: "SOLD",
            soldPrice: { not: null },
            ...excludeStagingSnapshotWhere(),
          },
          select: { listPrice: true, soldPrice: true, daysOnMarket: true },
        })
      : Promise.resolve([]),
  ]);

  const overAsking = sold.filter(
    (s) => s.soldPrice != null && s.soldPrice >= s.listPrice,
  );

  return {
    city: opts.city,
    community: opts.community ?? null,
    activeCount: active.length,
    soldCount: sold.length,
    medianListPrice: median(active.map((a) => a.listPrice)),
    medianSoldPrice: opts.includeSold
      ? median(sold.map((s) => s.soldPrice!).filter(Boolean))
      : null,
    avgDaysOnMarket:
      active.length > 0
        ? Math.round(
            active.reduce((n, a) => n + a.daysOnMarket, 0) / active.length,
          )
        : null,
    soldOverAskingPct:
      opts.includeSold && sold.length > 0
        ? Math.round((overAsking.length / sold.length) * 100)
        : null,
    sampleNote: opts.includeSold
      ? sold.length < 3
        ? "Thin sold sample in this area — treat as directional only."
        : "Computed from Houzzat inventory (demo/synced solds)."
      : "Sold medians locked — accept VOW to unlock sold pulse.",
    soldRestricted: !opts.includeSold,
  };
}

import { haversineKm } from "@/lib/geo/distance";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export type CmaComp = {
  mlsNumber: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  status: string;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  bedsLabel: string | null;
  baths: number;
  sqft: number | null;
  distanceKm: number;
  daysOnMarket: number;
  soldAt: Date | null;
};

export async function findComps(opts: {
  lat: number;
  lng: number;
  beds?: number | null;
  propertyType?: string | null;
  city?: string | null;
  limit?: number;
  includeSold: boolean;
  /** When set, only return solds. */
  soldOnly?: boolean;
  /**
   * Max distance in km. Pass `null` for no distance cap (still sorted by
   * distance / recency). Default 8 for agent CMA callers.
   */
  maxDistanceKm?: number | null;
  /** Prefer recent solds when comparing sold inventory. */
  preferRecentSold?: boolean;
}): Promise<CmaComp[]> {
  const limit = opts.limit ?? 8;
  const statuses = opts.soldOnly
    ? (["SOLD"] as const)
    : opts.includeSold
      ? (["ACTIVE", "SOLD"] as const)
      : (["ACTIVE"] as const);
  const maxDistanceKm =
    opts.maxDistanceKm === undefined ? 8 : opts.maxDistanceKm;

  const rows = await prisma.listing.findMany({
    where: {
      ...excludeStagingSnapshotWhere(),
      status: { in: [...statuses] },
      transactionType: "SALE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      ...(opts.soldOnly ? { soldPrice: { not: null } } : {}),
      ...(opts.city
        ? { city: { equals: opts.city, mode: "insensitive" } }
        : {}),
      ...(opts.beds != null
        ? { beds: { gte: Math.max(opts.beds - 1, 0), lte: opts.beds + 1 } }
        : {}),
      ...(opts.propertyType
        ? { propertyType: opts.propertyType as never }
        : {}),
    },
    take: opts.preferRecentSold || opts.soldOnly ? 200 : 80,
    orderBy: opts.soldOnly
      ? [{ soldAt: "desc" }, { updatedAtMls: "desc" }]
      : undefined,
  });

  const mapped = rows
    .map((r) => ({
      mlsNumber: r.mlsNumber,
      addressLine: r.addressLine,
      unitNumber: r.unitNumber,
      city: r.city,
      community: r.community,
      status: r.status,
      listPrice: r.listPrice,
      soldPrice: r.soldPrice,
      beds: r.beds,
      bedsLabel: formatBedsPlusLabel(r.beds, parseListingFacts(r.facts)),
      baths: r.baths,
      sqft: r.sqft,
      distanceKm: haversineKm(opts.lat, opts.lng, r.lat, r.lng),
      daysOnMarket: r.daysOnMarket,
      soldAt: r.soldAt,
    }))
    .filter((r) =>
      maxDistanceKm == null ? true : r.distanceKm <= maxDistanceKm,
    );

  if (opts.preferRecentSold || opts.soldOnly) {
    return mapped
      .sort((a, b) => {
        const aMs = a.soldAt?.getTime() ?? 0;
        const bMs = b.soldAt?.getTime() ?? 0;
        if (bMs !== aMs) return bMs - aMs;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, limit);
  }

  return mapped
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function summarizeCma(comps: CmaComp[]): string {
  const prices = comps
    .map((c) => c.soldPrice ?? c.listPrice)
    .sort((a, b) => a - b);
  if (prices.length === 0) {
    return "No nearby comps in inventory yet.";
  }
  const low = prices[0]!;
  const high = prices[prices.length - 1]!;
  const mid = prices[Math.floor(prices.length / 2)]!;
  return `Based on ${comps.length} nearby comps in Houzzat inventory, indicative range $${low.toLocaleString()} – $${high.toLocaleString()} (median ~$${mid.toLocaleString()}). Draft for agent review only — not a formal appraisal.`;
}

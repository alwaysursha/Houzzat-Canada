import { haversineKm } from "@/lib/geo/distance";
import { prisma } from "@/lib/prisma";

export type CmaComp = {
  mlsNumber: string;
  addressLine: string;
  city: string;
  community: string | null;
  status: string;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  distanceKm: number;
  daysOnMarket: number;
};

export async function findComps(opts: {
  lat: number;
  lng: number;
  beds?: number | null;
  propertyType?: string | null;
  city?: string | null;
  limit?: number;
  includeSold: boolean;
}): Promise<CmaComp[]> {
  const limit = opts.limit ?? 8;
  const statuses = opts.includeSold
    ? (["ACTIVE", "SOLD"] as const)
    : (["ACTIVE"] as const);

  const rows = await prisma.listing.findMany({
    where: {
      status: { in: [...statuses] },
      transactionType: "SALE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      ...(opts.city
        ? { city: { equals: opts.city, mode: "insensitive" } }
        : {}),
      ...(opts.beds != null
        ? { beds: { gte: Math.max(opts.beds - 1, 0), lte: opts.beds + 1 } }
        : {}),
    },
    take: 80,
  });

  return rows
    .map((r) => ({
      mlsNumber: r.mlsNumber,
      addressLine: r.addressLine,
      city: r.city,
      community: r.community,
      status: r.status,
      listPrice: r.listPrice,
      soldPrice: r.soldPrice,
      beds: r.beds,
      baths: r.baths,
      sqft: r.sqft,
      distanceKm: haversineKm(opts.lat, opts.lng, r.lat, r.lng),
      daysOnMarket: r.daysOnMarket,
    }))
    .filter((r) => r.distanceKm <= 8)
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

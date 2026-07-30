import type { PropertyType } from "@prisma/client";
import { haversineKm } from "@/lib/geo/distance";
import { prisma } from "@/lib/prisma";

export type BasementFinish = "finished" | "unfinished" | "none" | "unknown";

export type HomeValueEstimate = {
  low: number;
  mid: number;
  high: number;
  sampleSize: number;
  soldCount: number;
  activeCount: number;
  method: "sold_comps" | "active_listings" | "blended" | "fallback";
  city: string | null;
  community: string | null;
  /** Average sold price in the resolved community (recent sales). */
  communityAvgSold: number | null;
  communitySoldCount: number;
};

const PROPERTY_TYPES = new Set<string>([
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
]);

/** Closely related types used when exact-type sample is thin. */
const RELATED_PROPERTY_TYPES: Record<PropertyType, PropertyType[]> = {
  DETACHED: ["DETACHED"],
  SEMI_DETACHED: ["SEMI_DETACHED", "DETACHED"],
  TOWNHOUSE: ["TOWNHOUSE", "CONDO_TOWNHOUSE"],
  CONDO_TOWNHOUSE: ["CONDO_TOWNHOUSE", "TOWNHOUSE"],
  CONDO_APT: ["CONDO_APT"],
  MULTIPLEX: ["MULTIPLEX", "SEMI_DETACHED"],
  VACANT_LAND: ["VACANT_LAND"],
  OFFICE: ["OFFICE", "MIXED_USE"],
  RETAIL: ["RETAIL", "MIXED_USE"],
  INDUSTRIAL: ["INDUSTRIAL"],
  MIXED_USE: ["MIXED_USE", "OFFICE", "RETAIL"],
  OTHER: ["OTHER", "DETACHED", "TOWNHOUSE", "CONDO_APT"],
};

function parsePropertyType(
  value: string | null | undefined,
): PropertyType | null {
  if (!value) return null;
  const key = value.trim().toUpperCase();
  return PROPERTY_TYPES.has(key) ? (key as PropertyType) : null;
}

function relatedTypes(type: PropertyType | null): PropertyType[] | null {
  if (!type) return null;
  return RELATED_PROPERTY_TYPES[type];
}

function basementFactor(basement: BasementFinish | null | undefined): number {
  const finish: BasementFinish = basement ?? "unknown";
  switch (finish) {
    case "finished":
      return 1.035;
    case "unfinished":
      return 0.985;
    case "none":
      return 0.965;
    case "unknown":
      return 1;
    default: {
      const _exhaustive: never = finish;
      return _exhaustive;
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function roundToNearest(n: number, step = 1000): number {
  return Math.round(n / step) * step;
}

async function resolveCommunityAvg(opts: {
  city: string | null;
  community: string | null;
  propertyTypes?: PropertyType[] | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<{
  community: string | null;
  communityAvgSold: number | null;
  communitySoldCount: number;
}> {
  const soldSince = new Date();
  soldSince.setMonth(soldSince.getMonth() - 14);
  let community = opts.community?.trim() || null;

  const hasCoords =
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  // Infer community from nearby solds when the address didn't carry one.
  if (!community && hasCoords) {
    const nearby = await prisma.listing.findMany({
      where: {
        transactionType: "SALE",
        status: "SOLD",
        community: { not: null },
        soldPrice: { gt: 50_000 },
        ...(opts.propertyTypes?.length
          ? { propertyType: { in: opts.propertyTypes } }
          : {}),
        lat: {
          gte: opts.lat! - 0.045,
          lte: opts.lat! + 0.045,
        },
        lng: {
          gte: opts.lng! - 0.055,
          lte: opts.lng! + 0.055,
        },
      },
      select: { community: true, lat: true, lng: true },
      take: 40,
      orderBy: { soldAt: "desc" },
    });
    const votes = new Map<string, number>();
    for (const row of nearby) {
      if (!row.community) continue;
      const d = haversineKm(opts.lat!, opts.lng!, row.lat, row.lng);
      if (d > 4) continue;
      votes.set(row.community, (votes.get(row.community) ?? 0) + (4 - d));
    }
    let best: string | null = null;
    let bestScore = 0;
    for (const [name, score] of votes) {
      if (score > bestScore) {
        best = name;
        bestScore = score;
      }
    }
    community = best;
  }

  if (!community && !opts.city) {
    return { community: null, communityAvgSold: null, communitySoldCount: 0 };
  }

  const areaWhere = {
    transactionType: "SALE" as const,
    status: "SOLD" as const,
    soldPrice: { gt: 50_000 },
    OR: [{ soldAt: { gte: soldSince } }, { soldAt: null }],
    ...(opts.propertyTypes?.length
      ? { propertyType: { in: opts.propertyTypes } }
      : {}),
    ...(community
      ? {
          community: {
            equals: community,
            mode: "insensitive" as const,
          },
        }
      : opts.city
        ? { city: { equals: opts.city, mode: "insensitive" as const } }
        : {}),
  };

  const communitySolds = await prisma.listing.findMany({
    where: areaWhere,
    select: { soldPrice: true, listPrice: true },
    take: 80,
    orderBy: [{ soldAt: "desc" }],
  });
  const prices = communitySolds
    .map((r) => r.soldPrice ?? r.listPrice)
    .filter((p): p is number => p != null && p > 50_000);
  if (prices.length === 0) {
    return { community, communityAvgSold: null, communitySoldCount: 0 };
  }
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return {
    community,
    communityAvgSold: roundToNearest(avg),
    communitySoldCount: prices.length,
  };
}

type CompRow = {
  soldPrice: number | null;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number | null;
  lat: number;
  lng: number;
  soldAt: Date | null;
  propertyType: PropertyType;
  status: "SOLD" | "ACTIVE";
};

type Priced = { price: number; weight: number };

function scoreComp(
  row: CompRow,
  opts: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: PropertyType | null;
    lat?: number | null;
    lng?: number | null;
    maxKm: number;
    minSqftRatio: number;
  },
): Priced | null {
  const price =
    row.status === "SOLD" && row.soldPrice ? row.soldPrice : row.listPrice;
  if (!price || price < 50_000) return null;

  let weight = row.status === "SOLD" ? 1 : 0.52;
  const hasCoords =
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  if (hasCoords) {
    const d = haversineKm(opts.lat!, opts.lng!, row.lat, row.lng);
    if (d > opts.maxKm) return null;
    // Stronger distance preference than before.
    weight *= Math.max(0.25, 1 - d / (opts.maxKm * 1.05));
  }

  if (opts.propertyType) {
    if (row.propertyType === opts.propertyType) {
      weight *= 1.35;
    } else {
      weight *= 0.72;
    }
  }

  if (opts.beds != null) {
    const bedDelta = Math.abs(row.beds - opts.beds);
    if (bedDelta > 1.01) return null;
    weight *= bedDelta < 0.01 ? 1.25 : bedDelta <= 0.5 ? 1.05 : 0.78;
  }

  if (opts.baths != null) {
    const bathDelta = Math.abs(row.baths - opts.baths);
    if (bathDelta > 1.01) return null;
    weight *= bathDelta < 0.01 ? 1.15 : bathDelta <= 0.5 ? 1.02 : 0.82;
  }

  if (opts.sqft && row.sqft && row.sqft > 0) {
    const ratio = Math.min(row.sqft, opts.sqft) / Math.max(row.sqft, opts.sqft);
    if (ratio < opts.minSqftRatio) return null;
    weight *= 0.55 + 0.45 * ratio;
  } else if (opts.sqft && !row.sqft) {
    weight *= 0.85;
  }

  if (row.status === "SOLD" && row.soldAt) {
    const ageDays =
      (Date.now() - row.soldAt.getTime()) / (1000 * 60 * 60 * 24);
    weight *= ageDays <= 120 ? 1.22 : ageDays <= 240 ? 1.08 : ageDays <= 365 ? 1 : 0.8;
  }

  return { price, weight };
}

function weightedSorted(items: Priced[]): number[] {
  if (items.length === 0) return [];
  const expanded: number[] = [];
  for (const item of items) {
    const copies = Math.max(1, Math.round(item.weight * 4));
    for (let i = 0; i < copies; i++) expanded.push(item.price);
  }
  return expanded.sort((a, b) => a - b);
}

function pickPriced(
  rows: CompRow[],
  opts: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: PropertyType | null;
    lat?: number | null;
    lng?: number | null;
  },
): { sold: Priced[]; active: Priced[] } {
  // Progressive tightening: prefer close, similar homes first.
  const passes: Array<{ maxKm: number; minSqftRatio: number }> = [
    { maxKm: 3.5, minSqftRatio: 0.78 },
    { maxKm: 6, minSqftRatio: 0.68 },
    { maxKm: 10, minSqftRatio: 0.58 },
    { maxKm: 14, minSqftRatio: 0.5 },
  ];

  for (const pass of passes) {
    const sold: Priced[] = [];
    const active: Priced[] = [];
    for (const row of rows) {
      const scored = scoreComp(row, { ...opts, ...pass });
      if (!scored) continue;
      if (row.status === "SOLD") sold.push(scored);
      else active.push(scored);
    }
    if (sold.length >= 4 || sold.length + active.length >= 6) {
      return { sold, active };
    }
  }

  // Last resort: keep whatever scored on the loosest pass.
  const sold: Priced[] = [];
  const active: Priced[] = [];
  const loose = passes[passes.length - 1]!;
  for (const row of rows) {
    const scored = scoreComp(row, { ...opts, ...loose });
    if (!scored) continue;
    if (row.status === "SOLD") sold.push(scored);
    else active.push(scored);
  }
  return { sold, active };
}

/**
 * Indicative home value range from Houzzat inventory.
 * Prefers recent solds of the same property type near the subject home.
 */
export async function estimateHomeValue(opts: {
  city?: string | null;
  community?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  basement?: BasementFinish | null;
  propertyType?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<HomeValueEstimate> {
  const city = opts.city?.trim() || null;
  const beds = opts.beds != null && Number.isFinite(opts.beds) ? opts.beds : null;
  const baths =
    opts.baths != null && Number.isFinite(opts.baths) ? opts.baths : null;
  const sqft = opts.sqft != null && opts.sqft > 0 ? opts.sqft : null;
  const propertyType = parsePropertyType(opts.propertyType);
  const typeFamily = relatedTypes(propertyType);
  const hasCoords =
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  const soldSince = new Date();
  soldSince.setMonth(soldSince.getMonth() - 14);

  // Candidate pool: same/related property type first; soft beds window.
  const candidateWhere = {
    transactionType: "SALE" as const,
    segment: { in: ["RESIDENTIAL" as const, "COMMERCIAL" as const] },
    ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
    ...(typeFamily ? { propertyType: { in: typeFamily } } : {}),
    ...(beds != null
      ? { beds: { gte: Math.max(beds - 1, 0), lte: beds + 1 } }
      : {}),
    ...(baths != null
      ? { baths: { gte: Math.max(baths - 1, 0), lte: baths + 1 } }
      : {}),
  };

  const [soldRows, activeRows, communityStats] = await Promise.all([
    prisma.listing.findMany({
      where: {
        ...candidateWhere,
        status: "SOLD",
        soldPrice: { gt: 50_000 },
        OR: [{ soldAt: { gte: soldSince } }, { soldAt: null }],
      },
      select: {
        soldPrice: true,
        listPrice: true,
        beds: true,
        baths: true,
        sqft: true,
        lat: true,
        lng: true,
        soldAt: true,
        propertyType: true,
      },
      take: 160,
      orderBy: [{ soldAt: "desc" }, { updatedAtMls: "desc" }],
    }),
    prisma.listing.findMany({
      where: {
        ...candidateWhere,
        status: "ACTIVE",
        listPrice: { gt: 50_000 },
      },
      select: {
        listPrice: true,
        beds: true,
        baths: true,
        sqft: true,
        lat: true,
        lng: true,
        propertyType: true,
      },
      take: 100,
      orderBy: [{ listedAt: "desc" }],
    }),
    resolveCommunityAvg({
      city,
      community: opts.community?.trim() || null,
      propertyTypes: typeFamily,
      lat: opts.lat,
      lng: opts.lng,
    }),
  ]);

  let rows: CompRow[] = [
    ...soldRows.map((row) => ({
      ...row,
      status: "SOLD" as const,
    })),
    ...activeRows.map((row) => ({
      ...row,
      soldPrice: null,
      soldAt: null,
      status: "ACTIVE" as const,
    })),
  ];

  // If exact/related type + beds produced too few rows, widen type family only.
  if (rows.length < 8 && propertyType) {
    const wider = await prisma.listing.findMany({
      where: {
        transactionType: "SALE",
        segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        propertyType,
        status: { in: ["SOLD", "ACTIVE"] },
        OR: [
          { status: "SOLD", soldPrice: { gt: 50_000 } },
          { status: "ACTIVE", listPrice: { gt: 50_000 } },
        ],
      },
      select: {
        soldPrice: true,
        listPrice: true,
        beds: true,
        baths: true,
        sqft: true,
        lat: true,
        lng: true,
        soldAt: true,
        propertyType: true,
        status: true,
      },
      take: 120,
      orderBy: [{ updatedAtMls: "desc" }],
    });
    rows = wider.map((row) => ({
      soldPrice: row.soldPrice,
      listPrice: row.listPrice,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      lat: row.lat,
      lng: row.lng,
      soldAt: row.soldAt,
      propertyType: row.propertyType,
      status: row.status === "SOLD" ? "SOLD" : "ACTIVE",
    }));
  }

  const { sold: soldPriced, active: activePriced } = pickPriced(rows, {
    beds,
    baths,
    sqft,
    propertyType,
    lat: opts.lat,
    lng: opts.lng,
  });

  const soldSorted = weightedSorted(soldPriced);
  const activeSorted = weightedSorted(activePriced);
  const soldCount = soldPriced.length;
  const activeCount = activePriced.length;

  let method: HomeValueEstimate["method"] = "fallback";
  let prices: number[] = [];

  if (soldSorted.length >= 4) {
    method = activeSorted.length >= 3 ? "blended" : "sold_comps";
    prices =
      method === "blended"
        ? [...soldSorted, ...activeSorted.map((p) => Math.round(p * 0.97))].sort(
            (a, b) => a - b,
          )
        : soldSorted;
  } else if (soldSorted.length + activeSorted.length >= 4) {
    method = soldSorted.length > 0 ? "blended" : "active_listings";
    prices = [...soldSorted, ...activeSorted].sort((a, b) => a - b);
  } else if (soldSorted.length + activeSorted.length > 0) {
    method = soldSorted.length > 0 ? "sold_comps" : "active_listings";
    prices = [...soldSorted, ...activeSorted].sort((a, b) => a - b);
  }

  if (prices.length < 3) {
    const fallback = await prisma.listing.findMany({
      where: {
        transactionType: "SALE",
        status: { in: ["ACTIVE", "SOLD"] },
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(propertyType ? { propertyType } : {}),
        listPrice: { gt: 100_000 },
      },
      select: { listPrice: true, soldPrice: true, status: true },
      take: 50,
      orderBy: { updatedAtMls: "desc" },
    });
    prices = fallback
      .map((r) =>
        r.status === "SOLD" && r.soldPrice ? r.soldPrice : r.listPrice,
      )
      .filter((p) => p > 50_000)
      .sort((a, b) => a - b);
    method = "fallback";
  }

  const factor = basementFactor(opts.basement);

  // Slightly tighter band when we have strong feature match (type + beds + geo).
  const confident =
    Boolean(propertyType) &&
    beds != null &&
    hasCoords &&
    soldCount >= 5 &&
    method !== "fallback";

  if (prices.length === 0) {
    return {
      low: roundToNearest(650_000 * factor),
      mid: roundToNearest(875_000 * factor),
      high: roundToNearest(1_150_000 * factor),
      sampleSize: 0,
      soldCount: 0,
      activeCount: 0,
      method: "fallback",
      city,
      community: communityStats.community,
      communityAvgSold: communityStats.communityAvgSold,
      communitySoldCount: communityStats.communitySoldCount,
    };
  }

  let low = percentile(prices, confident ? 0.28 : 0.22) * factor;
  let mid = percentile(prices, 0.5) * factor;
  let high = percentile(prices, confident ? 0.72 : 0.78) * factor;

  if (high - low < mid * (confident ? 0.06 : 0.08)) {
    low = mid * (confident ? 0.94 : 0.92);
    high = mid * (confident ? 1.06 : 1.08);
  }

  return {
    low: roundToNearest(low),
    mid: roundToNearest(mid),
    high: roundToNearest(high),
    sampleSize: prices.length,
    soldCount,
    activeCount,
    method,
    city,
    community: communityStats.community,
    communityAvgSold: communityStats.communityAvgSold,
    communitySoldCount: communityStats.communitySoldCount,
  };
}

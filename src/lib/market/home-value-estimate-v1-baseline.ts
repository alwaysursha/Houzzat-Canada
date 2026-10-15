/**
 * V1 valuation baseline (frozen from main) for historical accuracy comparison.
 * Production callers should use `estimateHomeValue` (V2). This module exists for
 * backtests only — do not wire to /api/valuation.
 *
 * Supports optional historical inventory injection without changing V1 math.
 */

import type { PropertyType, Prisma } from "@prisma/client";
import { haversineKm } from "@/lib/geo/distance";
import {
  filterHistoricalCandidates,
  type HomeValueHistoricalInjection,
} from "@/lib/market/home-value-estimate-historical";
import { normalizeUnitNumber } from "@/lib/property-address/normalize";
import { prisma } from "@/lib/prisma";
import {
  buildPrismaEntitledInventoryWhere,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";

export type BasementFinish = "finished" | "unfinished" | "none" | "unknown";

export type HomeValueEstimateOk = {
  status: "OK";
  low: number;
  mid: number;
  high: number;
  sampleSize: number;
  soldCount: number;
  /** Always 0 — actives are never valuation evidence. */
  activeCount: 0;
  method: "sold_comps";
  confidence: "medium" | "high";
  city: string;
  community: string | null;
  communityAvgSold: number | null;
  communitySoldCount: number;
};

export type HomeValueEstimateInsufficient = {
  status: "INSUFFICIENT_DATA";
  reason: string;
  city: string | null;
  community: string | null;
};

export type EstimateHomeValueResult =
  | HomeValueEstimateOk
  | HomeValueEstimateInsufficient;

/** @deprecated Prefer EstimateHomeValueResult — kept for import compatibility. */
export type HomeValueEstimate = HomeValueEstimateOk;

const RESIDENTIAL_TYPES = new Set<PropertyType>([
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
]);

const SOLD_WINDOW_MONTHS = 12;
const MIN_ELIGIBLE_SOLDS = 3;
/** Reject sets where highest/lowest sold stretch is too wide. */
const MAX_PRICE_SPREAD_RATIO = 2.25;
/** When subject sqft is unknown, comps must still be size-consistent with each other. */
const MIN_COMP_SQFT_RATIO = 0.7;
/** Max share of total similarity weight any single sold may carry. */
const MAX_SINGLE_COMP_WEIGHT_SHARE = 0.4;
/** Drop comps whose score is far below the best (dissimilar noise). */
const MIN_SCORE_RATIO_OF_BEST = 0.4;

/**
 * Strict type families — condo apt, condo town, and freehold stay distinct.
 * No detached↔condo, no town↔condo-town, no commercial mix.
 */
export function compatiblePropertyTypes(
  type: PropertyType,
): readonly PropertyType[] {
  switch (type) {
    case "DETACHED":
      return ["DETACHED"];
    case "SEMI_DETACHED":
      return ["SEMI_DETACHED"];
    case "TOWNHOUSE":
      return ["TOWNHOUSE"];
    case "CONDO_TOWNHOUSE":
      return ["CONDO_TOWNHOUSE"];
    case "CONDO_APT":
      return ["CONDO_APT"];
    case "MULTIPLEX":
      return ["MULTIPLEX"];
    case "VACANT_LAND":
    case "OFFICE":
    case "RETAIL":
    case "INDUSTRIAL":
    case "MIXED_USE":
    case "OTHER":
      return [];
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function parseResidentialPropertyType(
  value: string | null | undefined,
): PropertyType | null {
  if (!value) return null;
  const key = value.trim().toUpperCase() as PropertyType;
  if (!RESIDENTIAL_TYPES.has(key)) return null;
  return key;
}

/** Condo size is essential — never estimate without subject sqft. */
export function requiresSubjectSqft(type: PropertyType): boolean {
  switch (type) {
    case "CONDO_APT":
    case "CONDO_TOWNHOUSE":
      return true;
    case "DETACHED":
    case "SEMI_DETACHED":
    case "TOWNHOUSE":
    case "MULTIPLEX":
    case "VACANT_LAND":
    case "OFFICE":
    case "RETAIL":
    case "INDUSTRIAL":
    case "MIXED_USE":
    case "OTHER":
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function distanceLimitsKm(type: PropertyType): {
  primary: number;
  expanded: number;
} {
  switch (type) {
    case "CONDO_APT":
      return { primary: 1.5, expanded: 2.5 };
    case "CONDO_TOWNHOUSE":
      return { primary: 2.5, expanded: 4 };
    case "TOWNHOUSE":
    case "SEMI_DETACHED":
      return { primary: 3.5, expanded: 5 };
    case "DETACHED":
    case "MULTIPLEX":
      return { primary: 4, expanded: 6 };
    default:
      return { primary: 3, expanded: 4.5 };
  }
}

export type SoldCompCandidateV1 = {
  soldPrice: number;
  soldAt: Date;
  beds: number;
  baths: number;
  sqft: number | null;
  lat: number;
  lng: number;
  propertyType: PropertyType;
  city: string;
  community: string | null;
  parkingSpaces?: number | null;
  yearBuilt?: number | null;
  addressLine?: string | null;
  unitNumber?: string | null;
  listingKey?: string | null;
  mlsNumber?: string | null;
};

/** @deprecated Use SoldCompCandidateV1 in this baseline module. */
export type SoldCompCandidate = SoldCompCandidateV1;

function v1IdentityKey(row: SoldCompCandidateV1): string {
  const city = row.city.trim().toLowerCase();
  const unit = normalizeUnitNumber(row.unitNumber)?.toLowerCase() ?? "";
  const addr = (row.addressLine ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (addr) return `addr:${city}|${addr}|${unit}`;
  const key = row.listingKey?.trim() || row.mlsNumber?.trim();
  if (key) return `key:${key.toLowerCase()}|${unit}`;
  const lat = row.lat != null ? row.lat.toFixed(5) : "";
  const lng = row.lng != null ? row.lng.toFixed(5) : "";
  return `fallback:${city}|${unit}|${lat}|${lng}`;
}

export type SubjectForComps = {
  city: string;
  beds: number;
  baths: number | null;
  sqft: number | null;
  propertyType: PropertyType;
  lat: number;
  lng: number;
  community?: string | null;
  basement?: BasementFinish | null;
  parkingSpaces?: number | null;
  yearBuilt?: number | null;
};

function soldSinceDate(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - SOLD_WINDOW_MONTHS);
  return d;
}

function roundToNearest(n: number, step = 1000): number {
  return Math.round(n / step) * step;
}

/**
 * Hard eligibility for a sold comparable. Pure — used by tests.
 */
export function isEligibleSoldComp(
  row: SoldCompCandidateV1,
  subject: SubjectForComps,
  opts: { maxKm: number; now?: Date },
): boolean {
  const now = opts.now ?? new Date();
  const since = soldSinceDate(now);

  if (!(row.soldPrice > 50_000)) return false;
  if (!(row.soldAt instanceof Date) || Number.isNaN(row.soldAt.getTime())) {
    return false;
  }
  if (row.soldAt.getTime() < since.getTime()) return false;

  if (row.city.trim().toLowerCase() !== subject.city.trim().toLowerCase()) {
    return false;
  }

  const allowed = compatiblePropertyTypes(subject.propertyType);
  if (!allowed.includes(row.propertyType)) return false;

  const d = haversineKm(subject.lat, subject.lng, row.lat, row.lng);
  if (d > opts.maxKm) return false;

  if (Math.abs(row.beds - subject.beds) > 1.01) return false;

  if (subject.baths != null) {
    if (Math.abs(row.baths - subject.baths) > 1.01) return false;
  }

  if (subject.sqft != null && subject.sqft > 0) {
    if (!row.sqft || row.sqft <= 0) return false;
    const ratio =
      Math.min(row.sqft, subject.sqft) / Math.max(row.sqft, subject.sqft);
    if (ratio < 0.75) return false;
  } else {
    // Without subject size, still require measurable comp sqft (no invented sizes).
    if (!row.sqft || row.sqft <= 0) return false;
  }

  return true;
}

/**
 * Similarity score for ranking eligible solds (higher = better). Pure.
 */
export function scoreEligibleSoldComp(
  row: SoldCompCandidateV1,
  subject: SubjectForComps,
  opts?: { now?: Date },
): number {
  const d = haversineKm(subject.lat, subject.lng, row.lat, row.lng);
  const limits = distanceLimitsKm(subject.propertyType);
  let score = Math.max(0.15, 1 - d / (limits.expanded * 1.05));

  if (row.propertyType === subject.propertyType) score *= 1.4;

  if (
    subject.community?.trim() &&
    row.community?.trim() &&
    subject.community.trim().toLowerCase() === row.community.trim().toLowerCase()
  ) {
    score *= 1.2;
  }

  const bedDelta = Math.abs(row.beds - subject.beds);
  score *= bedDelta < 0.01 ? 1.25 : bedDelta <= 0.5 ? 1.08 : 0.85;

  if (subject.baths != null) {
    const bathDelta = Math.abs(row.baths - subject.baths);
    score *= bathDelta < 0.01 ? 1.12 : bathDelta <= 0.5 ? 1.02 : 0.88;
  }

  if (subject.sqft && row.sqft && row.sqft > 0) {
    const ratio =
      Math.min(row.sqft, subject.sqft) / Math.max(row.sqft, subject.sqft);
    score *= 0.55 + 0.45 * ratio;
  }

  const nowMs = (opts?.now ?? new Date()).getTime();
  const ageDays = (nowMs - row.soldAt.getTime()) / (1000 * 60 * 60 * 24);
  score *=
    ageDays <= 90 ? 1.25 : ageDays <= 180 ? 1.12 : ageDays <= 270 ? 1 : 0.88;

  // Soft boosts only when both sides have reliable values — no price multipliers.
  if (
    subject.parkingSpaces != null &&
    subject.parkingSpaces >= 0 &&
    row.parkingSpaces != null &&
    row.parkingSpaces >= 0
  ) {
    const parkDelta = Math.abs(row.parkingSpaces - subject.parkingSpaces);
    if (parkDelta <= 1) score *= 1.04;
  }
  if (
    subject.yearBuilt != null &&
    subject.yearBuilt > 1800 &&
    row.yearBuilt != null &&
    row.yearBuilt > 1800
  ) {
    const yearDelta = Math.abs(row.yearBuilt - subject.yearBuilt);
    if (yearDelta <= 10) score *= 1.05;
    else if (yearDelta <= 20) score *= 1.02;
  }

  return score;
}

function insufficient(
  reason: string,
  city: string | null,
  community: string | null,
): HomeValueEstimateInsufficient {
  return { status: "INSUFFICIENT_DATA", reason, city, community };
}

function pricesConsistent(sorted: number[]): boolean {
  if (sorted.length < MIN_ELIGIBLE_SOLDS) return false;
  const low = sorted[0]!;
  const high = sorted[sorted.length - 1]!;
  if (low <= 0) return false;
  return high / low <= MAX_PRICE_SPREAD_RATIO;
}

/** Comp-set size consistency when subject sqft is unknown. */
export function compsSqftConsistent(
  sqfts: Array<number | null | undefined>,
): boolean {
  const known = sqfts.filter((s): s is number => s != null && s > 0);
  if (known.length < MIN_ELIGIBLE_SOLDS) return false;
  const min = Math.min(...known);
  const max = Math.max(...known);
  if (min <= 0) return false;
  return min / max >= MIN_COMP_SQFT_RATIO;
}

export type ScoredSoldPrice = { soldPrice: number; score: number };

/**
 * Normalize scores to weights with a hard per-comp share cap.
 * Excess mass is redistributed to remaining comps by relative score.
 */
export function cappedNormalizedWeights(
  scores: number[],
  maxShare = MAX_SINGLE_COMP_WEIGHT_SHARE,
): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const cap = Math.min(1, Math.max(maxShare, 1 / n));
  const raw = scores.map((s) => Math.max(s, 1e-12));
  const order = raw
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s);

  const out = new Array<number>(n).fill(0);
  let remaining = 1;
  let remainingScore = order.reduce((a, x) => a + x.s, 0);

  for (let k = 0; k < order.length; k++) {
    const left = order.length - k;
    if (left <= 0 || remainingScore <= 0) break;
    const { s, i } = order[k]!;
    const natural = remaining * (s / remainingScore);
    if (natural > cap + 1e-12 && left > 1) {
      out[i] = cap;
      remaining -= cap;
      remainingScore -= s;
      continue;
    }
    for (let j = k; j < order.length; j++) {
      const o = order[j]!;
      out[o.i] = remaining * (o.s / remainingScore);
    }
    break;
  }
  return out;
}

/**
 * Similarity-weighted low/mid/high from scored solds.
 * Caps any single comp’s weight share; clamps to the sold price range.
 */
export function weightedSoldEstimate(
  scored: ScoredSoldPrice[],
  opts?: { lowP?: number; highP?: number },
): { low: number; mid: number; high: number } | null {
  if (scored.length < MIN_ELIGIBLE_SOLDS) return null;

  const positive = scored
    .filter((s) => s.soldPrice > 0 && Number.isFinite(s.score) && s.score > 0)
    .map((s) => ({ soldPrice: s.soldPrice, score: s.score }));
  if (positive.length < MIN_ELIGIBLE_SOLDS) return null;

  const best = Math.max(...positive.map((s) => s.score));
  const evidence = positive.filter(
    (s) => s.score >= best * MIN_SCORE_RATIO_OF_BEST,
  );
  if (evidence.length < MIN_ELIGIBLE_SOLDS) return null;

  const weights = cappedNormalizedWeights(evidence.map((s) => s.score));
  const weighted = evidence.map((s, i) => ({
    soldPrice: s.soldPrice,
    score: weights[i]!,
  }));
  const total = weighted.reduce((a, b) => a + b.score, 0);
  if (!(total > 0)) return null;

  const sorted = [...weighted].sort((a, b) => a.soldPrice - b.soldPrice);
  const minP = sorted[0]!.soldPrice;
  const maxP = sorted[sorted.length - 1]!.soldPrice;
  if (!pricesConsistent(sorted.map((s) => s.soldPrice))) return null;

  function weightedPercentile(p: number): number {
    const target = Math.min(Math.max(p, 0), 1) * total;
    let cum = 0;
    for (let i = 0; i < sorted.length; i++) {
      const prev = cum;
      const row = sorted[i]!;
      cum += row.score;
      if (cum >= target) {
        if (i === 0 || target <= prev) return row.soldPrice;
        const w = (target - prev) / row.score;
        const prevPrice = sorted[i - 1]!.soldPrice;
        return prevPrice * (1 - w) + row.soldPrice * w;
      }
    }
    return maxP;
  }

  const lowP = opts?.lowP ?? 0.25;
  const highP = opts?.highP ?? 0.75;
  const low = weightedPercentile(lowP);
  const mid = weightedPercentile(0.5);
  const high = weightedPercentile(highP);

  return {
    low: Math.min(maxP, Math.max(minP, low)),
    mid: Math.min(maxP, Math.max(minP, mid)),
    high: Math.min(maxP, Math.max(minP, high)),
  };
}

/**
 * V1 baseline estimate. Same math as production V1; optional historical injection
 * for backtests (inventoryOverride / soldAtBefore / excludes).
 */
export async function estimateHomeValueV1Baseline(
  opts: {
    city?: string | null;
    community?: string | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    basement?: BasementFinish | null;
    propertyType?: string | null;
    lat?: number | null;
    lng?: number | null;
    parkingSpaces?: number | null;
    yearBuilt?: number | null;
    entitlement?: WorkspaceListingEntitlement;
  } & HomeValueHistoricalInjection<SoldCompCandidateV1>,
): Promise<EstimateHomeValueResult> {
  const city = opts.city?.trim() || null;
  const community = opts.community?.trim() || null;
  const propertyType = parseResidentialPropertyType(opts.propertyType);
  const beds =
    opts.beds != null && Number.isFinite(opts.beds) ? opts.beds : null;
  const baths =
    opts.baths != null && Number.isFinite(opts.baths) ? opts.baths : null;
  const sqft = opts.sqft != null && opts.sqft > 0 ? opts.sqft : null;
  const hasCoords =
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  if (!city || !propertyType || beds == null || !hasCoords) {
    return insufficient(
      "missing_subject_characteristics",
      city,
      community,
    );
  }

  if (requiresSubjectSqft(propertyType) && sqft == null) {
    return insufficient("missing_subject_sqft", city, community);
  }

  const allowedTypes = compatiblePropertyTypes(propertyType);
  if (allowedTypes.length === 0) {
    return insufficient("unsupported_property_type", city, community);
  }

  const now = opts.now ?? new Date();
  const since = soldSinceDate(now);
  const limits = distanceLimitsKm(propertyType);

  let candidatesRaw: SoldCompCandidateV1[];

  if (opts.inventoryOverride) {
    candidatesRaw = opts.inventoryOverride;
  } else {
    const inventory = buildPrismaEntitledInventoryWhere({
      entitlement: opts.entitlement,
      dataSource: "mls",
      statuses: ["SOLD"],
    });
    if (inventory.kind === "empty") {
      return insufficient("no_entitled_inventory", city, community);
    }

    // Bounding box for primary expansion radius (avoid full-city scans).
    const boxPad = limits.expanded / 111; // ~deg latitude
    const lngPad =
      limits.expanded / (111 * Math.cos((opts.lat! * Math.PI) / 180));

    const rows = await prisma.listing.findMany({
      where: {
        AND: [
          inventory.where,
          {
            transactionType: "SALE",
            segment: "RESIDENTIAL",
            status: "SOLD",
            soldPrice: { gt: 50_000 },
            soldAt: { gte: since, not: null },
            city: { equals: city, mode: "insensitive" },
            propertyType: { in: [...allowedTypes] },
            beds: { gte: Math.max(beds - 1, 0), lte: beds + 1 },
            ...(baths != null
              ? { baths: { gte: Math.max(baths - 1, 0), lte: baths + 1 } }
              : {}),
            lat: { gte: opts.lat! - boxPad, lte: opts.lat! + boxPad },
            lng: { gte: opts.lng! - lngPad, lte: opts.lng! + lngPad },
          } satisfies Prisma.ListingWhereInput,
        ],
      },
      select: {
        soldPrice: true,
        soldAt: true,
        beds: true,
        baths: true,
        sqft: true,
        lat: true,
        lng: true,
        propertyType: true,
        city: true,
        community: true,
        parkingSpaces: true,
        yearBuilt: true,
        addressLine: true,
        unitNumber: true,
        listingKey: true,
        mlsNumber: true,
      },
      take: 200,
      orderBy: [{ soldAt: "desc" }],
    });

    candidatesRaw = rows
      .filter(
        (r): r is typeof r & { soldPrice: number; soldAt: Date } =>
          r.soldPrice != null && r.soldAt != null,
      )
      .map((r) => ({
        soldPrice: r.soldPrice,
        soldAt: r.soldAt,
        beds: r.beds,
        baths: r.baths,
        sqft: r.sqft,
        lat: r.lat,
        lng: r.lng,
        propertyType: r.propertyType,
        city: r.city,
        community: r.community,
        parkingSpaces: r.parkingSpaces,
        yearBuilt: r.yearBuilt,
        addressLine: r.addressLine,
        unitNumber: r.unitNumber,
        listingKey: r.listingKey,
        mlsNumber: r.mlsNumber,
      }));
  }

  const subject: SubjectForComps = {
    city,
    beds,
    baths,
    sqft,
    propertyType,
    lat: opts.lat!,
    lng: opts.lng!,
    community,
    basement: opts.basement,
    parkingSpaces: opts.parkingSpaces,
    yearBuilt: opts.yearBuilt,
  };

  const { kept: candidates } = filterHistoricalCandidates(candidatesRaw, {
    soldSince: since,
    soldAtBefore: opts.soldAtBefore,
    excludeMlsNumbers: opts.excludeMlsNumbers,
    excludeIdentityKeys: opts.excludeIdentityKeys,
    identityKey: v1IdentityKey,
  });

  function collect(maxKm: number) {
    return candidates
      .filter((row) => isEligibleSoldComp(row, subject, { maxKm, now }))
      .map((row) => ({
        row,
        score: scoreEligibleSoldComp(row, subject, { now }),
      }))
      .sort((a, b) => b.score - a.score);
  }

  let scored = collect(limits.primary);
  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    scored = collect(limits.expanded);
  }

  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    return insufficient("insufficient_sold_comps", city, community);
  }

  // Use top evidence set (cap), then drop weak similarity tails.
  const ranked = scored.slice(0, Math.min(12, scored.length));
  const bestScore = ranked[0]?.score ?? 0;
  const top = ranked.filter(
    (t) => t.score >= bestScore * MIN_SCORE_RATIO_OF_BEST,
  );
  if (top.length < MIN_ELIGIBLE_SOLDS) {
    return insufficient("insufficient_sold_comps", city, community);
  }

  if (subject.sqft == null && !compsSqftConsistent(top.map((t) => t.row.sqft))) {
    return insufficient("inconsistent_comp_sizes", city, community);
  }

  const range = weightedSoldEstimate(
    top.map((t) => ({ soldPrice: t.row.soldPrice, score: t.score })),
    {
      lowP: 0.25,
      highP: 0.75,
    },
  );
  if (!range) {
    return insufficient("inconsistent_sold_prices", city, community);
  }

  const soldCount = top.length;
  const confident =
    soldCount >= 5 &&
    Boolean(subject.sqft) &&
    baths != null &&
    top.every((t) => t.row.propertyType === propertyType) &&
    top.every((t) => t.row.sqft != null && t.row.sqft > 0);

  // Community sold average for context (same entitled query filters).
  const communityPrices = candidates
    .filter((c) => {
      if (!community) return false;
      return (
        c.community?.trim().toLowerCase() === community.toLowerCase() &&
        isEligibleSoldComp(c, subject, { maxKm: limits.expanded, now })
      );
    })
    .map((c) => c.soldPrice);
  const communityAvgSold =
    communityPrices.length > 0
      ? roundToNearest(
          communityPrices.reduce((a, b) => a + b, 0) / communityPrices.length,
        )
      : null;

  return {
    status: "OK",
    low: roundToNearest(range.low),
    mid: roundToNearest(range.mid),
    high: roundToNearest(range.high),
    sampleSize: top.length,
    soldCount,
    activeCount: 0,
    method: "sold_comps",
    confidence: confident ? "high" : "medium",
    city,
    community,
    communityAvgSold,
    communitySoldCount: communityPrices.length,
  };
}

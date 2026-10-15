/**
 * Frozen V2 baseline for V3 backtests. Production uses estimateHomeValue (V3).
 * Returns INSUFFICIENT_DATA when evidence is missing — never fabricates dollars.
 *
 * Size adjustment (when both subject and comp have exact sqft):
 *   rawRatio = subjectSqft / compSqft
 *   factor   = clamp(1 + SIZE_ELASTICITY * (rawRatio - 1), 1±MAX_SIZE_ADJ)
 *   adjusted = round(soldPrice * factor)
 * SIZE_ELASTICITY = 0.45 (sub-linear). MAX_SIZE_ADJ = 0.08 (±8% cap).
 * Never invents sqft from LivingAreaRange midpoints.
 */

import type { PropertyType, Prisma } from "@prisma/client";
import { haversineKm } from "@/lib/geo/distance";
import { parseListingFacts } from "@/lib/listings/facts";
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

export type ValuationConfidence = "low" | "medium" | "high";

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
  confidence: ValuationConfidence;
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
 * Coverage rescue floor: when a mixed same-city set would otherwise fall below
 * MIN_ELIGIBLE_SOLDS after the 0.4 ratio cut, relax toward this floor so nearby
 * hard-eligible city comps are not excluded solely by a same-community score cliff.
 */
const MIN_SCORE_RATIO_COVERAGE_FLOOR = 0.22;

/**
 * Sub-linear size elasticity: a 10% larger home does not imply +10% price.
 * Factor = 1 + SIZE_ELASTICITY * (subjectSqft/compSqft - 1), then capped.
 */
export const SIZE_ELASTICITY = 0.45;
/** Absolute bound on size adjustment multiplier (±8%). */
export const MAX_SIZE_ADJ = 0.08;

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

/**
 * Map MLS basement fact strings → finish class.
 * Missing / unrecognised → unknown (never treat as unfinished).
 */
export function parseBasementFinishFromFacts(
  basement: string[] | null | undefined,
): BasementFinish {
  const raw = (basement ?? []).join(" ").toLowerCase();
  if (!raw.trim()) return "unknown";
  if (/\bnone\b|no basement|crawl/.test(raw)) return "none";
  if (/unfinish|part(ly|ial)?\s*finish|rough/.test(raw)) return "unfinished";
  if (/finish|apart|rec\b|recreation|in-?law/.test(raw)) return "finished";
  return "unknown";
}

export type SoldCompCandidate = {
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
  basement?: BasementFinish | null;
};

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

function communitiesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right;
}

/**
 * Property identity for dedupe. Distinct condo units stay distinct.
 * Prefer normalized civic address + unit + city; listingKey alone is not enough
 * across relist cycles of the same home.
 */
export function soldCompIdentityKey(row: {
  addressLine?: string | null;
  unitNumber?: string | null;
  city: string;
  listingKey?: string | null;
  mlsNumber?: string | null;
  lat?: number;
  lng?: number;
}): string {
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

/**
 * Keep the most recent sold per property identity (by soldAt).
 * Distinct units never collapse into each other.
 */
export function dedupeSoldCompsByIdentity(
  rows: SoldCompCandidate[],
): SoldCompCandidate[] {
  const sorted = [...rows].sort(
    (a, b) => b.soldAt.getTime() - a.soldAt.getTime(),
  );
  const seen = new Set<string>();
  const out: SoldCompCandidate[] = [];
  for (const row of sorted) {
    const id = soldCompIdentityKey(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Conservative, bounded size normalization. Pure.
 * Returns factor=1 when either side lacks exact sqft (no invention).
 */
export function sizeAdjustedSoldPrice(
  soldPrice: number,
  subjectSqft: number | null | undefined,
  compSqft: number | null | undefined,
  opts?: { elasticity?: number; maxAdj?: number },
): { adjustedPrice: number; factor: number } {
  if (
    !(soldPrice > 0) ||
    subjectSqft == null ||
    compSqft == null ||
    !(subjectSqft > 0) ||
    !(compSqft > 0)
  ) {
    return { adjustedPrice: soldPrice, factor: 1 };
  }
  const elasticity = opts?.elasticity ?? SIZE_ELASTICITY;
  const maxAdj = opts?.maxAdj ?? MAX_SIZE_ADJ;
  const rawRatio = subjectSqft / compSqft;
  let factor = 1 + elasticity * (rawRatio - 1);
  factor = Math.min(1 + maxAdj, Math.max(1 - maxAdj, factor));
  return {
    adjustedPrice: Math.round(soldPrice * factor),
    factor,
  };
}

/**
 * Hard eligibility for a sold comparable. Pure — used by tests.
 */
export function isEligibleSoldComp(
  row: SoldCompCandidate,
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
 * Prefers same-community via soft boost/penalty — never a hard exclude.
 * Distance already shapes the base score; avoid a second cliff that zeroes
 * out valid same-city comps after neighbourhood expansion.
 */
export function scoreEligibleSoldComp(
  row: SoldCompCandidate,
  subject: SubjectForComps,
  opts?: { now?: Date },
): number {
  const d = haversineKm(subject.lat, subject.lng, row.lat, row.lng);
  const limits = distanceLimitsKm(subject.propertyType);
  let score = Math.max(0.12, 1 - d / (limits.expanded * 1.05));

  if (row.propertyType === subject.propertyType) score *= 1.4;

  const subjectCommunity = subject.community?.trim();
  const rowCommunity = row.community?.trim();
  if (subjectCommunity && rowCommunity) {
    if (communitiesMatch(subjectCommunity, rowCommunity)) {
      score *= 1.35;
    } else {
      // Soft cross-neighbourhood penalty (weighting only).
      score *= 0.88;
    }
  } else if (subjectCommunity && !rowCommunity) {
    score *= 0.92;
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

  const subjectBasement = subject.basement ?? "unknown";
  const rowBasement = row.basement ?? "unknown";
  if (subjectBasement !== "unknown" && rowBasement !== "unknown") {
    if (subjectBasement === rowBasement) score *= 1.12;
    else score *= 0.88;
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
 * Keep top scored comps, relaxing the relative-score floor only when needed
 * so neighbourhood expansion can still yield MIN_ELIGIBLE_SOLDS.
 */
export function selectTopScoredEvidence<T extends { score: number }>(
  ranked: T[],
  opts?: {
    minCount?: number;
    minRatio?: number;
    coverageFloor?: number;
    maxKeep?: number;
  },
): T[] {
  const minCount = opts?.minCount ?? MIN_ELIGIBLE_SOLDS;
  const minRatio = opts?.minRatio ?? MIN_SCORE_RATIO_OF_BEST;
  const coverageFloor =
    opts?.coverageFloor ?? MIN_SCORE_RATIO_COVERAGE_FLOOR;
  const maxKeep = opts?.maxKeep ?? 12;

  if (ranked.length < minCount) return [];
  const capped = ranked.slice(0, Math.min(maxKeep, ranked.length));
  const best = capped[0]?.score ?? 0;
  if (!(best > 0)) return [];

  const ratios = [minRatio, 0.32, 0.28, coverageFloor];
  for (const ratio of ratios) {
    const top = capped.filter((t) => t.score >= best * ratio);
    if (top.length >= minCount) return top;
  }

  // Last resort: compact top set of hard-eligible comps (already ranked).
  // Avoid dragging in the entire low-score tail.
  return capped.slice(0, minCount);
}

/**
 * Similarity-weighted low/mid/high from scored solds (prices already size-adjusted).
 * Caps any single comp’s weight share; clamps to the sold price range.
 */
export function weightedSoldEstimate(
  scored: ScoredSoldPrice[],
  opts?: { lowP?: number; highP?: number; minScoreRatio?: number },
): { low: number; mid: number; high: number } | null {
  if (scored.length < MIN_ELIGIBLE_SOLDS) return null;

  const positive = scored
    .filter((s) => s.soldPrice > 0 && Number.isFinite(s.score) && s.score > 0)
    .map((s) => ({ soldPrice: s.soldPrice, score: s.score }));
  if (positive.length < MIN_ELIGIBLE_SOLDS) return null;

  const sortedByScore = [...positive].sort((a, b) => b.score - a.score);
  const evidence = selectTopScoredEvidence(sortedByScore, {
    minRatio: opts?.minScoreRatio ?? MIN_SCORE_RATIO_OF_BEST,
  });
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

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!(mean > 0)) return 1;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Confidence V2 — quality of the evidence set, not quantity alone.
 * Weak / distant / mixed-neighbourhood sets never grade HIGH.
 */
export function classifyValuationConfidence(input: {
  soldCount: number;
  meanDistanceKm: number;
  primaryRadiusKm: number;
  sameCommunityShare: number;
  subjectCommunityKnown: boolean;
  recentShare180d: number;
  priceCv: number;
  hasSubjectSqft: boolean;
  hasBaths: boolean;
  allSameType: boolean;
  medianToBestScore: number;
}): ValuationConfidence {
  const {
    soldCount,
    meanDistanceKm,
    primaryRadiusKm,
    sameCommunityShare,
    subjectCommunityKnown,
    recentShare180d,
    priceCv,
    hasSubjectSqft,
    hasBaths,
    allSameType,
    medianToBestScore,
  } = input;

  const high =
    soldCount >= 5 &&
    hasSubjectSqft &&
    hasBaths &&
    allSameType &&
    meanDistanceKm <= primaryRadiusKm * 0.65 &&
    (!subjectCommunityKnown || sameCommunityShare >= 0.6) &&
    recentShare180d >= 0.5 &&
    priceCv <= 0.12 &&
    medianToBestScore >= 0.55;

  if (high) return "high";

  const low =
    soldCount < 4 ||
    meanDistanceKm > primaryRadiusKm ||
    (subjectCommunityKnown && sameCommunityShare < 0.34) ||
    priceCv > 0.18 ||
    !hasSubjectSqft ||
    recentShare180d < 0.34 ||
    medianToBestScore < 0.45;

  if (low) return "low";
  return "medium";
}

/**
 * Indicative home value from entitled recent solds only.
 */
export async function estimateHomeValueV2Baseline(
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
  } & HomeValueHistoricalInjection<SoldCompCandidate>,
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

  let candidatesRaw: SoldCompCandidate[];

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
        facts: true,
      },
      take: 200,
      orderBy: [{ soldAt: "desc" }],
    });

    candidatesRaw = rows
      .filter(
        (r): r is typeof r & { soldPrice: number; soldAt: Date } =>
          r.soldPrice != null && r.soldAt != null,
      )
      .map((r) => {
        const facts = parseListingFacts(r.facts);
        return {
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
          basement: parseBasementFinishFromFacts(facts?.basement),
        };
      });
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
    basement: opts.basement ?? "unknown",
    parkingSpaces: opts.parkingSpaces,
    yearBuilt: opts.yearBuilt,
  };

  const { kept: filtered } = filterHistoricalCandidates(candidatesRaw, {
    soldSince: since,
    soldAtBefore: opts.soldAtBefore,
    excludeMlsNumbers: opts.excludeMlsNumbers,
    excludeIdentityKeys: opts.excludeIdentityKeys,
    identityKey: soldCompIdentityKey,
  });

  const candidates = dedupeSoldCompsByIdentity(filtered);

  type ScoredRow = { row: SoldCompCandidate; score: number; distanceKm: number };

  function collect(maxKm: number, sameCommunityOnly: boolean): ScoredRow[] {
    return candidates
      .filter((row) => {
        if (!isEligibleSoldComp(row, subject, { maxKm, now })) return false;
        if (!sameCommunityOnly) return true;
        return communitiesMatch(subject.community, row.community);
      })
      .map((row) => ({
        row,
        score: scoreEligibleSoldComp(row, subject, { now }),
        distanceKm: haversineKm(subject.lat, subject.lng, row.lat, row.lng),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // Progressive neighbourhood fallback (hard filters), then soft score ranking:
  // 1) same-community @ primary radius
  // 2) same-city family @ primary radius
  // 3) same-community @ expanded radius
  // 4) same-city family @ expanded radius
  // Community / distance remain soft weights — not exclusion after expansion.
  let scored = collect(limits.primary, Boolean(community));
  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    scored = collect(limits.primary, false);
  }
  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    scored = collect(limits.expanded, Boolean(community));
  }
  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    scored = collect(limits.expanded, false);
  }

  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    return insufficient("insufficient_sold_comps", city, community);
  }

  const top = selectTopScoredEvidence(scored);
  if (top.length < MIN_ELIGIBLE_SOLDS) {
    return insufficient("insufficient_sold_comps", city, community);
  }
  const bestScore = top[0]?.score ?? 0;

  if (subject.sqft == null && !compsSqftConsistent(top.map((t) => t.row.sqft))) {
    return insufficient("inconsistent_comp_sizes", city, community);
  }

  const adjustedEvidence = top.map((t) => {
    const { adjustedPrice } = sizeAdjustedSoldPrice(
      t.row.soldPrice,
      subject.sqft,
      t.row.sqft,
    );
    return {
      soldPrice: adjustedPrice,
      score: t.score,
      distanceKm: t.distanceKm,
      row: t.row,
    };
  });

  const range = weightedSoldEstimate(
    adjustedEvidence.map((t) => ({
      soldPrice: t.soldPrice,
      score: t.score,
    })),
    {
      lowP: 0.25,
      highP: 0.75,
    },
  );
  if (!range) {
    return insufficient("inconsistent_sold_prices", city, community);
  }

  const soldCount = top.length;
  const adjustedPrices = adjustedEvidence.map((t) => t.soldPrice);
  const meanDistanceKm =
    adjustedEvidence.reduce((a, t) => a + t.distanceKm, 0) /
    adjustedEvidence.length;
  const subjectCommunityKnown = Boolean(community);
  const sameCommunityShare = subjectCommunityKnown
    ? adjustedEvidence.filter((t) =>
        communitiesMatch(community, t.row.community),
      ).length / soldCount
    : 1;
  const recentShare180d =
    adjustedEvidence.filter(
      (t) =>
        (now.getTime() - t.row.soldAt.getTime()) / (1000 * 60 * 60 * 24) <= 180,
    ).length / soldCount;
  const scores = adjustedEvidence.map((t) => t.score);
  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianScore = sortedScores[Math.floor(sortedScores.length / 2)]!;
  const confidence = classifyValuationConfidence({
    soldCount,
    meanDistanceKm,
    primaryRadiusKm: limits.primary,
    sameCommunityShare,
    subjectCommunityKnown,
    recentShare180d,
    priceCv: coefficientOfVariation(adjustedPrices),
    hasSubjectSqft: Boolean(subject.sqft),
    hasBaths: baths != null,
    allSameType: top.every((t) => t.row.propertyType === propertyType),
    medianToBestScore: bestScore > 0 ? medianScore / bestScore : 0,
  });

  // Community sold average for context (same entitled query filters).
  const communityPrices = candidates
    .filter((c) => {
      if (!community) return false;
      return (
        communitiesMatch(community, c.community) &&
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
    confidence,
    city,
    community,
    communityAvgSold,
    communitySoldCount: communityPrices.length,
  };
}

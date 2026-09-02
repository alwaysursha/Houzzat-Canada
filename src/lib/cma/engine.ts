/**
 * Stage 5.12A — Deterministic Advanced CMA engine.
 *
 * Stage A: bounded Neon candidate retrieval (bbox + filters)
 * Stage B: score / widen / sold vs competition / outliers / analysis
 *
 * No AI. No price circularity in selection.
 */

import type { ListingStatus, PropertyType } from "@prisma/client";
import { haversineKm } from "@/lib/geo/distance";
import { CMA_ENGINE_CONFIG, type CmaWidenPass } from "@/lib/cma/config";
import {
  CMA_JSON_VERSION,
  type CmaAnalysis,
  type CmaSelectedComp,
  type CmaSubjectSnapshot,
} from "@/lib/cma/schema";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { prisma } from "@/lib/prisma";

type ListingRow = {
  mlsNumber: string;
  status: ListingStatus;
  propertyType: PropertyType;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  yearBuilt: number | null;
  taxes: number | null;
  maintenanceFee: number | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  daysOnMarket: number;
  listedAt: Date;
  soldAt: Date | null;
  facts: unknown;
  media: { url: string; isPrimary: boolean }[];
};

function relatedTypes(type: string): PropertyType[] {
  switch (type) {
    case "DETACHED":
      return ["DETACHED"];
    case "SEMI_DETACHED":
      return ["SEMI_DETACHED", "DETACHED"];
    case "TOWNHOUSE":
      return ["TOWNHOUSE", "CONDO_TOWNHOUSE"];
    case "CONDO_TOWNHOUSE":
      return ["CONDO_TOWNHOUSE", "TOWNHOUSE"];
    case "CONDO_APT":
      return ["CONDO_APT"];
    case "MULTIPLEX":
      return ["MULTIPLEX", "SEMI_DETACHED"];
    default:
      return [type as PropertyType];
  }
}

function normalizeAddressKey(addressLine: string, unit: string | null): string {
  return `${addressLine.trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}`;
}

function bboxFromRadiusKm(lat: number, lng: number, km: number) {
  const latDelta = km / 111.32;
  const lngDelta = km / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);
  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lng - lngDelta,
    east: lng + lngDelta,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function scoreWeights(propertyType: string) {
  if (propertyType === "CONDO_APT") {
    return {
      type: 18,
      sameBuilding: 22,
      community: 10,
      distance: 12,
      sqft: 14,
      beds: 8,
      baths: 4,
      parking: 4,
      fee: 4,
      recency: 14,
      lot: 0,
      age: 2,
    };
  }
  if (propertyType === "TOWNHOUSE" || propertyType === "CONDO_TOWNHOUSE") {
    return {
      type: 18,
      sameBuilding: 6,
      community: 14,
      distance: 14,
      sqft: 14,
      beds: 10,
      baths: 4,
      parking: 8,
      fee: 0,
      recency: 12,
      lot: 4,
      age: 4,
    };
  }
  // DETACHED / SEMI / default
  return {
    type: 16,
    sameBuilding: 4,
    community: 14,
    distance: 14,
    sqft: 14,
    beds: 10,
    baths: 4,
    parking: 6,
    fee: 0,
    recency: 12,
    lot: 10,
    age: 4,
  };
}

function toSubjectSnapshot(row: ListingRow): CmaSubjectSnapshot {
  const facts = parseListingFacts(row.facts);
  return {
    version: CMA_JSON_VERSION,
    mlsNumber: row.mlsNumber,
    addressLine: row.addressLine,
    unitNumber: row.unitNumber,
    city: row.city,
    community: row.community,
    postalCode: row.postalCode,
    propertyType: String(row.propertyType),
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    livingAreaRange: facts?.livingAreaRange ?? null,
    parkingSpaces: row.parkingSpaces,
    yearBuilt: row.yearBuilt,
    taxes: row.taxes,
    maintenanceFee: row.maintenanceFee,
    listPrice: row.listPrice,
    lat: row.lat,
    lng: row.lng,
    lotSizeArea:
      facts?.lotSizeArea != null ? String(facts.lotSizeArea) : null,
    lotSizeUnits: facts?.lotSizeUnits ?? null,
    garageType: facts?.garageType ?? null,
    architecturalStyle: facts?.architecturalStyle ?? undefined,
  };
}

function toCompProperty(row: ListingRow) {
  const facts = parseListingFacts(row.facts);
  const primary =
    row.media.find((m) => m.isPrimary)?.url ?? row.media[0]?.url ?? null;
  return {
    addressLine: row.addressLine,
    unitNumber: row.unitNumber,
    city: row.city,
    community: row.community,
    postalCode: row.postalCode,
    propertyType: String(row.propertyType),
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    livingAreaRange: facts?.livingAreaRange ?? null,
    parkingSpaces: row.parkingSpaces,
    yearBuilt: row.yearBuilt,
    maintenanceFee: row.maintenanceFee,
    listPrice: row.listPrice,
    soldPrice: row.soldPrice,
    soldAt: row.soldAt?.toISOString() ?? null,
    listedAt: row.listedAt.toISOString(),
    daysOnMarket: row.daysOnMarket,
    status: String(row.status),
    lat: row.lat,
    lng: row.lng,
    coverImageUrl: primary ? listingPhotoSrc(primary) ?? primary : null,
    lotSizeArea:
      facts?.lotSizeArea != null ? String(facts.lotSizeArea) : null,
    garageType: facts?.garageType ?? null,
  };
}

function scoreCandidate(
  subject: CmaSubjectSnapshot,
  row: ListingRow,
  now: Date,
): {
  score: number;
  reasons: string[];
  negativeReasons: string[];
  distanceKm: number;
  role: "SOLD" | "ACTIVE" | "CONDITIONAL";
} {
  const w = scoreWeights(subject.propertyType);
  const distanceKm = haversineKm(subject.lat, subject.lng, row.lat, row.lng);
  const reasons: string[] = [];
  const negativeReasons: string[] = [];
  let score = 0;

  const role: "SOLD" | "ACTIVE" | "CONDITIONAL" =
    row.status === "SOLD"
      ? "SOLD"
      : row.status === "SOLD_CONDITIONAL"
        ? "CONDITIONAL"
        : "ACTIVE";

  if (row.propertyType === subject.propertyType) {
    score += w.type;
    reasons.push("Same property type");
  } else if (relatedTypes(subject.propertyType).includes(row.propertyType)) {
    score += w.type * 0.55;
    reasons.push("Related property type");
  } else {
    negativeReasons.push("Different property type");
  }

  const sameBuilding =
    normalizeAddressKey(subject.addressLine, subject.unitNumber) !==
      normalizeAddressKey(row.addressLine, row.unitNumber) &&
    subject.addressLine.trim().toLowerCase() ===
      row.addressLine.trim().toLowerCase();
  // Same civic building (different unit) — strong for condos
  const sameCivic =
    subject.addressLine.trim().toLowerCase() ===
      row.addressLine.trim().toLowerCase() &&
    (subject.unitNumber ?? "") !== (row.unitNumber ?? "");
  if (sameCivic || sameBuilding) {
    score += w.sameBuilding;
    reasons.push("Same building / civic address");
  }

  if (
    subject.community &&
    row.community &&
    subject.community.toLowerCase() === row.community.toLowerCase()
  ) {
    score += w.community;
    reasons.push("Same community");
  } else if (subject.community && row.community) {
    negativeReasons.push("Different community");
  }

  // Distance (no price circularity)
  if (distanceKm <= 0.4) {
    score += w.distance;
    reasons.push(`${distanceKm.toFixed(1)} km away`);
  } else if (distanceKm <= 1.5) {
    score += w.distance * 0.85;
    reasons.push(`${distanceKm.toFixed(1)} km away`);
  } else if (distanceKm <= 3) {
    score += w.distance * 0.55;
    reasons.push(`${distanceKm.toFixed(1)} km away`);
  } else if (distanceKm <= 8) {
    score += w.distance * 0.25;
    reasons.push(`${distanceKm.toFixed(1)} km away`);
  } else {
    negativeReasons.push("Farther than preferred radius");
  }

  if (subject.sqft && row.sqft) {
    const pct = Math.abs(row.sqft - subject.sqft) / subject.sqft;
    if (pct <= 0.04) {
      score += w.sqft;
      reasons.push("Sqft within 4%");
    } else if (pct <= 0.15) {
      score += w.sqft * 0.75;
      reasons.push("Sqft within 15%");
    } else if (pct <= 0.35) {
      score += w.sqft * 0.35;
    } else {
      negativeReasons.push("Significant size mismatch");
    }
  } else {
    negativeReasons.push("Sqft incomplete");
  }

  if (Math.abs(row.beds - subject.beds) < 0.1) {
    score += w.beds;
    reasons.push("Same bed count");
  } else if (Math.abs(row.beds - subject.beds) <= 1) {
    score += w.beds * 0.5;
  } else {
    negativeReasons.push("Bed count differs");
  }

  if (Math.abs(row.baths - subject.baths) < 0.25) {
    score += w.baths;
    reasons.push("Same bath count");
  }

  if (subject.parkingSpaces != null && row.parkingSpaces != null) {
    if (row.parkingSpaces === subject.parkingSpaces) {
      score += w.parking;
    } else if (Math.abs(row.parkingSpaces - subject.parkingSpaces) <= 1) {
      score += w.parking * 0.5;
    }
  }

  if (
    w.fee > 0 &&
    subject.maintenanceFee != null &&
    row.maintenanceFee != null &&
    subject.maintenanceFee > 0
  ) {
    const pct =
      Math.abs(row.maintenanceFee - subject.maintenanceFee) /
      subject.maintenanceFee;
    if (pct <= 0.2) score += w.fee;
  }

  if (role === "SOLD" && row.soldAt) {
    const age = daysBetween(now, row.soldAt);
    const half = CMA_ENGINE_CONFIG.soldHalfLifeDays;
    const recencyFactor = Math.pow(0.5, age / half);
    score += w.recency * recencyFactor;
    if (age <= 30) reasons.push(`Sold ${Math.round(age)} days ago`);
    else if (age <= 120) reasons.push(`Sold ${Math.round(age)} days ago`);
    else negativeReasons.push("Older sale");
  } else if (role !== "SOLD") {
    // competition — modest recency on list freshness
    score += w.recency * 0.35;
  }

  const subjectFacts = subject.lotSizeArea;
  const rowFacts = parseListingFacts(row.facts)?.lotSizeArea;
  if (w.lot > 0 && subjectFacts && rowFacts) {
    score += w.lot * 0.6;
    reasons.push("Lot size available for both");
  } else if (w.lot > 0) {
    negativeReasons.push("Lot size unknown");
  }

  if (w.age > 0 && subject.yearBuilt && row.yearBuilt) {
    if (Math.abs(subject.yearBuilt - row.yearBuilt) <= 10) {
      score += w.age;
    } else {
      negativeReasons.push("Age band differs");
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    negativeReasons,
    distanceKm: Math.round(distanceKm * 10) / 10,
    role,
  };
}

function withinSqftTolerance(
  subjectSqft: number | null,
  rowSqft: number | null,
  tolerance: number,
): boolean {
  if (!subjectSqft || !rowSqft) return true; // don't hard-fail incomplete
  return Math.abs(rowSqft - subjectSqft) / subjectSqft <= tolerance;
}

function applyPassFilter(
  subject: CmaSubjectSnapshot,
  row: ListingRow,
  pass: CmaWidenPass,
  now: Date,
): boolean {
  const distanceKm = haversineKm(subject.lat, subject.lng, row.lat, row.lng);
  if (distanceKm > pass.maxKm) return false;
  if (!withinSqftTolerance(subject.sqft, row.sqft, pass.sqftTolerance)) {
    return false;
  }
  if (row.status === "SOLD" && row.soldAt) {
    if (daysBetween(now, row.soldAt) > pass.maxSoldAgeDays) return false;
  }
  if (pass.sameCommunityPreferred && subject.community && row.community) {
    // Soft preference handled in scoring; pass 1 still allows others but
    // we keep hard filter only for extreme mismatches — no hard community gate.
  }
  return true;
}

function flagOutliers(sold: CmaSelectedComp[]): CmaSelectedComp[] {
  const prices = sold
    .map((c) => c.property.soldPrice)
    .filter((p): p is number => typeof p === "number" && p > 0)
    .sort((a, b) => a - b);
  if (prices.length < 4) return sold;
  const q1 = prices[Math.floor(prices.length * 0.25)]!;
  const q3 = prices[Math.floor(prices.length * 0.75)]!;
  const iqr = q3 - q1;
  const low = q1 - CMA_ENGINE_CONFIG.outlierIqrMultiplier * iqr;
  const high = q3 + CMA_ENGINE_CONFIG.outlierIqrMultiplier * iqr;
  return sold.map((c) => {
    const price = c.property.soldPrice;
    if (price == null) return c;
    if (price < low || price > high) {
      return {
        ...c,
        outlier: true,
        outlierReason: "Sold price far from peer set (IQR)",
      };
    }
    return c;
  });
}

function dedupeByCivicSold(rows: ListingRow[]): ListingRow[] {
  const best = new Map<string, ListingRow>();
  for (const row of rows) {
    if (row.status !== "SOLD") continue;
    const key = normalizeAddressKey(row.addressLine, row.unitNumber);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, row);
      continue;
    }
    const prevMs = prev.soldAt?.getTime() ?? 0;
    const nextMs = row.soldAt?.getTime() ?? 0;
    if (nextMs >= prevMs) best.set(key, row);
  }
  const soldKeys = new Set(best.keys());
  const out: ListingRow[] = [...best.values()];
  for (const row of rows) {
    if (row.status === "SOLD") continue;
    const key = normalizeAddressKey(row.addressLine, row.unitNumber);
    // Prefer sold transaction over active duplicate of same unit
    if (soldKeys.has(key)) continue;
    out.push(row);
  }
  return out;
}

function buildAnalysis(
  sold: CmaSelectedComp[],
  active: CmaSelectedComp[],
  conditional: CmaSelectedComp[],
  widenStage: number,
): CmaAnalysis {
  const soldPrices = sold
    .filter((c) => !c.outlier)
    .map((c) => c.property.soldPrice)
    .filter((p): p is number => typeof p === "number" && p > 0);
  const withOutliers = sold
    .map((c) => c.property.soldPrice)
    .filter((p): p is number => typeof p === "number" && p > 0);

  const pps = sold
    .filter((c) => !c.outlier && c.property.soldPrice && c.property.sqft)
    .map((c) => c.property.soldPrice! / c.property.sqft!);

  const med = median(soldPrices.length ? soldPrices : withOutliers);
  const medPps = median(pps);
  const observedLow = soldPrices.length
    ? Math.min(...soldPrices)
    : withOutliers.length
      ? Math.min(...withOutliers)
      : null;
  const observedHigh = soldPrices.length
    ? Math.max(...soldPrices)
    : withOutliers.length
      ? Math.max(...withOutliers)
      : null;

  // Score-weighted mid (sold only, non-outlier preferred)
  const weightedPool = sold.filter(
    (c) => !c.outlier && c.property.soldPrice && c.property.soldPrice > 0,
  );
  let weightedMid: number | null = null;
  if (weightedPool.length) {
    let num = 0;
    let den = 0;
    for (const c of weightedPool) {
      const w = Math.max(c.score, 1);
      num += c.property.soldPrice! * w;
      den += w;
    }
    weightedMid = den > 0 ? Math.round(num / den) : null;
  }

  const strong = sold.filter(
    (c) => c.score >= CMA_ENGINE_CONFIG.strongScoreFloor && !c.outlier,
  ).length;
  const medianDist = median(sold.map((c) => c.distanceKm));
  const limitedInventory = strong < CMA_ENGINE_CONFIG.minStrongSoldForGood;

  let confidence: CmaAnalysis["confidence"] = "LIMITED";
  const confidenceReasons: string[] = [];
  if (strong >= CMA_ENGINE_CONFIG.minStrongSoldForHigh && widenStage <= 1) {
    confidence = "HIGH";
    confidenceReasons.push(`${strong} strong recent comps`);
  } else if (strong >= CMA_ENGINE_CONFIG.minStrongSoldForGood) {
    confidence = "GOOD";
    confidenceReasons.push(`${strong} usable sold comps`);
  } else {
    confidence = "LIMITED";
    confidenceReasons.push("Limited strong sold inventory");
  }
  if (medianDist != null) {
    confidenceReasons.push(`Median distance ${medianDist.toFixed(1)} km`);
  }
  if (widenStage >= 2) {
    confidenceReasons.push(`Search expanded to stage ${widenStage}`);
  }

  const spread =
    weightedMid != null
      ? Math.round(weightedMid * 0.04)
      : med != null
        ? Math.round(med * 0.04)
        : 0;
  const mid = weightedMid ?? med;

  return {
    version: CMA_JSON_VERSION,
    soldCompCount: sold.length,
    activeCompCount: active.length,
    conditionalCompCount: conditional.length,
    medianSoldPrice: med != null ? Math.round(med) : null,
    medianPricePerSqft: medPps != null ? Math.round(medPps) : null,
    observedSoldLow: observedLow,
    observedSoldHigh: observedHigh,
    weightedIndicatedLow: mid != null ? mid - spread : null,
    weightedIndicatedMid: mid,
    weightedIndicatedHigh: mid != null ? mid + spread : null,
    confidence,
    confidenceReasons,
    widenStage,
    marketContext:
      active.length + conditional.length > 0
        ? `${active.length} active and ${conditional.length} conditional listings provide competition context (not sold evidence).`
        : "Limited active/conditional competition in the selected set.",
    limitedInventory,
  };
}

export type FindAdvancedCompsResult = {
  subject: CmaSubjectSnapshot;
  selectedComps: CmaSelectedComp[];
  analysis: CmaAnalysis;
  candidateCount: number;
  summary: string;
};

export async function findAdvancedComps(input: {
  subjectMls: string;
  excludeMls?: string[];
}): Promise<FindAdvancedCompsResult | { error: string }> {
  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: input.subjectMls },
    include: {
      media: {
        select: { url: true, isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 3,
      },
    },
  });
  if (!listing) return { error: "Subject listing not found" };

  const subjectRow = listing as unknown as ListingRow;
  const subject = toSubjectSnapshot(subjectRow);
  const now = new Date();
  const types = relatedTypes(subject.propertyType);
  const maxKm = CMA_ENGINE_CONFIG.passes[2]!.maxKm;
  const box = bboxFromRadiusKm(subject.lat, subject.lng, maxKm);

  const candidates = (await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      transactionType: "SALE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      propertyType: { in: types },
      status: { in: ["SOLD", "ACTIVE", "SOLD_CONDITIONAL"] },
      mlsNumber: {
        notIn: [
          subject.mlsNumber ?? input.subjectMls,
          ...(input.excludeMls ?? []),
        ],
      },
      lat: { gte: box.south, lte: box.north },
      lng: { gte: box.west, lte: box.east },
      OR: [
        { status: "SOLD", soldPrice: { not: null, gt: 0 } },
        { status: { in: ["ACTIVE", "SOLD_CONDITIONAL"] } },
      ],
      ...(subject.beds != null
        ? {
            beds: {
              gte: Math.max(subject.beds - 1.5, 0),
              lte: subject.beds + 1.5,
            },
          }
        : {}),
    },
    include: {
      media: {
        select: { url: true, isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
    take: CMA_ENGINE_CONFIG.candidatePoolMax,
    orderBy: [{ soldAt: "desc" }, { updatedAtMls: "desc" }],
  })) as unknown as ListingRow[];

  const deduped = dedupeByCivicSold(candidates);
  let widenStage = 0;
  let chosenSold: ListingRow[] = [];
  let chosenComp: ListingRow[] = [];

  for (const pass of CMA_ENGINE_CONFIG.passes) {
    widenStage = pass.stage;
    const filtered = deduped.filter((row) =>
      applyPassFilter(subject, row, pass, now),
    );
    chosenSold = filtered.filter(
      (r) => r.status === "SOLD" && r.soldPrice && r.soldPrice > 0,
    );
    chosenComp = filtered.filter(
      (r) => r.status === "ACTIVE" || r.status === "SOLD_CONDITIONAL",
    );
    if (chosenSold.length >= CMA_ENGINE_CONFIG.minStrongSoldForGood) break;
  }

  const scoredSold = chosenSold
    .map((row) => {
      const s = scoreCandidate(subject, row, now);
      return {
        mlsNumber: row.mlsNumber,
        source: "AUTO" as const,
        role: s.role,
        score: s.score,
        reasons: s.reasons,
        negativeReasons: s.negativeReasons,
        outlier: false,
        distanceKm: s.distanceKm,
        property: toCompProperty(row),
      } satisfies CmaSelectedComp;
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    .slice(0, CMA_ENGINE_CONFIG.defaultSoldLimit);

  const scoredComp = chosenComp
    .map((row) => {
      const s = scoreCandidate(subject, row, now);
      return {
        mlsNumber: row.mlsNumber,
        source: "AUTO" as const,
        role: s.role,
        score: s.score,
        reasons: s.reasons,
        negativeReasons: s.negativeReasons,
        outlier: false,
        distanceKm: s.distanceKm,
        property: toCompProperty(row),
      } satisfies CmaSelectedComp;
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    .slice(0, CMA_ENGINE_CONFIG.defaultCompetitionLimit);

  const soldFlagged = flagOutliers(scoredSold);
  const selectedComps = [...soldFlagged, ...scoredComp];
  const analysis = buildAnalysis(
    soldFlagged,
    scoredComp.filter((c) => c.role === "ACTIVE"),
    scoredComp.filter((c) => c.role === "CONDITIONAL"),
    widenStage,
  );

  const summaryParts = [
    analysis.limitedInventory
      ? "LIMITED COMPARABLE INVENTORY — search was expanded."
      : `Based on ${analysis.soldCompCount} sold comps`,
    analysis.medianSoldPrice != null
      ? `median sold ~$${analysis.medianSoldPrice.toLocaleString()}`
      : null,
    analysis.weightedIndicatedLow != null &&
    analysis.weightedIndicatedHigh != null
      ? `indicated range $${analysis.weightedIndicatedLow.toLocaleString()} – $${analysis.weightedIndicatedHigh.toLocaleString()}`
      : null,
    "Draft for agent review only — not a formal appraisal.",
  ].filter(Boolean);

  return {
    subject,
    selectedComps,
    analysis,
    candidateCount: deduped.length,
    summary: summaryParts.join(". "),
  };
}

/** Recompute analysis from an agent-edited selectedComps list. */
export function analyzeSelectedComps(
  items: CmaSelectedComp[],
  widenStage = 1,
): CmaAnalysis {
  const sold = items.filter((c) => c.role === "SOLD");
  const active = items.filter((c) => c.role === "ACTIVE");
  const conditional = items.filter((c) => c.role === "CONDITIONAL");
  return buildAnalysis(flagOutliers(sold), active, conditional, widenStage);
}

export { formatBedsPlusLabel, toSubjectSnapshot };

/**
 * Read-only paired V1 vs V2 accuracy analysis on the frozen historical holdout.
 *
 * - Same subject membership / hash split as home-value-historical-backtest
 * - No formula changes, no DB writes, aggregate metrics only
 *
 * Run: node --import tsx scripts/home-value-paired-holdout-analysis.ts
 */
import { createHash } from "node:crypto";
import { config } from "dotenv";
import type { PropertyType } from "@prisma/client";
import { haversineKm } from "../src/lib/geo/distance";
import { parseListingFacts } from "../src/lib/listings/facts";
import {
  absolutePercentageError,
  filterHistoricalCandidates,
  median,
  summarizeAccuracy,
} from "../src/lib/market/home-value-estimate-historical";
import {
  dedupeSoldCompsByIdentity,
  distanceLimitsKm,
  estimateHomeValue,
  isEligibleSoldComp,
  parseBasementFinishFromFacts,
  scoreEligibleSoldComp,
  selectTopScoredEvidence,
  soldCompIdentityKey,
  type SoldCompCandidate,
  type ValuationConfidence,
} from "../src/lib/market/home-value-estimate";
import { estimateHomeValueV1Baseline } from "../src/lib/market/home-value-estimate-v1-baseline";
import { prisma } from "../src/lib/prisma";
import {
  buildPrismaEntitledInventoryWhere,
  resolveWorkspaceListingEntitlement,
  type WorkspaceListingEntitlement,
} from "../src/lib/tenancy/listing-entitlement";

config({ path: ".env.local" });
config();

const RESIDENTIAL: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
];

const MAX_SUBJECTS = Number(process.env.HOME_VALUE_BACKTEST_MAX_SUBJECTS ?? 400);
const MIN_SOLD_PRICE = 50_000;
const MIN_ELIGIBLE_SOLDS = 3;
const SOLD_WINDOW_MONTHS = 12;

type SubjectRow = {
  mlsNumber: string;
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
  parkingSpaces: number;
  yearBuilt: number | null;
  addressLine: string;
  unitNumber: string | null;
  listingKey: string | null;
  facts: unknown;
};

function isHoldout(mlsNumber: string): boolean {
  const h = createHash("sha256").update(mlsNumber).digest();
  return h[0]! % 5 === 0;
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return n.toFixed(digits);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function withinBand(apes: number[], band: number): number | null {
  if (apes.length === 0) return null;
  return (apes.filter((a) => a <= band).length / apes.length) * 100;
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

function toCandidate(row: SubjectRow): SoldCompCandidate {
  const facts = parseListingFacts(row.facts);
  return {
    soldPrice: row.soldPrice,
    soldAt: row.soldAt,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    lat: row.lat,
    lng: row.lng,
    propertyType: row.propertyType,
    city: row.city,
    community: row.community,
    parkingSpaces: row.parkingSpaces,
    yearBuilt: row.yearBuilt,
    addressLine: row.addressLine,
    unitNumber: row.unitNumber,
    listingKey: row.listingKey,
    mlsNumber: row.mlsNumber,
    basement: parseBasementFinishFromFacts(facts?.basement),
  };
}

/** Reconstruct V2 evidence set distance stats (analysis only — no formula change). */
function approximateV2EvidenceStats(
  subject: SubjectRow,
  inventory: SoldCompCandidate[],
): { soldCount: number; meanDistanceKm: number | null } {
  const asOf = subject.soldAt;
  const since = new Date(asOf);
  since.setMonth(since.getMonth() - SOLD_WINDOW_MONTHS);
  const identity = soldCompIdentityKey(toCandidate(subject));
  const { kept } = filterHistoricalCandidates(inventory, {
    soldSince: since,
    soldAtBefore: asOf,
    excludeMlsNumbers: [subject.mlsNumber],
    excludeIdentityKeys: [identity],
    identityKey: soldCompIdentityKey,
  });
  const candidates = dedupeSoldCompsByIdentity(kept);
  const subj = {
    city: subject.city,
    beds: subject.beds,
    baths: subject.baths,
    sqft: subject.sqft,
    propertyType: subject.propertyType,
    lat: subject.lat,
    lng: subject.lng,
    community: subject.community,
    basement: parseBasementFinishFromFacts(
      parseListingFacts(subject.facts)?.basement,
    ),
    parkingSpaces: subject.parkingSpaces,
    yearBuilt: subject.yearBuilt,
  };
  const limits = distanceLimitsKm(subject.propertyType);
  const community = subject.community?.trim() || null;

  function collect(maxKm: number, sameCommunityOnly: boolean) {
    return candidates
      .filter((row) => {
        if (!isEligibleSoldComp(row, subj, { maxKm, now: asOf })) return false;
        if (!sameCommunityOnly) return true;
        return communitiesMatch(community, row.community);
      })
      .map((row) => ({
        row,
        score: scoreEligibleSoldComp(row, subj, { now: asOf }),
        distanceKm: haversineKm(subj.lat, subj.lng, row.lat, row.lng),
      }))
      .sort((a, b) => b.score - a.score);
  }

  let scored = collect(limits.primary, Boolean(community));
  if (scored.length < MIN_ELIGIBLE_SOLDS) scored = collect(limits.primary, false);
  if (scored.length < MIN_ELIGIBLE_SOLDS) {
    scored = collect(limits.expanded, Boolean(community));
  }
  if (scored.length < MIN_ELIGIBLE_SOLDS) scored = collect(limits.expanded, false);

  const top = selectTopScoredEvidence(scored);
  if (top.length < MIN_ELIGIBLE_SOLDS) {
    return { soldCount: 0, meanDistanceKm: null };
  }
  return {
    soldCount: top.length,
    meanDistanceKm: mean(top.map((t) => t.distanceKm)),
  };
}

async function resolveEntitlement(): Promise<WorkspaceListingEntitlement | null> {
  const forced = process.env.HOME_VALUE_BACKTEST_WORKSPACE_ID?.trim();
  if (forced) {
    return resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: forced,
      prisma,
    });
  }
  const membership = await prisma.workspaceRealEstateOrganizationMembership.findFirst({
    where: { status: "VERIFIED" },
    select: { workspaceId: true },
    orderBy: { workspaceId: "asc" },
  });
  if (!membership?.workspaceId) return null;
  return resolveWorkspaceListingEntitlement({
    trustedWorkspaceId: membership.workspaceId,
    prisma,
  });
}

type EngineOk = {
  mid: number;
  ape: number;
  confidence: ValuationConfidence | null;
  soldCount: number | null;
  meanDistanceKm: number | null;
};

async function main() {
  console.log("home-value-paired-holdout-analysis: starting (read-only)");

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("LIMITATION: DATABASE_URL is not set.");
    process.exit(2);
  }

  const entitlement = await resolveEntitlement();
  if (!entitlement || entitlement.authorities.length === 0) {
    console.log("LIMITATION: No MLS entitlement authorities found.");
    process.exit(2);
  }

  const inventoryWhere = buildPrismaEntitledInventoryWhere({
    entitlement,
    dataSource: "mls",
    statuses: ["SOLD"],
  });
  if (inventoryWhere.kind === "empty") {
    console.log("LIMITATION: Entitled SOLD inventory predicate is empty.");
    process.exit(2);
  }

  const soldRows = await prisma.listing.findMany({
    where: {
      AND: [
        inventoryWhere.where,
        {
          transactionType: "SALE",
          segment: "RESIDENTIAL",
          status: "SOLD",
          soldPrice: { gt: MIN_SOLD_PRICE },
          soldAt: { not: null },
          propertyType: { in: RESIDENTIAL },
          beds: { gte: 0 },
        },
      ],
    },
    select: {
      mlsNumber: true,
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
      facts: true,
    },
    orderBy: [{ soldAt: "desc" }],
    take: 50_000,
  });

  const usable = soldRows.filter(
    (r): r is typeof r & { soldPrice: number; soldAt: Date } =>
      r.soldPrice != null &&
      r.soldAt != null &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng),
  );

  console.log(
    `inventory: entitled_sold_rows=${usable.length} (aggregate only; no restricted fields logged)`,
  );

  const inventory: SoldCompCandidate[] = usable.map((r) =>
    toCandidate(r as SubjectRow),
  );

  const newestMs = usable[0]!.soldAt.getTime();
  const oldestMs = usable[usable.length - 1]!.soldAt.getTime();
  const spanDays = (newestMs - oldestMs) / (1000 * 60 * 60 * 24);
  const lookbackDays = spanDays >= 120 ? 90 : spanDays >= 60 ? 30 : 0;
  const minSubjectSoldAt = oldestMs + lookbackDays * 24 * 60 * 60 * 1000;

  let subjects = usable.filter(
    (r) =>
      r.soldAt.getTime() >= minSubjectSoldAt &&
      r.sqft != null &&
      r.sqft > 0,
  );
  if (subjects.length < 80) {
    subjects = usable.filter((r) => r.sqft != null && r.sqft > 0);
  }
  if (subjects.length < 40) {
    subjects = usable.slice(0, Math.max(40, Math.floor(usable.length / 2)));
  }

  const perType: SubjectRow[] = [];
  const typeBuckets = new Map<string, SubjectRow[]>();
  for (const s of subjects) {
    const list = typeBuckets.get(s.propertyType) ?? [];
    list.push(s as SubjectRow);
    typeBuckets.set(s.propertyType, list);
  }
  const types = [...typeBuckets.keys()].sort();
  let guard = 0;
  while (perType.length < MAX_SUBJECTS && guard < MAX_SUBJECTS * 4) {
    guard += 1;
    let added = false;
    for (const t of types) {
      const list = typeBuckets.get(t);
      const next = list?.shift();
      if (!next) continue;
      perType.push(next);
      added = true;
      if (perType.length >= MAX_SUBJECTS) break;
    }
    if (!added) break;
  }

  const holdoutSubjects = perType.filter((s) => isHoldout(s.mlsNumber));
  console.log(
    `frozen_holdout_subjects=${holdoutSubjects.length} (sha256(mls)%5===0; membership unchanged)`,
  );

  const paired: Array<{ v1: EngineOk; v2: EngineOk; delta: number }> = [];
  const v2Only: EngineOk[] = [];
  const v1Only: EngineOk[] = [];
  const neither = { count: 0 };
  const byConfidence = new Map<
    ValuationConfidence,
    { apes: number[]; soldCounts: number[]; distances: number[] }
  >();

  for (const subject of holdoutSubjects) {
    const asOf = subject.soldAt;
    const identity = soldCompIdentityKey(toCandidate(subject));
    const common = {
      city: subject.city,
      community: subject.community,
      beds: subject.beds,
      baths: subject.baths,
      sqft: subject.sqft,
      propertyType: subject.propertyType,
      lat: subject.lat,
      lng: subject.lng,
      parkingSpaces: subject.parkingSpaces,
      yearBuilt: subject.yearBuilt,
      basement: parseBasementFinishFromFacts(
        parseListingFacts(subject.facts)?.basement,
      ),
      entitlement,
      now: asOf,
      soldAtBefore: asOf,
      excludeMlsNumbers: [subject.mlsNumber],
      excludeIdentityKeys: [identity],
      inventoryOverride: inventory,
    };

    const [r1, r2] = await Promise.all([
      estimateHomeValueV1Baseline(common),
      estimateHomeValue(common),
    ]);

    const ape1 =
      r1.status === "OK"
        ? absolutePercentageError(r1.mid, subject.soldPrice)
        : null;
    const ape2 =
      r2.status === "OK"
        ? absolutePercentageError(r2.mid, subject.soldPrice)
        : null;

    const v1Ok: EngineOk | null =
      r1.status === "OK" && ape1
        ? {
            mid: r1.mid,
            ape: ape1.ape,
            confidence: null,
            soldCount: r1.soldCount,
            meanDistanceKm: null,
          }
        : null;

    let v2Ok: EngineOk | null = null;
    if (r2.status === "OK" && ape2) {
      const approx = approximateV2EvidenceStats(subject, inventory);
      v2Ok = {
        mid: r2.mid,
        ape: ape2.ape,
        confidence: r2.confidence,
        soldCount: r2.soldCount,
        meanDistanceKm: approx.meanDistanceKm,
      };
      const bucket = byConfidence.get(r2.confidence) ?? {
        apes: [],
        soldCounts: [],
        distances: [],
      };
      bucket.apes.push(ape2.ape);
      bucket.soldCounts.push(r2.soldCount);
      if (approx.meanDistanceKm != null) {
        bucket.distances.push(approx.meanDistanceKm);
      }
      byConfidence.set(r2.confidence, bucket);
    }

    if (v1Ok && v2Ok) {
      paired.push({ v1: v1Ok, v2: v2Ok, delta: v1Ok.ape - v2Ok.ape });
    } else if (v2Ok && !v1Ok) {
      v2Only.push(v2Ok);
    } else if (v1Ok && !v2Ok) {
      v1Only.push(v1Ok);
    } else {
      neither.count += 1;
    }
  }

  const pairedV1 = paired.map((p) => p.v1.ape);
  const pairedV2 = paired.map((p) => p.v2.ape);
  const improved = paired.filter((p) => p.delta > 0.01).length;
  const worsened = paired.filter((p) => p.delta < -0.01).length;
  const tied = paired.length - improved - worsened;
  const medianDelta = median(paired.map((p) => p.delta));

  console.log("\n=== 1. PAIRED (both V1 and V2 valid) ===");
  console.log(`paired_n=${paired.length}`);
  console.log(
    `V1 | MdAPE=${fmtPct(median(pairedV1))} | MAPE=${fmtPct(mean(pairedV1))} | ±5%=${fmtPct(withinBand(pairedV1, 5))} | ±10%=${fmtPct(withinBand(pairedV1, 10))} | ±15%=${fmtPct(withinBand(pairedV1, 15))}`,
  );
  console.log(
    `V2 | MdAPE=${fmtPct(median(pairedV2))} | MAPE=${fmtPct(mean(pairedV2))} | ±5%=${fmtPct(withinBand(pairedV2, 5))} | ±10%=${fmtPct(withinBand(pairedV2, 10))} | ±15%=${fmtPct(withinBand(pairedV2, 15))}`,
  );
  console.log(
    `V2 improved=${improved} | worsened=${worsened} | tied≈${tied} | median(V1APE−V2APE)=${fmtPct(medianDelta)} (positive = V2 better)`,
  );

  const v2OnlyApes = v2Only.map((r) => r.ape);
  const v2OnlyConf = new Map<string, number>();
  for (const r of v2Only) {
    const k = r.confidence ?? "unknown";
    v2OnlyConf.set(k, (v2OnlyConf.get(k) ?? 0) + 1);
  }
  console.log("\n=== 2. V2-ONLY (V1 insufficient) ===");
  console.log(`v2_only_n=${v2Only.length}`);
  console.log(
    `MdAPE=${fmtPct(median(v2OnlyApes))} | MAPE=${fmtPct(mean(v2OnlyApes))} | ±10%=${fmtPct(withinBand(v2OnlyApes, 10))}`,
  );
  console.log(
    `confidence_mix=${JSON.stringify(Object.fromEntries(v2OnlyConf))}`,
  );
  console.log(
    `mean_comp_count=${fmtNum(mean(v2Only.map((r) => r.soldCount ?? NaN).filter((n) => Number.isFinite(n))), 2)} | mean_distance_km=${fmtNum(mean(v2Only.map((r) => r.meanDistanceKm).filter((n): n is number => n != null)), 2)}`,
  );

  const v1OnlyApes = v1Only.map((r) => r.ape);
  console.log("\n=== 3. V1-ONLY (V2 insufficient) ===");
  console.log(`v1_only_n=${v1Only.length}`);
  console.log(
    `MdAPE=${fmtPct(median(v1OnlyApes))} | MAPE=${fmtPct(mean(v1OnlyApes))} | ±10%=${fmtPct(withinBand(v1OnlyApes, 10))}`,
  );

  console.log("\n=== 4. NEITHER ===");
  console.log(`neither_n=${neither.count}`);

  console.log("\n=== 5. V2 CONFIDENCE vs ACTUAL ERROR (all V2-valid holdout) ===");
  for (const level of ["high", "medium", "low"] as const) {
    const row = byConfidence.get(level);
    if (!row || row.apes.length === 0) {
      console.log(`${level}: n=0`);
      continue;
    }
    console.log(
      `${level}: n=${row.apes.length} | MdAPE=${fmtPct(median(row.apes))} | MAPE=${fmtPct(mean(row.apes))} | ±10%=${fmtPct(withinBand(row.apes, 10))} | mean_comps=${fmtNum(mean(row.soldCounts), 2)} | mean_km=${fmtNum(mean(row.distances), 2)}`,
    );
  }

  // Aggregate coverage reminder (matches prior holdout report shape).
  const allV1 = summarizeAccuracy(
    [...pairedV1, ...v1OnlyApes],
    holdoutSubjects.length - paired.length - v1Only.length,
  );
  const allV2 = summarizeAccuracy(
    [...pairedV2, ...v2OnlyApes],
    holdoutSubjects.length - paired.length - v2Only.length,
  );
  console.log("\n=== 6. HOLDOUT AGGREGATE (reference) ===");
  console.log(
    `V1 valid=${allV1.nValid} insuff=${fmtPct(allV1.insufficientRate * 100, 1)} MdAPE=${fmtPct(allV1.mdape)} ±10%=${fmtPct(allV1.within10)}`,
  );
  console.log(
    `V2 valid=${allV2.nValid} insuff=${fmtPct(allV2.insufficientRate * 100, 1)} MdAPE=${fmtPct(allV2.mdape)} ±10%=${fmtPct(allV2.within10)}`,
  );

  console.log("\n=== RECOMMENDATION ===");
  const pairedV2Better =
    paired.length >= 10 &&
    median(pairedV2) != null &&
    median(pairedV1) != null &&
    median(pairedV2)! + 0.25 < median(pairedV1)!;
  const pairedSimilar =
    paired.length >= 10 &&
    median(pairedV2) != null &&
    median(pairedV1) != null &&
    Math.abs(median(pairedV2)! - median(pairedV1)!) <= 0.75;
  const coverageGain = allV2.nValid > allV1.nValid;
  const v2OnlyAcceptable =
    v2Only.length === 0 ||
    ((median(v2OnlyApes) ?? 99) <= (median(pairedV1) ?? 99) + 3 &&
      (withinBand(v2OnlyApes, 10) ?? 0) >= 45);

  if (pairedV2Better && coverageGain) {
    console.log("SHIP V2");
  } else if (pairedSimilar && coverageGain && v2OnlyAcceptable) {
    console.log("SHIP V2 WITH RESTRICTIONS");
  } else if (pairedSimilar && coverageGain) {
    console.log("SHIP V2 WITH RESTRICTIONS");
  } else {
    console.log("KEEP V1");
  }

  console.log("home-value-paired-holdout-analysis: done");
}

main().catch((error) => {
  console.error(
    "[paired-analysis] failed",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});

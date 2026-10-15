/**
 * Read-only V2 vs V3 historical accuracy backtest on entitled Neon SOLD inventory.
 *
 * Run: pnpm home-value-historical-backtest
 *
 * - No DB writes, no sync, no schema changes
 * - Aggregate metrics only (no sold prices / addresses in logs)
 * - Holdout split by mlsNumber hash (final metrics = holdout)
 * - Do not tune thresholds using this holdout
 */
import { createHash } from "node:crypto";
import { config } from "dotenv";
import type { PropertyType } from "@prisma/client";
import {
  absolutePercentageError,
  summarizeAccuracy,
  type AccuracyBucketStats,
} from "../src/lib/market/home-value-estimate-historical";
import {
  estimateHomeValue,
  parseBasementFinishFromFacts,
  soldCompIdentityKey,
  type SoldCompCandidate,
  type ValuationEvidenceStage,
} from "../src/lib/market/home-value-estimate";
import { estimateHomeValueV2Baseline } from "../src/lib/market/home-value-estimate-v2-baseline";
import { parseListingFacts } from "../src/lib/listings/facts";
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

const FOCUS_CITIES = [
  "Kitchener",
  "Waterloo",
  "Cambridge",
  "Mississauga",
  "Brampton",
] as const;

const MAX_SUBJECTS = Number(process.env.HOME_VALUE_BACKTEST_MAX_SUBJECTS ?? 500);
const MIN_SOLD_PRICE = 50_000;

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

function printBucket(label: string, s: AccuracyBucketStats) {
  console.log(
    [
      label,
      `valid=${s.nValid}`,
      `insufficient=${s.nInsufficient} (${fmtPct(s.insufficientRate * 100, 1)})`,
      `coverage=${fmtPct((1 - s.insufficientRate) * 100, 1)}`,
      `MdAPE=${fmtPct(s.mdape)}`,
      `MAPE=${fmtPct(s.mape)}`,
      `±10%=${fmtPct(s.within10)}`,
      `±20%=${fmtPct(s.within20)}`,
    ].join(" | "),
  );
}

function toCandidate(row: SubjectRow): SoldCompCandidate {
  const facts = parseListingFacts(row.facts);
  return {
    soldPrice: row.soldPrice,
    soldAt: row.soldAt,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    livingAreaRange: facts?.livingAreaRange ?? null,
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

type EngineErrors = {
  apes: number[];
  nInsufficient: number;
  reasons: Map<string, number>;
  byType: Map<string, { apes: number[]; nInsufficient: number }>;
  byCity: Map<string, { apes: number[]; nInsufficient: number }>;
  byStage: Map<string, { apes: number[]; nInsufficient: number }>;
  missingSize: { apes: number[]; nInsufficient: number };
  pairedWorse: number;
  pairedBetter: number;
  flags: {
    futureLeakAttempts: number;
    subjectLeakAttempts: number;
  };
};

function emptyErrors(): EngineErrors {
  return {
    apes: [],
    nInsufficient: 0,
    reasons: new Map(),
    byType: new Map(),
    byCity: new Map(),
    byStage: new Map(),
    missingSize: { apes: [], nInsufficient: 0 },
    pairedWorse: 0,
    pairedBetter: 0,
    flags: { futureLeakAttempts: 0, subjectLeakAttempts: 0 },
  };
}

function bucketGet(
  map: Map<string, { apes: number[]; nInsufficient: number }>,
  key: string,
) {
  let row = map.get(key);
  if (!row) {
    row = { apes: [], nInsufficient: 0 };
    map.set(key, row);
  }
  return row;
}

async function runEngineOnSubject(opts: {
  engine: "v2" | "v3";
  subject: SubjectRow;
  inventory: SoldCompCandidate[];
  entitlement: WorkspaceListingEntitlement;
}): Promise<{
  mid: number | null;
  insufficient: boolean;
  reason?: string;
  evidenceStage?: ValuationEvidenceStage;
}> {
  const asOf = opts.subject.soldAt;
  const facts = parseListingFacts(opts.subject.facts);
  const identity = soldCompIdentityKey(toCandidate(opts.subject));
  const common = {
    city: opts.subject.city,
    community: opts.subject.community,
    beds: opts.subject.beds,
    baths: opts.subject.baths,
    sqft: opts.subject.sqft,
    livingAreaRange: facts?.livingAreaRange ?? null,
    propertyType: opts.subject.propertyType,
    lat: opts.subject.lat,
    lng: opts.subject.lng,
    parkingSpaces: opts.subject.parkingSpaces,
    yearBuilt: opts.subject.yearBuilt,
    basement: parseBasementFinishFromFacts(facts?.basement),
    entitlement: opts.entitlement,
    now: asOf,
    soldAtBefore: asOf,
    excludeMlsNumbers: [opts.subject.mlsNumber],
    excludeIdentityKeys: [identity],
    inventoryOverride: opts.inventory,
  };

  const result =
    opts.engine === "v2"
      ? await estimateHomeValueV2Baseline(common)
      : await estimateHomeValue(common);

  if (result.status !== "OK") {
    return { mid: null, insufficient: true, reason: result.reason };
  }
  return {
    mid: result.mid,
    insufficient: false,
    evidenceStage:
      "evidenceStage" in result
        ? (result.evidenceStage as ValuationEvidenceStage)
        : undefined,
  };
}

async function main() {
  console.log("home-value-historical-backtest: starting (read-only V2 vs V3)");

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      "LIMITATION: DATABASE_URL is not set. Cannot run live backtest.",
    );
    process.exit(2);
  }

  const entitlement = await resolveEntitlement();
  if (!entitlement || entitlement.authorities.length === 0) {
    console.log(
      "LIMITATION: No workspace with MLS listing entitlement authorities found.",
    );
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

  const focusLower = FOCUS_CITIES.map((c) => c.toLowerCase());

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
          OR: focusLower.map((c) => ({
            city: { equals: c, mode: "insensitive" as const },
          })),
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
    `inventory: focus_sold_rows=${usable.length} cities=${FOCUS_CITIES.join(",")} workspace=${entitlement.workspaceId}`,
  );

  if (usable.length < 50) {
    console.log(
      "LIMITATION: Fewer than 50 entitled sold rows in focus cities.",
    );
    process.exit(2);
  }

  const inventory: SoldCompCandidate[] = usable.map((r) =>
    toCandidate(r as SubjectRow),
  );

  const newestMs = usable[0]!.soldAt.getTime();
  const oldestMs = usable[usable.length - 1]!.soldAt.getTime();
  const spanDays = (newestMs - oldestMs) / (1000 * 60 * 60 * 24);
  const lookbackDays = spanDays >= 120 ? 90 : spanDays >= 60 ? 30 : 0;
  const minSubjectSoldAt = oldestMs + lookbackDays * 24 * 60 * 60 * 1000;

  // Include missing-size freeholds (V3 coverage target). Condos without size
  // remain excluded from subject pool when they lack range+sqft.
  let subjects = usable.filter((r) => {
    if (r.soldAt.getTime() < minSubjectSoldAt) return false;
    const condo =
      r.propertyType === "CONDO_APT" || r.propertyType === "CONDO_TOWNHOUSE";
    if (!condo) return true;
    if (r.sqft != null && r.sqft > 0) return true;
    const facts = parseListingFacts(r.facts);
    return Boolean(facts?.livingAreaRange?.trim());
  });

  // Stratify by city × size-known/missing so the holdout reports both cohorts.
  // Sample design only — does not change engine thresholds.
  const perCity: SubjectRow[] = [];
  const citySizeBuckets = new Map<string, SubjectRow[]>();
  for (const s of subjects) {
    const hasSqft = s.sqft != null && s.sqft > 0;
    const key = `${s.city.trim().toLowerCase()}|${hasSqft ? "sqft" : "nosqft"}`;
    const list = citySizeBuckets.get(key) ?? [];
    list.push(s as SubjectRow);
    citySizeBuckets.set(key, list);
  }
  const bucketKeys = [...citySizeBuckets.keys()].sort();
  let guard = 0;
  while (perCity.length < MAX_SUBJECTS && guard < MAX_SUBJECTS * 8) {
    guard += 1;
    let added = false;
    for (const key of bucketKeys) {
      const list = citySizeBuckets.get(key);
      const next = list?.shift();
      if (!next) continue;
      perCity.push(next);
      added = true;
      if (perCity.length >= MAX_SUBJECTS) break;
    }
    if (!added) break;
  }
  subjects = perCity;

  const holdoutSubjects = subjects.filter((s) => isHoldout(s.mlsNumber));
  const developSubjects = subjects.filter((s) => !isHoldout(s.mlsNumber));

  console.log(
    `pool_span_days=${spanDays.toFixed(0)} lookback_days=${lookbackDays} subjects=${subjects.length} holdout=${holdoutSubjects.length} develop=${developSubjects.length}`,
  );
  console.log(
    `missing_sqft_subjects=${subjects.filter((s) => s.sqft == null || s.sqft <= 0).length}`,
  );

  async function evaluate(
    label: string,
    subjectList: SubjectRow[],
  ): Promise<{ v2: EngineErrors; v3: EngineErrors }> {
    const v2 = emptyErrors();
    const v3 = emptyErrors();

    for (const subject of subjectList) {
      const asOf = subject.soldAt.getTime();
      const futureInPool = inventory.filter((c) => c.soldAt.getTime() >= asOf)
        .length;
      if (futureInPool > 0) v2.flags.futureLeakAttempts += 1;

      const subjectId = soldCompIdentityKey(toCandidate(subject));
      const subjectInPool = inventory.some(
        (c) =>
          c.mlsNumber?.toUpperCase() === subject.mlsNumber.toUpperCase() ||
          soldCompIdentityKey(c) === subjectId,
      );
      if (subjectInPool) {
        v2.flags.subjectLeakAttempts += 1;
        v3.flags.subjectLeakAttempts += 1;
      }

      const missingSize = subject.sqft == null || subject.sqft <= 0;
      const outs: Record<
        "v2" | "v3",
        Awaited<ReturnType<typeof runEngineOnSubject>>
      > = {
        v2: await runEngineOnSubject({
          engine: "v2",
          subject,
          inventory,
          entitlement,
        }),
        v3: await runEngineOnSubject({
          engine: "v3",
          subject,
          inventory,
          entitlement,
        }),
      };

      for (const engine of ["v2", "v3"] as const) {
        const err = engine === "v2" ? v2 : v3;
        const out = outs[engine];
        const typeBucket = bucketGet(err.byType, subject.propertyType);
        const cityBucket = bucketGet(err.byCity, subject.city);
        const stageKey = out.evidenceStage ?? "none";
        const stageBucket = bucketGet(err.byStage, stageKey);

        if (out.insufficient || out.mid == null) {
          err.nInsufficient += 1;
          typeBucket.nInsufficient += 1;
          cityBucket.nInsufficient += 1;
          stageBucket.nInsufficient += 1;
          if (missingSize) err.missingSize.nInsufficient += 1;
          const reason = out.reason ?? "unknown";
          err.reasons.set(reason, (err.reasons.get(reason) ?? 0) + 1);
          continue;
        }
        const ape = absolutePercentageError(out.mid, subject.soldPrice);
        if (!ape) {
          err.nInsufficient += 1;
          typeBucket.nInsufficient += 1;
          cityBucket.nInsufficient += 1;
          if (missingSize) err.missingSize.nInsufficient += 1;
          continue;
        }
        err.apes.push(ape.ape);
        typeBucket.apes.push(ape.ape);
        cityBucket.apes.push(ape.ape);
        stageBucket.apes.push(ape.ape);
        if (missingSize) err.missingSize.apes.push(ape.ape);
      }

      // Paired accuracy: both OK.
      if (
        !outs.v2.insufficient &&
        !outs.v3.insufficient &&
        outs.v2.mid != null &&
        outs.v3.mid != null
      ) {
        const a2 = absolutePercentageError(outs.v2.mid, subject.soldPrice);
        const a3 = absolutePercentageError(outs.v3.mid, subject.soldPrice);
        if (a2 && a3) {
          if (a3.ape > a2.ape + 5) v3.pairedWorse += 1;
          if (a3.ape + 5 < a2.ape) v3.pairedBetter += 1;
        }
      }
    }

    console.log(`\n=== ${label} ===`);
    printBucket("V2", summarizeAccuracy(v2.apes, v2.nInsufficient));
    printBucket("V3", summarizeAccuracy(v3.apes, v3.nInsufficient));

    console.log("by property type:");
    const types = new Set([...v2.byType.keys(), ...v3.byType.keys()]);
    for (const t of [...types].sort()) {
      const a = summarizeAccuracy(
        v2.byType.get(t)?.apes ?? [],
        v2.byType.get(t)?.nInsufficient ?? 0,
      );
      const b = summarizeAccuracy(
        v3.byType.get(t)?.apes ?? [],
        v3.byType.get(t)?.nInsufficient ?? 0,
      );
      console.log(
        `  ${t}: V2 cov=${fmtPct((1 - a.insufficientRate) * 100)} MdAPE=${fmtPct(a.mdape)} n=${a.nValid}/${a.nValid + a.nInsufficient} | V3 cov=${fmtPct((1 - b.insufficientRate) * 100)} MdAPE=${fmtPct(b.mdape)} n=${b.nValid}/${b.nValid + b.nInsufficient}`,
      );
    }

    console.log("by focus city:");
    for (const city of FOCUS_CITIES) {
      const key = city;
      const a = summarizeAccuracy(
        v2.byCity.get(key)?.apes ??
          [...v2.byCity.entries()].find(
            ([c]) => c.toLowerCase() === key.toLowerCase(),
          )?.[1].apes ??
          [],
        v2.byCity.get(key)?.nInsufficient ??
          [...v2.byCity.entries()].find(
            ([c]) => c.toLowerCase() === key.toLowerCase(),
          )?.[1].nInsufficient ??
          0,
      );
      const bEntry = [...v3.byCity.entries()].find(
        ([c]) => c.toLowerCase() === key.toLowerCase(),
      );
      const b = summarizeAccuracy(
        bEntry?.[1].apes ?? [],
        bEntry?.[1].nInsufficient ?? 0,
      );
      if (a.nValid + a.nInsufficient === 0 && b.nValid + b.nInsufficient === 0) {
        continue;
      }
      console.log(
        `  ${city}: V2 cov=${fmtPct((1 - a.insufficientRate) * 100)} MdAPE=${fmtPct(a.mdape)} ±10%=${fmtPct(a.within10)} | V3 cov=${fmtPct((1 - b.insufficientRate) * 100)} MdAPE=${fmtPct(b.mdape)} ±10%=${fmtPct(b.within10)}`,
      );
    }

    console.log("by V3 evidence stage:");
    for (const [stage, row] of [...v3.byStage.entries()].sort()) {
      const s = summarizeAccuracy(row.apes, row.nInsufficient);
      console.log(
        `  ${stage}: valid=${s.nValid} insuff=${s.nInsufficient} MdAPE=${fmtPct(s.mdape)} ±10%=${fmtPct(s.within10)} ±20%=${fmtPct(s.within20)}`,
      );
    }

    const missV2 = summarizeAccuracy(
      v2.missingSize.apes,
      v2.missingSize.nInsufficient,
    );
    const missV3 = summarizeAccuracy(
      v3.missingSize.apes,
      v3.missingSize.nInsufficient,
    );
    console.log(
      `missing-size subjects: V2 valid=${missV2.nValid} insuff=${missV2.nInsufficient} MdAPE=${fmtPct(missV2.mdape)} | V3 valid=${missV3.nValid} insuff=${missV3.nInsufficient} MdAPE=${fmtPct(missV3.mdape)} ±20%=${fmtPct(missV3.within20)}`,
    );
    console.log(
      `paired both-OK: V3 materially worse(+5pp APE)=${v3.pairedWorse} better=${v3.pairedBetter}`,
    );
    console.log("insufficient reasons V2:", Object.fromEntries(v2.reasons));
    console.log("insufficient reasons V3:", Object.fromEntries(v3.reasons));

    return { v2, v3 };
  }

  const split = (process.env.HOME_VALUE_BACKTEST_SPLIT ?? "holdout")
    .trim()
    .toLowerCase();

  if (split === "develop" || split === "both") {
    if (developSubjects.length > 0) {
      await evaluate(
        "DEVELOP (calibration only — not final judgment)",
        developSubjects as SubjectRow[],
      );
    }
  }

  if (split === "holdout" || split === "both") {
    const holdout = await evaluate(
      "HOLDOUT (primary — do not tune on this)",
      holdoutSubjects as SubjectRow[],
    );

    const h2 = summarizeAccuracy(holdout.v2.apes, holdout.v2.nInsufficient);
    const h3 = summarizeAccuracy(holdout.v3.apes, holdout.v3.nInsufficient);

    console.log("\n=== VERDICT (holdout V2 vs V3) ===");
    if (h3.nValid + h3.nInsufficient < 20) {
      console.log("INCONCLUSIVE — holdout sample too thin.");
    } else {
      const covGain =
        (1 - h3.insufficientRate) * 100 - (1 - h2.insufficientRate) * 100;
      const mdapeDelta =
        h2.mdape != null && h3.mdape != null ? h3.mdape - h2.mdape : null;
      const within10Delta =
        h2.within10 != null && h3.within10 != null
          ? h3.within10 - h2.within10
          : null;
      console.log(
        `coverage_gain_pp=${covGain.toFixed(1)} MdAPE_delta_pp=${mdapeDelta == null ? "n/a" : mdapeDelta.toFixed(2)} within10_delta_pp=${within10Delta == null ? "n/a" : within10Delta.toFixed(2)} paired_worse=${holdout.v3.pairedWorse}`,
      );

      const coverageBetter = covGain >= 8;
      const accuracyOk =
        mdapeDelta == null ||
        mdapeDelta <= 2.5 ||
        (h3.mdape != null && h3.mdape <= 18);
      const withinOk =
        within10Delta == null ||
        within10Delta >= -4 ||
        (h3.within10 != null && h3.within10 >= 40);
      const notTooManyWorse = holdout.v3.pairedWorse <= Math.max(8, Math.floor((h3.nValid || 1) * 0.25));

      if (coverageBetter && accuracyOk && withinOk && notTooManyWorse) {
        console.log(
          "RECOMMENDATION: SHIP — coverage improves with acceptable accuracy tradeoff.",
        );
      } else if (coverageBetter && (!accuracyOk || !withinOk)) {
        console.log(
          "RECOMMENDATION: REVISE — coverage up but accuracy regression needs tighter region/size guards.",
        );
      } else if (!coverageBetter && accuracyOk) {
        console.log(
          "RECOMMENDATION: REVISE — accuracy stable but coverage gain insufficient.",
        );
      } else {
        console.log(
          "RECOMMENDATION: DO NOT SHIP — coverage/accuracy not acceptable on holdout.",
        );
      }
    }
  }

  console.log("home-value-historical-backtest: done");
}

main().catch((error) => {
  console.error(
    "[backtest] failed",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});

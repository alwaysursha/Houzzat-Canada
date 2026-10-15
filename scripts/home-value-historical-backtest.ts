/**
 * Read-only V1 vs V2 historical accuracy backtest on entitled Neon SOLD inventory.
 *
 * Run: pnpm home-value-historical-backtest
 *
 * - No DB writes, no sync, no schema changes
 * - Aggregate metrics only (no sold prices / addresses in logs)
 * - Holdout split by mlsNumber hash (final metrics = holdout)
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
} from "../src/lib/market/home-value-estimate";
import { estimateHomeValueV1Baseline } from "../src/lib/market/home-value-estimate-v1-baseline";
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

const MAX_SUBJECTS = Number(process.env.HOME_VALUE_BACKTEST_MAX_SUBJECTS ?? 400);
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
      `MdAPE=${fmtPct(s.mdape)}`,
      `MAPE=${fmtPct(s.mape)}`,
      `±5%=${fmtPct(s.within5)}`,
      `±10%=${fmtPct(s.within10)}`,
      `±15%=${fmtPct(s.within15)}`,
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
  engine: "v1" | "v2";
  subject: SubjectRow;
  inventory: SoldCompCandidate[];
  entitlement: WorkspaceListingEntitlement;
}): Promise<{ mid: number | null; insufficient: boolean; reason?: string }> {
  const asOf = opts.subject.soldAt;
  const identity = soldCompIdentityKey(toCandidate(opts.subject));
  const common = {
    city: opts.subject.city,
    community: opts.subject.community,
    beds: opts.subject.beds,
    baths: opts.subject.baths,
    sqft: opts.subject.sqft,
    propertyType: opts.subject.propertyType,
    lat: opts.subject.lat,
    lng: opts.subject.lng,
    parkingSpaces: opts.subject.parkingSpaces,
    yearBuilt: opts.subject.yearBuilt,
    basement: parseBasementFinishFromFacts(
      parseListingFacts(opts.subject.facts)?.basement,
    ),
    entitlement: opts.entitlement,
    now: asOf,
    soldAtBefore: asOf,
    excludeMlsNumbers: [opts.subject.mlsNumber],
    excludeIdentityKeys: [identity],
    inventoryOverride: opts.inventory,
  };

  const result =
    opts.engine === "v1"
      ? await estimateHomeValueV1Baseline(common)
      : await estimateHomeValue(common);

  if (result.status !== "OK") {
    return { mid: null, insufficient: true, reason: result.reason };
  }
  return { mid: result.mid, insufficient: false };
}

async function main() {
  console.log("home-value-historical-backtest: starting (read-only)");

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      "LIMITATION: DATABASE_URL is not set. Cannot run live backtest.",
    );
    console.log(
      "Pure leakage/metrics selftest remains available via home-value-historical-backtest:selftest",
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

  // Pull a broad entitled sold pool (no address/price logging).
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
    // Wider history so each subject has a real 12-month prior comp window.
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
    `inventory: entitled_sold_rows=${usable.length} workspace=${entitlement.workspaceId} authorities=${entitlement.authorities.length}`,
  );

  if (usable.length < 50) {
    console.log(
      "LIMITATION: Fewer than 50 entitled sold rows — sample too thin for a meaningful backtest.",
    );
    process.exit(2);
  }

  const inventory: SoldCompCandidate[] = usable.map((r) =>
    toCandidate(r as SubjectRow),
  );

  // Subjects = newer portion of the entitled pool so prior comps exist in-inventory.
  // Require at least 30d of lookback inside the fetched pool; if the pool span is
  // shorter, fall back to the newest half of rows.
  const newestMs = usable[0]!.soldAt.getTime();
  const oldestMs = usable[usable.length - 1]!.soldAt.getTime();
  const spanDays = (newestMs - oldestMs) / (1000 * 60 * 60 * 24);
  const lookbackDays = spanDays >= 120 ? 90 : spanDays >= 60 ? 30 : 0;
  const minSubjectSoldAt = oldestMs + lookbackDays * 24 * 60 * 60 * 1000;

  // Prefer subjects with exact sqft so both engines can produce comparable OK rates
  // (condos require sqft; freehold without sqft often hits inconsistent_comp_sizes).
  // This is sample selection for evaluation — not formula calibration.
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
  // Stratify lightly by type so one type does not dominate the holdout.
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
  subjects = perType;
  console.log(
    `pool_span_days=${spanDays.toFixed(0)} lookback_days=${lookbackDays} subject_candidates=${subjects.length} (sqft-known stratified)`,
  );

  const holdoutSubjects = subjects.filter((s) => isHoldout(s.mlsNumber));
  const developSubjects = subjects.filter((s) => !isHoldout(s.mlsNumber));

  console.log(
    `subjects: total=${subjects.length} holdout=${holdoutSubjects.length} develop=${developSubjects.length} (metrics below = HOLDOUT)`,
  );

  if (holdoutSubjects.length < 20) {
    console.log(
      "LIMITATION: Holdout subject count < 20 after split — reporting develop+holdout separately; treat results as exploratory.",
    );
  }

  async function evaluate(
    label: string,
    subjectList: SubjectRow[],
  ): Promise<{ v1: EngineErrors; v2: EngineErrors }> {
    const v1 = emptyErrors();
    const v2 = emptyErrors();

    for (const subject of subjectList) {
      // Leakage probes (aggregate counts only).
      const asOf = subject.soldAt.getTime();
      const futureInPool = inventory.filter((c) => c.soldAt.getTime() >= asOf).length;
      if (futureInPool > 0) v1.flags.futureLeakAttempts += 1;
      // Engines must exclude via soldAtBefore — counted as "attempts present in raw pool".

      const subjectId = soldCompIdentityKey(toCandidate(subject));
      const subjectInPool = inventory.some(
        (c) =>
          c.mlsNumber?.toUpperCase() === subject.mlsNumber.toUpperCase() ||
          soldCompIdentityKey(c) === subjectId,
      );
      if (subjectInPool) {
        v1.flags.subjectLeakAttempts += 1;
        v2.flags.subjectLeakAttempts += 1;
      }

      for (const engine of ["v1", "v2"] as const) {
        const err = engine === "v1" ? v1 : v2;
        const out = await runEngineOnSubject({
          engine,
          subject,
          inventory,
          entitlement,
        });
        const typeBucket = bucketGet(err.byType, subject.propertyType);
        const cityBucket = bucketGet(err.byCity, subject.city);

        if (out.insufficient || out.mid == null) {
          err.nInsufficient += 1;
          typeBucket.nInsufficient += 1;
          cityBucket.nInsufficient += 1;
          const reason = out.reason ?? "unknown";
          err.reasons.set(reason, (err.reasons.get(reason) ?? 0) + 1);
          continue;
        }
        const ape = absolutePercentageError(out.mid, subject.soldPrice);
        if (!ape) {
          err.nInsufficient += 1;
          typeBucket.nInsufficient += 1;
          cityBucket.nInsufficient += 1;
          continue;
        }
        err.apes.push(ape.ape);
        typeBucket.apes.push(ape.ape);
        cityBucket.apes.push(ape.ape);
      }
    }

    console.log(`\n=== ${label} ===`);
    printBucket("V1", summarizeAccuracy(v1.apes, v1.nInsufficient));
    printBucket("V2", summarizeAccuracy(v2.apes, v2.nInsufficient));

    const s1 = summarizeAccuracy(v1.apes, v1.nInsufficient);
    const s2 = summarizeAccuracy(v2.apes, v2.nInsufficient);
    if (s1.mdape != null && s2.mdape != null) {
      const delta = s1.mdape - s2.mdape;
      console.log(
        `MdAPE delta (V1 − V2): ${delta.toFixed(2)} pp — ${
          delta > 0.25
            ? "V2 BETTER"
            : delta < -0.25
              ? "V2 WORSE"
              : "ROUGHLY SIMILAR"
        }`,
      );
    }
    if (s1.within10 != null && s2.within10 != null) {
      console.log(
        `Within ±10% delta (V2 − V1): ${(s2.within10 - s1.within10).toFixed(2)} pp`,
      );
    }

    console.log("by property type (holdout/segment):");
    const types = new Set([...v1.byType.keys(), ...v2.byType.keys()]);
    for (const t of [...types].sort()) {
      const a = summarizeAccuracy(
        v1.byType.get(t)?.apes ?? [],
        v1.byType.get(t)?.nInsufficient ?? 0,
      );
      const b = summarizeAccuracy(
        v2.byType.get(t)?.apes ?? [],
        v2.byType.get(t)?.nInsufficient ?? 0,
      );
      console.log(
        `  ${t}: V1 MdAPE=${fmtPct(a.mdape)} n=${a.nValid}/${a.nValid + a.nInsufficient} | V2 MdAPE=${fmtPct(b.mdape)} n=${b.nValid}/${b.nValid + b.nInsufficient}`,
      );
    }

    console.log("top cities by subject count:");
    const cityCounts = [...v2.byCity.entries()]
      .map(([city, row]) => ({
        city,
        n: row.apes.length + row.nInsufficient,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
    for (const { city } of cityCounts) {
      const a = summarizeAccuracy(
        v1.byCity.get(city)?.apes ?? [],
        v1.byCity.get(city)?.nInsufficient ?? 0,
      );
      const b = summarizeAccuracy(
        v2.byCity.get(city)?.apes ?? [],
        v2.byCity.get(city)?.nInsufficient ?? 0,
      );
      console.log(
        `  ${city}: V1 MdAPE=${fmtPct(a.mdape)} n=${a.nValid} | V2 MdAPE=${fmtPct(b.mdape)} n=${b.nValid}`,
      );
    }

    console.log(
      `leakage flags (raw pool contains future/subject before engine filter): future_pool_hits=${v1.flags.futureLeakAttempts} subject_pool_hits=${v1.flags.subjectLeakAttempts}`,
    );
    console.log(
      "note: engines apply soldAtBefore + excludeMls/identity — future/subject must not enter estimates",
    );
    if (v1.reasons.size || v2.reasons.size) {
      console.log("insufficient reasons V1:", Object.fromEntries(v1.reasons));
      console.log("insufficient reasons V2:", Object.fromEntries(v2.reasons));
    }

    return { v1, v2 };
  }

  // develop | holdout | both (default). Use develop for calibration; holdout once.
  const split = (process.env.HOME_VALUE_BACKTEST_SPLIT ?? "both")
    .trim()
    .toLowerCase();

  if (split === "develop" || split === "both") {
    if (developSubjects.length > 0) {
      const develop = await evaluate(
        "DEVELOP (calibration only — not final judgment)",
        developSubjects as SubjectRow[],
      );
      if (split === "develop") {
        const d1 = summarizeAccuracy(develop.v1.apes, develop.v1.nInsufficient);
        const d2 = summarizeAccuracy(develop.v2.apes, develop.v2.nInsufficient);
        console.log("\n=== CALIBRATION NOTE (develop only) ===");
        console.log(
          `V1 valid=${d1.nValid} MdAPE=${fmtPct(d1.mdape)} ±10%=${fmtPct(d1.within10)} insuff=${fmtPct(d1.insufficientRate * 100, 1)}`,
        );
        console.log(
          `V2 valid=${d2.nValid} MdAPE=${fmtPct(d2.mdape)} ±10%=${fmtPct(d2.within10)} insuff=${fmtPct(d2.insufficientRate * 100, 1)}`,
        );
        console.log(
          "Holdout not run (HOME_VALUE_BACKTEST_SPLIT=develop). Re-run with holdout/both for final assessment.",
        );
        console.log("home-value-historical-backtest: done");
        return;
      }
    }
  }

  if (split === "holdout" || split === "both") {
    const holdout = await evaluate(
      "HOLDOUT (primary)",
      holdoutSubjects as SubjectRow[],
    );

    const h1 = summarizeAccuracy(holdout.v1.apes, holdout.v1.nInsufficient);
    const h2 = summarizeAccuracy(holdout.v2.apes, holdout.v2.nInsufficient);

    console.log("\n=== VERDICT (holdout) ===");
    if (
      h1.mdape == null ||
      h2.mdape == null ||
      h1.nValid < 10 ||
      h2.nValid < 10
    ) {
      console.log(
        "INCONCLUSIVE — insufficient valid estimates on holdout after entitlement/filters.",
      );
    } else {
      const coverageBetter = h2.nValid > h1.nValid;
      const coverageWorse = h2.nValid < h1.nValid;
      if (h2.mdape + 0.25 < h1.mdape && !coverageWorse) {
        console.log(
          "V2 OUTPERFORMS V1 on holdout MdAPE with coverage not worse.",
        );
      } else if (h2.mdape + 0.25 < h1.mdape && coverageWorse) {
        console.log(
          "V2 better MdAPE but worse coverage — tradeoff; review before ship.",
        );
      } else if (h1.mdape + 0.25 < h2.mdape) {
        console.log(
          "V2 UNDERPERFORMS V1 on holdout MdAPE — do not ship on accuracy grounds alone.",
        );
      } else if (coverageBetter && (h2.within10 ?? 0) + 1 >= (h1.within10 ?? 0)) {
        console.log(
          "V2 ≈ V1 on MdAPE with better coverage — coverage improvement achieved.",
        );
      } else {
        console.log(
          "V2 ≈ V1 on holdout MdAPE; check ±10% hit-rate, coverage, and segment tables.",
        );
      }
    }
  }

  console.log("home-value-historical-backtest: done");
}

main().catch((error) => {
  console.error("[backtest] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});

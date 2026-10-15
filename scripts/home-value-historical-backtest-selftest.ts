/**
 * Pure historical backtest guards (no DB).
 * Run: pnpm home-value-historical-backtest:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  absolutePercentageError,
  filterHistoricalCandidates,
  summarizeAccuracy,
} from "../src/lib/market/home-value-estimate-historical";
import {
  estimateHomeValue,
  soldCompIdentityKey,
  type SoldCompCandidate,
} from "../src/lib/market/home-value-estimate";
import { estimateHomeValueV2Baseline } from "../src/lib/market/home-value-estimate-v2-baseline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sold(
  partial: Partial<SoldCompCandidate> &
    Pick<SoldCompCandidate, "soldPrice" | "soldAt" | "addressLine">,
): SoldCompCandidate {
  return {
    beds: 3,
    baths: 2,
    sqft: 1600,
    lat: 43.45,
    lng: -80.49,
    propertyType: "DETACHED",
    city: "Kitchener",
    community: "Grand River North",
    unitNumber: null,
    basement: "finished",
    ...partial,
  };
}

function testMetricsHelpers() {
  assert.deepEqual(absolutePercentageError(110, 100), {
    ape: 10,
    mid: 110,
    actual: 100,
  });
  const stats = summarizeAccuracy([5, 10, 15], 2);
  assert.equal(stats.nValid, 3);
  assert.equal(stats.nInsufficient, 2);
  assert.equal(stats.mdape, 10);
  assert.ok(stats.within10 != null && stats.within10 > 60);
  console.log("[metrics] helpers PASS");
}

function testFutureAndSubjectExclusion() {
  const asOf = new Date("2026-06-15T00:00:00.000Z");
  const since = new Date("2025-06-15T00:00:00.000Z");
  const subject = sold({
    soldPrice: 800_000,
    soldAt: asOf,
    addressLine: "1 Subject St",
    mlsNumber: "XSUB1",
  });
  const rows = [
    sold({
      soldPrice: 700_000,
      soldAt: new Date("2026-05-01T00:00:00.000Z"),
      addressLine: "2 Past St",
      mlsNumber: "XPAST",
    }),
    sold({
      soldPrice: 900_000,
      soldAt: new Date("2026-07-01T00:00:00.000Z"),
      addressLine: "3 Future St",
      mlsNumber: "XFUT",
    }),
    subject,
  ];
  const filtered = filterHistoricalCandidates(rows, {
    soldSince: since,
    soldAtBefore: asOf,
    excludeMlsNumbers: ["XSUB1"],
    excludeIdentityKeys: [soldCompIdentityKey(subject)],
    identityKey: soldCompIdentityKey,
  });
  // Subject soldAt === asOf is treated as non-past (future/same-instant leakage).
  assert.equal(filtered.rejectedFuture, 2);
  assert.equal(filtered.kept.length, 1);
  assert.equal(filtered.kept[0]!.mlsNumber, "XPAST");

  // Explicit MLS exclude still catches subject when sold slightly earlier.
  const earlierSubject = sold({
    soldPrice: 800_000,
    soldAt: new Date("2026-06-14T00:00:00.000Z"),
    addressLine: "1 Subject St",
    mlsNumber: "XSUB1",
  });
  const filteredSubject = filterHistoricalCandidates(
    [
      sold({
        soldPrice: 700_000,
        soldAt: new Date("2026-05-01T00:00:00.000Z"),
        addressLine: "2 Past St",
        mlsNumber: "XPAST",
      }),
      earlierSubject,
    ],
    {
      soldSince: since,
      soldAtBefore: asOf,
      excludeMlsNumbers: ["XSUB1"],
      excludeIdentityKeys: [soldCompIdentityKey(earlierSubject)],
      identityKey: soldCompIdentityKey,
    },
  );
  assert.equal(filteredSubject.rejectedSubject, 1);
  assert.equal(filteredSubject.kept.length, 1);
  console.log("[leakage] future + subject filtered PASS");
}

async function testEnginesHonorInjection() {
  const asOf = new Date("2026-08-01T00:00:00.000Z");
  const inventory: SoldCompCandidate[] = [
    sold({
      soldPrice: 720_000,
      soldAt: new Date("2026-03-01T00:00:00.000Z"),
      addressLine: "10 Comp A",
      mlsNumber: "A1",
      sqft: 1580,
    }),
    sold({
      soldPrice: 740_000,
      soldAt: new Date("2026-04-01T00:00:00.000Z"),
      addressLine: "11 Comp B",
      mlsNumber: "B1",
      sqft: 1620,
    }),
    sold({
      soldPrice: 755_000,
      soldAt: new Date("2026-05-01T00:00:00.000Z"),
      addressLine: "12 Comp C",
      mlsNumber: "C1",
      sqft: 1600,
    }),
    // Future — must not affect either engine
    sold({
      soldPrice: 1_500_000,
      soldAt: new Date("2026-09-01T00:00:00.000Z"),
      addressLine: "99 Future",
      mlsNumber: "F1",
      sqft: 1600,
    }),
    // Subject duplicate identity
    sold({
      soldPrice: 800_000,
      soldAt: asOf,
      addressLine: "50 Subject Ave",
      mlsNumber: "SUB1",
      sqft: 1600,
    }),
  ];

  const common = {
    city: "Kitchener",
    community: "Grand River North",
    beds: 3,
    baths: 2,
    sqft: 1600,
    propertyType: "DETACHED" as const,
    lat: 43.45,
    lng: -80.49,
    basement: "finished" as const,
    now: asOf,
    soldAtBefore: asOf,
    excludeMlsNumbers: ["SUB1"],
    excludeIdentityKeys: [
      soldCompIdentityKey(
        sold({
          soldPrice: 800_000,
          soldAt: asOf,
          addressLine: "50 Subject Ave",
          mlsNumber: "SUB1",
        }),
      ),
    ],
    inventoryOverride: inventory,
  };

  const v2 = await estimateHomeValueV2Baseline(common);
  const v3 = await estimateHomeValue(common);
  assert.equal(v2.status, "OK");
  assert.equal(v3.status, "OK");
  if (v2.status === "OK" && v3.status === "OK") {
    assert.ok(v2.mid < 1_000_000, "V2 must ignore future 1.5M");
    assert.ok(v3.mid < 1_000_000, "V3 must ignore future 1.5M");
    assert.ok(v2.mid >= 700_000 && v2.mid <= 780_000);
    assert.ok(v3.mid >= 700_000 && v3.mid <= 780_000);
    assert.ok(
      v3.evidenceStage === "neighbourhood" ||
        v3.evidenceStage === "city" ||
        v3.evidenceStage === "region",
    );
  }
  console.log("[engines] injection + anti-leakage PASS");
}

function testSourceGuards() {
  const baseline = readFileSync(
    join(root, "src/lib/market/home-value-estimate-v2-baseline.ts"),
    "utf8",
  );
  assert.ok(baseline.includes("estimateHomeValueV2Baseline"));
  assert.ok(baseline.includes("Frozen V2 baseline"));

  const v3 = readFileSync(
    join(root, "src/lib/market/home-value-estimate.ts"),
    "utf8",
  );
  assert.ok(v3.includes("inventoryOverride"));
  assert.ok(v3.includes("soldAtBefore"));
  assert.ok(v3.includes("filterHistoricalCandidates"));
  assert.ok(v3.includes("evidenceStage"));
  assert.ok(v3.includes("REGION_MAX_KM"));

  const api = readFileSync(
    join(root, "src/app/api/valuation/route.ts"),
    "utf8",
  );
  assert.equal(api.includes("inventoryOverride"), false);
  assert.equal(api.includes("estimateHomeValueV2Baseline"), false);
  assert.ok(api.includes("hasClientAccess") || api.includes("valuationSoldAccessDenial"));

  const backtest = readFileSync(
    join(root, "scripts/home-value-historical-backtest.ts"),
    "utf8",
  );
  assert.ok(backtest.includes("read-only"));
  assert.ok(backtest.includes("holdout"));
  assert.ok(backtest.includes("estimateHomeValueV2Baseline"));
  assert.equal(backtest.includes("prisma.listing.create"), false);
  assert.equal(backtest.includes("prisma.listing.update"), false);
  console.log("[source] guards PASS");
}

async function main() {
  testSourceGuards();
  testMetricsHelpers();
  testFutureAndSubjectExclusion();
  await testEnginesHonorInjection();
  console.log("home-value-historical-backtest-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

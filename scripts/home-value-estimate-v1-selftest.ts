/**
 * Home valuation V1 — sold-only comps + INSUFFICIENT_DATA + VOW/weighting/sqft.
 * Run: pnpm home-value-estimate-v1:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compatiblePropertyTypes,
  compsSqftConsistent,
  distanceLimitsKm,
  isEligibleSoldComp,
  parseResidentialPropertyType,
  requiresSubjectSqft,
  scoreEligibleSoldComp,
  weightedSoldEstimate,
  type SoldCompCandidate,
  type SubjectForComps,
} from "../src/lib/market/home-value-estimate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const now = new Date("2026-10-15T12:00:00.000Z");

function subject(partial: Partial<SubjectForComps> = {}): SubjectForComps {
  return {
    city: "Kitchener",
    beds: 3,
    baths: 2,
    sqft: 1600,
    propertyType: "DETACHED",
    lat: 43.45,
    lng: -80.49,
    community: "Grand River North",
    ...partial,
  };
}

function sold(
  partial: Partial<SoldCompCandidate> & Pick<SoldCompCandidate, "soldPrice">,
): SoldCompCandidate {
  return {
    soldAt: new Date("2026-06-01T00:00:00.000Z"),
    beds: 3,
    baths: 2,
    sqft: 1550,
    lat: 43.451,
    lng: -80.491,
    propertyType: "DETACHED",
    city: "Kitchener",
    community: "Grand River North",
    ...partial,
  };
}

function testTypeIsolation() {
  assert.deepEqual(compatiblePropertyTypes("DETACHED"), ["DETACHED"]);
  assert.deepEqual(compatiblePropertyTypes("CONDO_APT"), ["CONDO_APT"]);
  assert.deepEqual(compatiblePropertyTypes("TOWNHOUSE"), ["TOWNHOUSE"]);
  assert.deepEqual(compatiblePropertyTypes("CONDO_TOWNHOUSE"), [
    "CONDO_TOWNHOUSE",
  ]);
  assert.equal(parseResidentialPropertyType("OFFICE"), null);
  assert.equal(parseResidentialPropertyType("DETACHED"), "DETACHED");

  const det = subject({ propertyType: "DETACHED" });
  const condo = sold({
    soldPrice: 500_000,
    propertyType: "CONDO_APT",
  });
  assert.equal(
    isEligibleSoldComp(condo, det, { maxKm: 10, now }),
    false,
    "detached never matches condo",
  );

  const freeholdTown = subject({ propertyType: "TOWNHOUSE" });
  const condoTown = sold({
    soldPrice: 600_000,
    propertyType: "CONDO_TOWNHOUSE",
  });
  assert.equal(
    isEligibleSoldComp(condoTown, freeholdTown, { maxKm: 10, now }),
    false,
    "condo town never matches freehold town",
  );
  console.log("[type] isolation PASS");
}

function testMunicipalityAndDistance() {
  const subj = subject();
  assert.equal(
    isEligibleSoldComp(
      sold({ soldPrice: 700_000, city: "Waterloo" }),
      subj,
      { maxKm: 10, now },
    ),
    false,
  );

  const far = sold({
    soldPrice: 700_000,
    lat: 43.7,
    lng: -80.9,
  });
  const limits = distanceLimitsKm("DETACHED");
  assert.equal(
    isEligibleSoldComp(far, subj, { maxKm: limits.primary, now }),
    false,
  );
  console.log("[geo] municipality + distance PASS");
}

function testSizeBedsAndRecency() {
  const subj = subject({ sqft: 2000, beds: 4 });
  assert.equal(
    isEligibleSoldComp(
      sold({ soldPrice: 800_000, sqft: 900, beds: 4 }),
      subj,
      { maxKm: 5, now },
    ),
    false,
    "mismatched size excluded",
  );
  assert.equal(
    isEligibleSoldComp(
      sold({ soldPrice: 800_000, beds: 1, sqft: 1950 }),
      subj,
      { maxKm: 5, now },
    ),
    false,
    "mismatched beds excluded",
  );

  const old = sold({
    soldPrice: 800_000,
    soldAt: new Date("2024-01-01T00:00:00.000Z"),
  });
  assert.equal(isEligibleSoldComp(old, subject(), { maxKm: 5, now }), false);

  const nullDate = {
    ...sold({ soldPrice: 800_000 }),
    soldAt: null as unknown as Date,
  };
  assert.equal(
    isEligibleSoldComp(nullDate, subject(), { maxKm: 5, now }),
    false,
  );

  const good = sold({ soldPrice: 780_000, sqft: 1580 });
  assert.equal(isEligibleSoldComp(good, subject(), { maxKm: 5, now }), true);
  assert.ok(scoreEligibleSoldComp(good, subject()) > 0);
  console.log("[features] size/beds/recency PASS");
}

function testWeightedEstimateAndDominance() {
  const similar = [
    { soldPrice: 720_000, score: 3.0 },
    { soldPrice: 740_000, score: 2.8 },
    { soldPrice: 750_000, score: 2.6 },
  ];
  const ok = weightedSoldEstimate(similar);
  assert.ok(ok);
  assert.ok(ok!.mid >= 720_000 && ok!.mid <= 750_000);
  assert.ok(ok!.low <= ok!.mid && ok!.mid <= ok!.high);
  assert.ok(ok!.low >= 720_000 && ok!.high <= 750_000);

  // Extreme outlier with low similarity must not pull mid near its price.
  const withOutlier = [
    ...similar,
    { soldPrice: 1_400_000, score: 0.25 },
  ];
  const guarded = weightedSoldEstimate(withOutlier);
  assert.ok(guarded);
  assert.ok(guarded!.mid < 800_000, "low-score outlier must not dominate mid");
  assert.ok(guarded!.high < 1_100_000, "high stays near similar cluster");

  // High-score dissimilar sold is weight-capped; mid stays nearer the cluster.
  const capped = weightedSoldEstimate([
    { soldPrice: 700_000, score: 2.5 },
    { soldPrice: 710_000, score: 2.4 },
    { soldPrice: 720_000, score: 2.3 },
    { soldPrice: 1_500_000, score: 2.2 },
  ]);
  assert.ok(capped);
  assert.ok(capped!.mid < 1_000_000, "single-comp weight cap limits dominance");

  assert.equal(weightedSoldEstimate([]), null);
  assert.equal(
    weightedSoldEstimate([{ soldPrice: 1, score: 1 }]),
    null,
    "no valid comps → null",
  );
  console.log("[weight] similarity-weighted + dominance PASS");
}

function testMissingSqftPolicy() {
  assert.equal(requiresSubjectSqft("CONDO_APT"), true);
  assert.equal(requiresSubjectSqft("CONDO_TOWNHOUSE"), true);
  assert.equal(requiresSubjectSqft("DETACHED"), false);

  const noSqftSubject = subject({ sqft: null });
  assert.equal(
    isEligibleSoldComp(
      sold({ soldPrice: 700_000, sqft: null }),
      noSqftSubject,
      { maxKm: 5, now },
    ),
    false,
    "comp without sqft excluded when subject sqft missing",
  );
  assert.equal(
    isEligibleSoldComp(
      sold({ soldPrice: 700_000, sqft: 1500 }),
      noSqftSubject,
      { maxKm: 5, now },
    ),
    true,
  );

  assert.equal(compsSqftConsistent([1500, 1600, 1550]), true);
  assert.equal(
    compsSqftConsistent([900, 2800, 1600]),
    false,
    "wide size mix without subject sqft rejected",
  );

  // High confidence requires subject sqft — encoded in engine source.
  const engine = read("src/lib/market/home-value-estimate.ts");
  assert.ok(engine.includes("Boolean(subject.sqft)"));
  assert.ok(engine.includes("missing_subject_sqft"));
  assert.ok(engine.includes("requiresSubjectSqft"));
  console.log("[sqft] missing-size policy PASS");
}

function testJustifiedEstimateFromEligible() {
  const subj = subject();
  const prices = [720_000, 740_000, 755_000];
  const rows = prices.map((soldPrice, i) =>
    sold({
      soldPrice,
      soldAt: new Date(`2026-0${4 + i}-15T00:00:00.000Z`),
      sqft: 1550 + i * 20,
      lat: 43.45 + i * 0.001,
      lng: -80.49 + i * 0.001,
    }),
  );
  const eligible = rows.filter((row) =>
    isEligibleSoldComp(row, subj, { maxKm: 5, now }),
  );
  assert.equal(eligible.length, 3);
  const ranked = eligible
    .map((row) => ({
      soldPrice: row.soldPrice,
      score: scoreEligibleSoldComp(row, subj),
    }))
    .sort((a, b) => b.score - a.score);
  const est = weightedSoldEstimate(ranked);
  assert.ok(est);
  assert.ok(est!.mid >= 720_000 && est!.mid <= 755_000);
  console.log("[estimate] three similar solds justify range PASS");
}

function testMissingSubjectNeverInvented() {
  const incomplete = {
    city: "",
    beds: 3,
    baths: null,
    sqft: null,
    propertyType: "DETACHED" as const,
    lat: 43.45,
    lng: -80.49,
  };
  assert.equal(
    isEligibleSoldComp(sold({ soldPrice: 700_000 }), incomplete, {
      maxKm: 5,
      now,
    }),
    false,
  );
  console.log("[subject] missing characteristics not invented PASS");
}

function testVowAndSourceGuards() {
  const engine = read("src/lib/market/home-value-estimate.ts");
  assert.ok(engine.includes("INSUFFICIENT_DATA"));
  assert.ok(engine.includes("buildPrismaEntitledInventoryWhere"));
  assert.ok(engine.includes('segment: "RESIDENTIAL"'));
  assert.ok(engine.includes("soldAt: { gte: since, not: null }"));
  assert.ok(engine.includes("weightedSoldEstimate"));
  assert.equal(engine.includes("650_000"), false);
  assert.equal(engine.includes('method: "fallback"'), false);
  assert.equal(engine.includes('method: "active_listings"'), false);

  const route = read("src/app/api/valuation/route.ts");
  assert.ok(route.includes("AUTH_REQUIRED"));
  assert.ok(route.includes("hasClientAccess"));
  assert.ok(route.includes("resolveListingEntitlementContextForRequest"));
  assert.ok(route.includes("Never trust client estimatedLow"));
  assert.ok(route.includes("estimate: null"));
  assert.ok(
    route.includes("const mayDiscloseSoldEstimate = canSeeSoldValuation"),
  );
  assert.equal(route.includes("accountCreated && hasContact"), false);
  assert.equal(
    route.includes("Boolean(customerId) && hasContact && !isQuick"),
    false,
  );
  assert.ok(route.includes("leadId: lead.id"));

  const form = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(form.includes("No silent DETACHED"));
  assert.ok(form.includes("Insufficient Market Data"));
  assert.ok(form.includes("Contact a Real Estate Expert"));

  const hero = read("src/components/home/HomeHeroSearch.tsx");
  assert.ok(hero.includes("!data.leadId"));

  const insights = read("src/lib/market/listing-insights.ts");
  assert.ok(insights.includes('homeValue.status === "OK"'));
  assert.ok(insights.includes("entitlement"));

  const claim = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(claim.includes("applySellerPropertyClaim"));

  const envEx = read(".env.example");
  assert.ok(envEx.includes("OFF_MARKET_PROPERTY_SEARCH"));
  assert.ok(
    envEx.includes('NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED="0"') ||
      envEx.includes("OFF_MARKET_PROPERTY_SEARCH_ENABLED=\"0\""),
  );
  console.log("[source] VOW + entitlement guards PASS");
}

function main() {
  testTypeIsolation();
  testMunicipalityAndDistance();
  testSizeBedsAndRecency();
  testWeightedEstimateAndDominance();
  testMissingSqftPolicy();
  testJustifiedEstimateFromEligible();
  testMissingSubjectNeverInvented();
  testVowAndSourceGuards();
  console.log("home-value-estimate-v1-selftest: OK");
}

main();

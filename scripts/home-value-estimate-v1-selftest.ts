/**
 * Home valuation V2 Phase 1 — size adj, neighbourhood, dedupe, basement, confidence.
 * Run: pnpm home-value-estimate-v1:selftest
 * Alias: pnpm home-value-estimate-v2:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIZE_ELASTICITY,
  MAX_SIZE_ADJ,
  classifyValuationConfidence,
  compatiblePropertyTypes,
  compsSqftConsistent,
  dedupeSoldCompsByIdentity,
  distanceLimitsKm,
  isEligibleSoldComp,
  parseBasementFinishFromFacts,
  parseResidentialPropertyType,
  requiresSubjectSqft,
  scoreEligibleSoldComp,
  selectTopScoredEvidence,
  sizeAdjustedSoldPrice,
  soldCompIdentityKey,
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
    basement: "finished",
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
    addressLine: "100 Example St",
    unitNumber: null,
    basement: "finished",
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

function testSizeAdjustmentLargerAndSmaller() {
  assert.equal(SIZE_ELASTICITY, 0.45);
  assert.equal(MAX_SIZE_ADJ, 0.08);

  // Comp larger than subject → adjust sold price down (sub-linear, capped).
  const down = sizeAdjustedSoldPrice(800_000, 1600, 2000);
  assert.ok(down.factor < 1);
  assert.ok(down.factor >= 1 - MAX_SIZE_ADJ);
  assert.ok(down.adjustedPrice < 800_000);
  assert.ok(down.adjustedPrice >= Math.round(800_000 * (1 - MAX_SIZE_ADJ)));

  // Comp smaller than subject → adjust up, capped.
  const up = sizeAdjustedSoldPrice(700_000, 1800, 1400);
  assert.ok(up.factor > 1);
  assert.ok(up.factor <= 1 + MAX_SIZE_ADJ);
  assert.ok(up.adjustedPrice > 700_000);
  assert.ok(up.adjustedPrice <= Math.round(700_000 * (1 + MAX_SIZE_ADJ)));

  // Extreme size gap still capped at ±8%.
  const extreme = sizeAdjustedSoldPrice(1_000_000, 2200, 1100);
  assert.equal(extreme.factor, 1 + MAX_SIZE_ADJ);

  // Missing sqft → no adjustment (never invent).
  assert.deepEqual(sizeAdjustedSoldPrice(750_000, null, 1600), {
    adjustedPrice: 750_000,
    factor: 1,
  });
  assert.deepEqual(sizeAdjustedSoldPrice(750_000, 1600, null), {
    adjustedPrice: 750_000,
    factor: 1,
  });

  // Same size → identity.
  assert.equal(sizeAdjustedSoldPrice(750_000, 1600, 1600).factor, 1);
  console.log("[size] adjustment larger/smaller + caps PASS");
}

function testNeighbourhoodPreference() {
  const subj = subject({ community: "Grand River North" });
  const same = sold({
    soldPrice: 720_000,
    community: "Grand River North",
    addressLine: "10 Same St",
  });
  const other = sold({
    soldPrice: 720_000,
    community: "Forest Heights",
    addressLine: "20 Other St",
    lat: 43.452,
    lng: -80.492,
  });
  const sameScore = scoreEligibleSoldComp(same, subj);
  const otherScore = scoreEligibleSoldComp(other, subj);
  assert.ok(
    sameScore > otherScore * 1.15,
    "same neighbourhood must strongly outrank cross-neighbourhood",
  );

  // Coverage: 1 strong same-community + 2 nearby same-city comps must survive
  // evidence selection (soft penalty, not exclusion cliff).
  const cliff = [
    { score: sameScore, id: "same" },
    {
      score: scoreEligibleSoldComp(
        sold({
          soldPrice: 710_000,
          community: "Forest Heights",
          addressLine: "21 Other St",
          lat: 43.453,
          lng: -80.493,
        }),
        subj,
      ),
      id: "city-a",
    },
    {
      score: scoreEligibleSoldComp(
        sold({
          soldPrice: 730_000,
          community: "Lakeside",
          addressLine: "22 Other St",
          lat: 43.454,
          lng: -80.494,
        }),
        subj,
      ),
      id: "city-b",
    },
  ].sort((a, b) => b.score - a.score);
  const kept = selectTopScoredEvidence(cliff);
  assert.ok(
    kept.length >= 3,
    "progressive neighbourhood fallback must keep ≥3 same-city comps",
  );
  console.log("[neighbourhood] same-community preference PASS");
}

function testDedupeListingsAndCondoUnits() {
  const a1 = sold({
    soldPrice: 700_000,
    addressLine: "5309 Roebuck Court",
    unitNumber: null,
    soldAt: new Date("2026-05-01T00:00:00.000Z"),
    mlsNumber: "X1",
  });
  const a2 = sold({
    soldPrice: 740_000,
    addressLine: "5309 Roebuck Court",
    unitNumber: null,
    soldAt: new Date("2026-08-01T00:00:00.000Z"),
    mlsNumber: "X2",
  });
  const deduped = dedupeSoldCompsByIdentity([a1, a2]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.soldPrice, 740_000, "keep most recent sale");

  const u101 = sold({
    soldPrice: 500_000,
    addressLine: "100 King St",
    unitNumber: "101",
    propertyType: "CONDO_APT",
    mlsNumber: "C1",
  });
  const u202 = sold({
    soldPrice: 520_000,
    addressLine: "100 King St",
    unitNumber: "202",
    propertyType: "CONDO_APT",
    mlsNumber: "C2",
  });
  assert.notEqual(
    soldCompIdentityKey(u101),
    soldCompIdentityKey(u202),
    "distinct condo units stay distinct",
  );
  assert.equal(dedupeSoldCompsByIdentity([u101, u202]).length, 2);
  console.log("[dedupe] repeats collapsed; condo units preserved PASS");
}

function testBasementMatching() {
  assert.equal(parseBasementFinishFromFacts(null), "unknown");
  assert.equal(parseBasementFinishFromFacts([]), "unknown");
  assert.equal(parseBasementFinishFromFacts(["Finished"]), "finished");
  assert.equal(parseBasementFinishFromFacts(["Unfinished"]), "unfinished");
  assert.equal(parseBasementFinishFromFacts(["None"]), "none");

  const subj = subject({ basement: "finished" });
  const match = sold({ soldPrice: 700_000, basement: "finished" });
  const mismatch = sold({
    soldPrice: 700_000,
    basement: "none",
    addressLine: "11 Basement Ave",
  });
  const unknown = sold({
    soldPrice: 700_000,
    basement: "unknown",
    addressLine: "12 Unknown Ave",
  });
  assert.ok(
    scoreEligibleSoldComp(match, subj) >
      scoreEligibleSoldComp(mismatch, subj),
  );
  // Unknown basement must not be treated as unfinished penalty vs match gap alone.
  const unknownScore = scoreEligibleSoldComp(unknown, subj);
  const mismatchScore = scoreEligibleSoldComp(mismatch, subj);
  assert.ok(
    unknownScore > mismatchScore,
    "unknown basement softer than known mismatch",
  );
  console.log("[basement] prefer match; unknown ≠ unfinished PASS");
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

  const engine = read("src/lib/market/home-value-estimate.ts");
  assert.ok(engine.includes("missing_subject_sqft"));
  assert.ok(engine.includes("requiresSubjectSqft"));
  assert.ok(engine.includes("SIZE_ELASTICITY"));
  assert.ok(
    engine.includes("Never invents sqft from LivingAreaRange"),
    "documents no range-midpoint invention",
  );
  assert.equal(
    engine.includes("parseRangeMidpoint"),
    false,
    "must not invent sqft from ranges",
  );
  console.log("[sqft] missing-size policy PASS");
}

function testThinInventoryInsufficient() {
  const subj = subject();
  const onlyTwo = [
    sold({ soldPrice: 700_000, addressLine: "1 Thin St" }),
    sold({ soldPrice: 710_000, addressLine: "2 Thin St" }),
  ];
  const ranked = onlyTwo
    .filter((row) => isEligibleSoldComp(row, subj, { maxKm: 5, now }))
    .map((row) => ({
      soldPrice: row.soldPrice,
      score: scoreEligibleSoldComp(row, subj),
    }));
  assert.equal(ranked.length, 2);
  assert.equal(
    weightedSoldEstimate(ranked),
    null,
    "thin inventory (<3) → no estimate",
  );
  console.log("[thin] insufficient comps PASS");
}

function testConfidenceClassification() {
  const high = classifyValuationConfidence({
    soldCount: 6,
    meanDistanceKm: 1.2,
    primaryRadiusKm: 4,
    sameCommunityShare: 0.8,
    subjectCommunityKnown: true,
    recentShare180d: 0.7,
    priceCv: 0.08,
    hasSubjectSqft: true,
    hasBaths: true,
    allSameType: true,
    medianToBestScore: 0.7,
  });
  assert.equal(high, "high");

  const medium = classifyValuationConfidence({
    soldCount: 4,
    meanDistanceKm: 2.5,
    primaryRadiusKm: 4,
    sameCommunityShare: 0.5,
    subjectCommunityKnown: true,
    recentShare180d: 0.5,
    priceCv: 0.14,
    hasSubjectSqft: true,
    hasBaths: true,
    allSameType: true,
    medianToBestScore: 0.55,
  });
  assert.equal(medium, "medium");

  const low = classifyValuationConfidence({
    soldCount: 3,
    meanDistanceKm: 5,
    primaryRadiusKm: 4,
    sameCommunityShare: 0.2,
    subjectCommunityKnown: true,
    recentShare180d: 0.2,
    priceCv: 0.22,
    hasSubjectSqft: false,
    hasBaths: true,
    allSameType: true,
    medianToBestScore: 0.4,
  });
  assert.equal(low, "low");

  // Weak set must never be HIGH even with n>=5.
  const weakMany = classifyValuationConfidence({
    soldCount: 6,
    meanDistanceKm: 5.5,
    primaryRadiusKm: 4,
    sameCommunityShare: 0.15,
    subjectCommunityKnown: true,
    recentShare180d: 0.3,
    priceCv: 0.2,
    hasSubjectSqft: true,
    hasBaths: true,
    allSameType: true,
    medianToBestScore: 0.5,
  });
  assert.notEqual(weakMany, "high");
  assert.equal(weakMany, "low");
  console.log("[confidence] low/medium/high PASS");
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
      addressLine: `${i} Justified St`,
    }),
  );
  const eligible = rows.filter((row) =>
    isEligibleSoldComp(row, subj, { maxKm: 5, now }),
  );
  assert.equal(eligible.length, 3);
  const ranked = eligible
    .map((row) => {
      const { adjustedPrice } = sizeAdjustedSoldPrice(
        row.soldPrice,
        subj.sqft,
        row.sqft,
      );
      return {
        soldPrice: adjustedPrice,
        score: scoreEligibleSoldComp(row, subj),
      };
    })
    .sort((a, b) => b.score - a.score);
  const est = weightedSoldEstimate(ranked);
  assert.ok(est);
  assert.ok(est!.mid >= 700_000 && est!.mid <= 780_000);
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
  assert.ok(engine.includes("dedupeSoldCompsByIdentity"));
  assert.ok(engine.includes("selectTopScoredEvidence"));
  assert.ok(engine.includes("classifyValuationConfidence"));
  assert.ok(engine.includes("sizeAdjustedSoldPrice"));
  assert.ok(engine.includes("MIN_SCORE_RATIO_COVERAGE_FLOOR"));
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
  assert.ok(insights.includes("parseBasementFinishFromFacts"));
  assert.ok(insights.includes("ValuationConfidence"));

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
  testSizeAdjustmentLargerAndSmaller();
  testNeighbourhoodPreference();
  testDedupeListingsAndCondoUnits();
  testBasementMatching();
  testWeightedEstimateAndDominance();
  testMissingSqftPolicy();
  testThinInventoryInsufficient();
  testConfidenceClassification();
  testJustifiedEstimateFromEligible();
  testMissingSubjectNeverInvented();
  testVowAndSourceGuards();
  console.log("home-value-estimate-v2-phase1-selftest: OK");
}

main();

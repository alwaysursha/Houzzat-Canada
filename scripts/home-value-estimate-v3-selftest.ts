/**
 * Home Valuation V3 eligibility, region safety, and confidence.
 * Run: pnpm home-value-estimate-v3:selftest
 *
 * Hermetic — no DB. Does not tune thresholds from holdout inventory.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PropertyType } from "@prisma/client";
import {
  REGION_CITY_MEDIAN_RATIO_MAX,
  REGION_MAX_KM,
  classifyValuationConfidence,
  estimateHomeValue,
  isEligibleSoldComp,
  parseLivingAreaRangeBounds,
  regionCitiesPriceAligned,
  soldCompSizeEligible,
  subjectHasSizeSignal,
  type SoldCompCandidate,
  type SubjectForComps,
} from "../src/lib/market/home-value-estimate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const now = new Date("2026-09-01T12:00:00.000Z");

function subject(over: Partial<SubjectForComps> = {}): SubjectForComps {
  return {
    city: "Kitchener",
    beds: 3,
    baths: 2,
    sqft: 1600,
    propertyType: "DETACHED",
    lat: 43.45,
    lng: -80.49,
    community: null,
    ...over,
  };
}

function sold(over: Partial<SoldCompCandidate> = {}): SoldCompCandidate {
  return {
    soldPrice: 720_000,
    soldAt: new Date("2026-06-01T00:00:00.000Z"),
    beds: 3,
    baths: 2,
    sqft: 1550,
    lat: 43.451,
    lng: -80.491,
    propertyType: "DETACHED",
    city: "Kitchener",
    community: null,
    addressLine: "1 Test St",
    ...over,
  };
}

function testLivingAreaRangeBounds() {
  assert.deepEqual(parseLivingAreaRangeBounds("1500-2000"), {
    low: 1500,
    high: 2000,
  });
  assert.deepEqual(parseLivingAreaRangeBounds("1,500 – 2,000"), {
    low: 1500,
    high: 2000,
  });
  assert.equal(parseLivingAreaRangeBounds("about 1800"), null);
  assert.equal(parseLivingAreaRangeBounds(null), null);
  console.log("[range] livingAreaRange bounds PASS");
}

function testSmartSizeEligibility() {
  // Exact vs exact.
  assert.equal(
    soldCompSizeEligible(sold({ sqft: 1500 }), subject({ sqft: 1600 })),
    true,
  );
  assert.equal(
    soldCompSizeEligible(sold({ sqft: 900 }), subject({ sqft: 2000 })),
    false,
  );

  // Freehold missing size both sides.
  assert.equal(
    soldCompSizeEligible(
      sold({ sqft: null }),
      subject({ sqft: null, propertyType: "DETACHED" }),
    ),
    true,
  );

  // Condo needs size signal both sides.
  assert.equal(
    soldCompSizeEligible(
      sold({ sqft: null, livingAreaRange: null, propertyType: "CONDO_APT" }),
      subject({
        sqft: null,
        livingAreaRange: null,
        propertyType: "CONDO_APT",
      }),
    ),
    false,
  );
  assert.equal(
    soldCompSizeEligible(
      sold({
        sqft: null,
        livingAreaRange: "900-1099",
        propertyType: "CONDO_APT",
      }),
      subject({
        sqft: null,
        livingAreaRange: "1000-1199",
        propertyType: "CONDO_APT",
      }),
    ),
    true,
    "overlapping condo ranges eligible",
  );
  assert.equal(
    soldCompSizeEligible(
      sold({ sqft: 1050, livingAreaRange: null, propertyType: "CONDO_APT" }),
      subject({
        sqft: null,
        livingAreaRange: "1000-1199",
        propertyType: "CONDO_APT",
      }),
    ),
    true,
    "exact comp in subject range band",
  );

  assert.equal(
    subjectHasSizeSignal({
      propertyType: "CONDO_APT",
      sqft: null,
      livingAreaRange: "900-1099",
    }),
    true,
  );
  assert.equal(
    subjectHasSizeSignal({
      propertyType: "CONDO_APT",
      sqft: null,
      livingAreaRange: null,
    }),
    false,
  );
  console.log("[size] smart eligibility PASS");
}

function testRegionCityAlignment() {
  const medians = new Map<string, number>([
    ["mississauga", 1_200_000],
    ["brampton", 935_000],
    ["caledon", 1_150_000],
  ]);
  const aligned = regionCitiesPriceAligned({
    subjectCity: "Mississauga",
    regionCities: ["Mississauga", "Brampton", "Caledon"],
    cityMedians: medians,
  });
  assert.ok(aligned.includes("Mississauga"));
  assert.ok(aligned.includes("Caledon"));
  assert.equal(
    aligned.includes("Brampton"),
    false,
    "Brampton median too far from Mississauga",
  );
  assert.ok(REGION_CITY_MEDIAN_RATIO_MAX <= 1.3);
  assert.ok(REGION_MAX_KM >= 12 && REGION_MAX_KM <= 15);
  console.log("[region] price-aligned cities PASS");
}

function testRegionEligibilityAndConfidence() {
  const subj = subject({ city: "Waterloo", lat: 43.46, lng: -80.52 });
  const kitchenerComp = sold({
    city: "Kitchener",
    lat: 43.455,
    lng: -80.50,
    addressLine: "10 Border St",
  });
  assert.equal(
    isEligibleSoldComp(kitchenerComp, subj, { maxKm: 6, now }),
    false,
    "same-city lock at city stage",
  );
  assert.equal(
    isEligibleSoldComp(kitchenerComp, subj, {
      maxKm: REGION_MAX_KM,
      now,
      allowedCities: ["Waterloo", "Kitchener", "Cambridge"],
    }),
    true,
    "region stage allows sibling city",
  );

  assert.equal(
    classifyValuationConfidence({
      soldCount: 6,
      meanDistanceKm: 8,
      primaryRadiusKm: 4,
      sameCommunityShare: 0,
      subjectCommunityKnown: false,
      recentShare180d: 0.6,
      priceCv: 0.1,
      hasSubjectSqft: true,
      hasReliableSize: true,
      hasBaths: true,
      allSameType: true,
      medianToBestScore: 0.7,
      evidenceStage: "region",
    }),
    "low",
  );
  console.log("[region] eligibility + LOW confidence PASS");
}

async function testEstimateStagesWithOverride() {
  const inventory: SoldCompCandidate[] = [];
  // Thin same-city — force region.
  for (let i = 0; i < 2; i++) {
    inventory.push(
      sold({
        city: "Waterloo",
        soldPrice: 800_000 + i * 10_000,
        lat: 43.464 + i * 0.002,
        lng: -80.52,
        addressLine: `${i} Waterloo St`,
        sqft: null,
      }),
    );
  }
  for (let i = 0; i < 6; i++) {
    inventory.push(
      sold({
        city: "Kitchener",
        soldPrice: 740_000 + i * 8_000,
        lat: 43.45 + i * 0.003,
        lng: -80.49 + i * 0.002,
        addressLine: `${i} Kitchener Ave`,
        sqft: null,
      }),
    );
  }

  const result = await estimateHomeValue({
    city: "Waterloo",
    community: null,
    beds: 3,
    baths: 2,
    sqft: null,
    propertyType: "DETACHED" satisfies PropertyType,
    lat: 43.464,
    lng: -80.52,
    now,
    soldAtBefore: new Date("2026-10-01T00:00:00.000Z"),
    inventoryOverride: inventory,
  });
  assert.equal(result.status, "OK");
  if (result.status === "OK") {
    assert.equal(result.evidenceStage, "region");
    assert.equal(result.confidence, "low");
    assert.ok(result.soldCount >= 5);
  }
  console.log("[estimate] region stage via override PASS");
}

async function testCityPreferredOverRegion() {
  const inventory: SoldCompCandidate[] = [];
  for (let i = 0; i < 4; i++) {
    inventory.push(
      sold({
        city: "Mississauga",
        community: "Port Credit",
        soldPrice: 1_100_000 + i * 15_000,
        lat: 43.55 + i * 0.002,
        lng: -79.58,
        addressLine: `${i} Port Credit Rd`,
        sqft: 1700 + i * 20,
      }),
    );
  }
  for (let i = 0; i < 6; i++) {
    inventory.push(
      sold({
        city: "Brampton",
        soldPrice: 900_000 + i * 10_000,
        lat: 43.7,
        lng: -79.76,
        addressLine: `${i} Brampton Rd`,
        sqft: 1700,
      }),
    );
  }
  const result = await estimateHomeValue({
    city: "Mississauga",
    community: "Port Credit",
    beds: 3,
    baths: 2,
    sqft: 1750,
    propertyType: "DETACHED",
    lat: 43.551,
    lng: -79.581,
    now,
    soldAtBefore: new Date("2026-10-01T00:00:00.000Z"),
    inventoryOverride: inventory,
  });
  assert.equal(result.status, "OK");
  if (result.status === "OK") {
    assert.notEqual(result.evidenceStage, "region");
    assert.ok(
      result.evidenceStage === "neighbourhood" ||
        result.evidenceStage === "city",
    );
  }
  console.log("[estimate] prefers neighbourhood/city over region PASS");
}

function testVowAndWiring() {
  const route = read("src/app/api/valuation/route.ts");
  assert.ok(route.includes("valuationSoldAccessDenial"));
  assert.ok(route.includes("evidenceStage"));
  const engine = read("src/lib/market/home-value-estimate.ts");
  assert.ok(engine.includes("REGION_MAX_KM"));
  assert.ok(engine.includes("resolveRegionFromCity"));
  assert.ok(engine.includes("soldCompSizeEligible"));
  assert.ok(engine.includes("parseLivingAreaRangeBounds"));
  assert.equal(engine.includes("organizationId"), false);
  assert.equal(engine.includes("postalCode"), false);
  assert.equal(engine.includes("resolveRegionFromCoords"), false);
  const baseline = read("src/lib/market/home-value-estimate-v2-baseline.ts");
  assert.ok(baseline.includes("estimateHomeValueV2Baseline"));
  console.log("[wiring] V3 + V2 baseline + VOW PASS");
}

async function main() {
  testLivingAreaRangeBounds();
  testSmartSizeEligibility();
  testRegionCityAlignment();
  testRegionEligibilityAndConfidence();
  await testEstimateStagesWithOverride();
  await testCityPreferredOverRegion();
  testVowAndWiring();
  console.log("\nhome-value-estimate-v3-selftest: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

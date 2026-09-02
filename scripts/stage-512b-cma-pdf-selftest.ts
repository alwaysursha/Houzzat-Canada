/**
 * Stage 5.12B — CMA PDF Browser Rendering selftest (runtime + mocked CF).
 * Run: node --import tsx scripts/stage-512b-cma-pdf-selftest.ts
 */

import assert from "node:assert/strict";
import {
  isBrowserRenderingConfigured,
  renderHtmlToPdf,
} from "../src/lib/cma/browser-rendering-pdf";
import { sanitizeCmaPdfFilename } from "../src/lib/cma/filename";
import {
  buildCmaPresentationDto,
  hasSavedCmaPresentationEvidence,
} from "../src/lib/cma/presentation";
import { renderCmaPrintHtml } from "../src/lib/cma/print-html";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

function sampleSubject() {
  return {
    version: 1 as const,
    mlsNumber: "W1234567",
    addressLine: "123 Main Street",
    unitNumber: null,
    city: "Toronto",
    community: "Leslieville",
    postalCode: "M4M1A1",
    propertyType: "DETACHED",
    beds: 3,
    baths: 2,
    sqft: 1800,
    livingAreaRange: null,
    parkingSpaces: 2,
    yearBuilt: 1998,
    taxes: 5200,
    maintenanceFee: null,
    listPrice: 999000,
    lat: 43.66,
    lng: -79.33,
    lotSizeArea: "25 x 120",
    garageType: "Attached",
  };
}

function sampleSoldComp(mlsNumber = "W1111111", soldPrice = 975000) {
  return {
    mlsNumber,
    source: "AUTO" as const,
    role: "SOLD" as const,
    score: 88,
    reasons: ["Same beds", "Nearby"],
    negativeReasons: [] as string[],
    outlier: false,
    distanceKm: 0.6,
    property: {
      addressLine: "125 Main Street",
      unitNumber: null,
      city: "Toronto",
      community: "Leslieville",
      postalCode: "M4M1A2",
      propertyType: "DETACHED",
      beds: 3,
      baths: 2,
      sqft: 1750,
      livingAreaRange: null,
      parkingSpaces: 2,
      yearBuilt: 1995,
      maintenanceFee: null,
      listPrice: 980000,
      soldPrice,
      soldAt: "2026-06-01T00:00:00.000Z",
      listedAt: "2026-05-01T00:00:00.000Z",
      daysOnMarket: 18,
      status: "SOLD",
      lat: 43.661,
      lng: -79.331,
      coverImageUrl: "https://images.unsplash.com/photo-test",
      lotSizeArea: "25 x 110",
      garageType: "Attached",
    },
  };
}

function sampleActiveComp() {
  const base = sampleSoldComp("W2222222", 0);
  return {
    ...base,
    role: "ACTIVE" as const,
    property: {
      ...base.property,
      addressLine: "130 Main Street",
      soldPrice: null,
      listPrice: 1049000,
      status: "ACTIVE",
      coverImageUrl: null,
    },
  };
}

function sampleAnalysis() {
  return {
    version: 1 as const,
    soldCompCount: 1,
    activeCompCount: 1,
    conditionalCompCount: 0,
    medianSoldPrice: 975000,
    medianPricePerSqft: 557,
    observedSoldLow: 975000,
    observedSoldHigh: 975000,
    weightedIndicatedLow: 950000,
    weightedIndicatedMid: 975000,
    weightedIndicatedHigh: 1000000,
    confidence: "GOOD" as const,
    confidenceReasons: ["Solid nearby sold evidence"],
    widenStage: 0,
    marketContext: "Nearby sold activity supports pricing discussion.",
    limitedInventory: false,
  };
}

function sampleReport() {
  return {
    id: "cma_1",
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    subjectAddress: "123 Main Street",
    city: "Toronto",
    community: "Leslieville",
    summary: "Draft summary",
    recommendedListPrice: 989000,
    recommendationNote: "Price to attract multiple offers.",
    narrative: "Optional narrative",
    subjectSnapshot: sampleSubject(),
    selectedComps: {
      version: 1 as const,
      items: [sampleSoldComp(), sampleActiveComp()],
    },
    analysis: sampleAnalysis(),
  };
}

async function main() {
  console.log("\n=== STAGE 5.12B SELFTEST — CMA PDF RUNTIME ===\n");

  const name = sanitizeCmaPdfFilename({
    addressLine: "123 Main Street!!",
    preparedDate: new Date("2026-09-02T12:00:00.000Z"),
  });
  assert.equal(name, "CMA-123-Main-Street-2026-09-02.pdf");

  const report = sampleReport();
  assert.equal(hasSavedCmaPresentationEvidence(report), true);

  const canary = buildCmaPresentationDto({
    report,
    brand: workspaceBrandingRowToBrand(
      "tenant_b_test_workspace_id",
      TENANT_B_TEST_BRANDING_ROW,
    ),
    agent: {
      name: "Canary Agent",
      email: "a@example.com",
      phone: "416-555-0100",
    },
    subjectPhotoUrl: null,
  });
  assert.equal(canary.brand.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(canary.brand.primaryColor, TENANT_B_TEST_PRIMARY_COLOR);
  assert.equal(canary.soldComps.length, 1);
  assert.equal(canary.competitionComps.length, 1);

  const houzzat = buildCmaPresentationDto({
    report,
    brand: buildLegacyHouzzatBrand("ws"),
    agent: { name: "Ali", email: "a@x.com", phone: null },
  });
  assert.equal(houzzat.brand.displayName, "Houzzat");

  const html = renderCmaPrintHtml(canary);
  assert.match(html, /Current market competition/);
  assert.match(html, /Photo unavailable/);
  assert.match(html, /Powered by HouzzatPRO/);

  globalThis.__cmaBrowserRenderingPdfMock = async () =>
    new TextEncoder().encode("%PDF-1.4 mock");
  assert.equal(isBrowserRenderingConfigured(), true);
  const t0 = Date.now();
  const ok = await renderHtmlToPdf(html);
  const ms = Date.now() - t0;
  assert.equal(ok.ok, true);
  console.log(`mock PDF render: ${ms}ms`);

  globalThis.__cmaBrowserRenderingPdfMock = async () => {
    throw new Error("boom");
  };
  const fail = await renderHtmlToPdf(html);
  assert.equal(fail.ok, false);
  delete globalThis.__cmaBrowserRenderingPdfMock;

  console.log("\nSTAGE 5.12B SELFTEST — PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

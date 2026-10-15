/**
 * Home Valuation V2 production presentation / release safeguards.
 * Run: pnpm home-value-presentation:selftest
 *
 * Hermetic — no DB, no MLS, no formula changes asserted beyond presentation copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE,
  HOME_VALUE_DISCLAIMER,
  formatValuationConfidence,
  homeValueInsufficientDisclaimer,
  homeValueOkDisclaimer,
  isValuationConfidence,
  valuationConfidenceDescription,
  valuationConfidenceLabel,
} from "../src/lib/market/home-value-presentation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testConfidenceCopy() {
  assert.equal(valuationConfidenceLabel("low"), "Low");
  assert.equal(valuationConfidenceLabel("medium"), "Medium");
  assert.equal(valuationConfidenceLabel("high"), "High");

  assert.equal(
    valuationConfidenceDescription("low"),
    "Limited or wider-area comparable data",
  );
  assert.equal(
    valuationConfidenceDescription("medium"),
    "Moderate city comparable support",
  );
  assert.equal(
    valuationConfidenceDescription("high"),
    "Stronger local comparable support",
  );

  assert.equal(
    formatValuationConfidence("high"),
    "High · Stronger local comparable support",
  );
  assert.ok(isValuationConfidence("low"));
  assert.ok(isValuationConfidence("medium"));
  assert.ok(isValuationConfidence("high"));
  assert.equal(isValuationConfidence("guaranteed"), false);
  assert.equal(isValuationConfidence(null), false);

  // HIGH must never be described as guaranteed / highly accurate.
  for (const level of ["low", "medium", "high"] as const) {
    const desc = valuationConfidenceDescription(level).toLowerCase();
    assert.equal(desc.includes("guaranteed"), false);
    assert.equal(desc.includes("highly accurate"), false);
    assert.equal(desc.includes("accuracy rate"), false);
  }
  assert.ok(
    HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE.includes(
      "not a verified prediction accuracy rate",
    ),
  );
  console.log("[confidence] LOW/MEDIUM/HIGH display copy PASS");
}

function testDisclaimer() {
  assert.equal(
    HOME_VALUE_DISCLAIMER,
    "Automated estimate based on available sold properties. Not a professional appraisal.",
  );
  assert.equal(homeValueOkDisclaimer(), HOME_VALUE_DISCLAIMER);
  assert.ok(homeValueInsufficientDisclaimer().toLowerCase().includes("insufficient"));
  console.log("[disclaimer] customer-facing copy PASS");
}

function testHomeValuationFormPresentation() {
  const form = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(form.includes("formatValuationConfidence"));
  assert.ok(form.includes("HOME_VALUE_DISCLAIMER"));
  assert.ok(form.includes("HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE"));
  assert.ok(form.includes("formatPrice(result.low)} – {formatPrice(result.high)"));
  assert.ok(form.includes("Midpoint"));
  assert.ok(form.includes("Insufficient Market Data"));
  assert.ok(form.includes("AUTH_REQUIRED"));
  assert.ok(form.includes("INSUFFICIENT_DATA"));
  // Midpoint remains secondary (label), range is primary display.
  const rangeIdx = form.indexOf(
    "formatPrice(result.low)} – {formatPrice(result.high)",
  );
  const midIdx = form.indexOf("Midpoint");
  assert.ok(rangeIdx >= 0 && midIdx > rangeIdx, "range before midpoint in form");
  assert.equal(form.toLowerCase().includes("guaranteed accuracy"), false);
  assert.equal(form.toLowerCase().includes("highly accurate"), false);
  console.log("[form] range + confidence + insufficient PASS");
}

function testListingInsightsPresentation() {
  const ui = read("src/components/listings/insights/HouzzatInsights.tsx");
  assert.ok(ui.includes("Estimated range"));
  assert.ok(ui.includes("Midpoint"));
  assert.ok(ui.includes("formatValuationConfidence"));
  assert.ok(ui.includes("HOME_VALUE_DISCLAIMER"));
  assert.ok(ui.includes("HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE"));
  assert.ok(ui.includes("Insufficient Market Data"));
  assert.ok(ui.includes("valuation.restricted"));
  assert.ok(ui.includes("InsightGate"));

  const insights = read("src/lib/market/listing-insights.ts");
  assert.ok(insights.includes("homeValueOkDisclaimer"));
  assert.ok(insights.includes("homeValueInsufficientDisclaimer"));
  assert.ok(insights.includes("restricted: !signedIn"));
  assert.ok(
    insights.includes("const valMid = signedIn && okEstimate ? okEstimate.mid : null"),
  );
  assert.ok(
    insights.includes("const valLow = signedIn && okEstimate ? okEstimate.low : null"),
  );
  assert.ok(
    insights.includes("const valHigh = signedIn && okEstimate ? okEstimate.high : null"),
  );
  assert.ok(
    insights.includes(
      "confidence: signedIn && okEstimate ? okEstimate.confidence : null",
    ),
  );
  console.log("[insights] range-first + VOW redaction PASS");
}

function testApiPresentationAndVow() {
  const route = read("src/app/api/valuation/route.ts");
  assert.ok(route.includes("homeValueOkDisclaimer"));
  assert.ok(route.includes("confidence: estimate.confidence"));
  assert.ok(route.includes("AUTH_REQUIRED"));
  assert.ok(route.includes("valuationSoldAccessDenial"));
  assert.ok(route.includes("hasClientAccess"));
  assert.ok(route.includes("INSUFFICIENT_DATA"));
  assert.ok(route.includes("Never trust client estimatedLow"));
  assert.ok(route.includes("estimate: null"));
  // Must not ship old "guarantee of sale price" wording as primary disclaimer.
  assert.equal(
    route.includes("guarantee of sale price"),
    false,
    "API must use concise non-guarantee disclaimer helper",
  );
  console.log("[api] disclaimer + VOW gates PASS");
}

function testNoSoldPriceLeakInPresentationLayer() {
  const form = read("src/components/valuation/HomeValuationForm.tsx");
  const ui = read("src/components/listings/insights/HouzzatInsights.tsx");
  // Presentation must not invent or hardcode sold comps prices.
  for (const src of [form, ui]) {
    assert.equal(src.includes("soldPrice:"), false);
    assert.equal(/875_?000|899_?000/.test(src), false);
  }
  console.log("[safety] no accidental sold-price disclosure in UI PASS");
}

function testFaqsConfidenceLanguage() {
  const faqs = read("src/components/valuation/valuation-faqs.ts");
  const lower = faqs.toLowerCase();
  assert.ok(faqs.includes("comparable evidence quality"));
  assert.ok(faqs.includes("not a verified prediction accuracy rate"));
  assert.ok(lower.includes("limited comparable data"));
  assert.ok(lower.includes("moderate support") || lower.includes("moderate comparable support"));
  assert.ok(lower.includes("stronger comparable support"));
  assert.equal(lower.includes("highly accurate"), false);
  console.log("[faqs] confidence language PASS");
}

function testHeroEntryPointDisclaimer() {
  const hero = read("src/components/home/HomeHeroSearch.tsx");
  assert.ok(hero.includes("HOME_VALUE_DISCLAIMER"));
  console.log("[hero] sell-mode disclaimer PASS");
}

function testAlgorithmUntouchedForPresentation() {
  // Presentation module must not import Prisma or mutate estimate math.
  const presentation = read("src/lib/market/home-value-presentation.ts");
  assert.equal(presentation.includes("prisma"), false);
  assert.equal(presentation.includes("estimateHomeValue"), false);
  assert.equal(presentation.includes("SIZE_ELASTICITY"), false);
  assert.ok(presentation.includes("Does not affect valuation math"));
  console.log("[isolation] presentation separated from formula PASS");
}

function main() {
  testConfidenceCopy();
  testDisclaimer();
  testHomeValuationFormPresentation();
  testListingInsightsPresentation();
  testApiPresentationAndVow();
  testNoSoldPriceLeakInPresentationLayer();
  testFaqsConfidenceLanguage();
  testHeroEntryPointDisclaimer();
  testAlgorithmUntouchedForPresentation();
  console.log("home-value-presentation-selftest: OK");
}

main();

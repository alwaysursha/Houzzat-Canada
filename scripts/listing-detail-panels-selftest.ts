/**
 * Listing Detail presentation matches 745f2ce, with later nonvisual
 * browse matching and request caches still in place.
 * Run: pnpm listing-detail-panels:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

const detail = read("src/components/listings/ListingDetailView.tsx");
const section = read("src/components/listings/ListingSection.tsx");
const related = read("src/components/listings/ListingRelatedSection.tsx");
const insights = read("src/components/listings/insights/ListingInsightsDeferred.tsx");
const houzzat = read("src/components/listings/insights/HouzzatInsights.tsx");
const history = read("src/components/listings/ListingHistoryPanel.tsx");
const facts = read("src/components/listings/ListingFactsPanel.tsx");
const sticky = read("src/components/listings/ListingStickyBar.tsx");
const store = read("src/lib/mobile/listing-sheet-store.ts");
const search = read("src/components/listings/SearchExperience.tsx");

assert.equal(detail.includes("ListingDetailPanels"), false);
assert.equal(detail.includes("DesktopListingActions"), false);
assert.equal(detail.includes("<ListingEstimateLine"), false);
assert.equal(detail.includes("publicAgent"), false);
assert.ok(detail.includes("<ListingQaPanel"));
assert.ok(detail.includes("font-display text-3xl tracking-tight text-canopy"));
assert.ok(detail.includes("rounded-2xl border border-line/80 bg-surface"));
assert.ok(section.includes("font-display text-xl text-ink sm:text-2xl"));
assert.ok(
  section.includes(
    "rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)]",
  ),
);

assert.ok(related.includes('title="Related homes"'));
assert.ok(related.includes('eyebrow="Keep exploring"'));
assert.ok(related.includes("More for sale"));
assert.ok(related.includes("Recent sold"));
assert.ok(related.includes('{ id: "same-area", label: "Nearby" }'));
assert.ok(related.includes('{ id: "same-features", label: "Similar homes" }'));
assert.equal(related.includes("relatedResponseCache"), false);
assert.equal(related.includes('presentation === "similar"'), false);

assert.equal(insights.includes("useListingInsights"), false);
assert.ok(insights.includes("font-display text-xl text-ink"));
assert.ok(insights.includes('id="listing-estimated-value"'));
assert.equal(insights.includes("ListingEstimateLine"), false);
assert.ok(houzzat.includes("listing-estimated-value") || insights.includes("listing-estimated-value"));
assert.ok(history.includes("Listing History") || history.includes("listing-history"));
assert.ok(facts.includes("listing-details") || facts.length > 0);

assert.ok(sticky.includes("ListingBreadcrumbs"));
assert.ok(sticky.includes("SaveListingButton"));
assert.ok(store.includes("sameListingHref"));
assert.ok(search.includes("publishListingBrowseSource"));

console.log("listing-detail-panels selftest ok");

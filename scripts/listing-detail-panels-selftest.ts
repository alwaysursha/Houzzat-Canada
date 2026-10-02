/**
 * Listing Detail presentation matches the pre-redesign page (aef3732),
 * while later nonvisual browse and insights-cache fixes stay in place.
 * Run: pnpm listing-detail-panels:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

const detail = read("src/components/listings/ListingDetailView.tsx");
const gallery = read("src/components/listings/ListingGallery.tsx");
const sticky = read("src/components/listings/ListingStickyBar.tsx");
const host = read("src/components/mobile/ListingSheetHost.tsx");
const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
const related = read("src/components/listings/ListingRelatedSection.tsx");
const insights = read(
  "src/components/listings/insights/ListingInsightsDeferred.tsx",
);
const store = read("src/lib/mobile/listing-sheet-store.ts");

assert.equal(detail.includes("ListingDetailPanels"), false);
assert.equal(detail.includes("DesktopListingActions"), false);
assert.equal(detail.includes("<ListingEstimateLine"), false);
assert.equal(detail.includes("presentation=\"similar\""), false);
assert.equal(detail.includes("presentation=\"comparable-sold\""), false);
assert.ok(detail.includes("<ListingDetailSectionNav"));
assert.ok(detail.includes("md:rounded-2xl md:border md:border-line/40 md:bg-surface"));
assert.ok(detail.includes("ListingMapViewButton"));
assert.ok(detail.includes("initialMode=\"SAME_AREA\""));
assert.ok(detail.includes("order-7 md:contents"));
assert.ok(detail.includes("order-8 md:contents"));
assert.ok(detail.includes("order-11 md:hidden"));
assert.ok(detail.includes("order-12 md:contents"));
assert.ok(detail.includes('{ id: "listing-insights", label: "Insights" }'));
assert.ok(detail.includes('{ id: "listing-estimated-value", label: "Estimated Value" }'));
assert.ok(
  detail.indexOf('label: "Insights"') < detail.indexOf('label: "History"'),
);
assert.ok(
  detail.indexOf("<ListingRelatedSection") < detail.indexOf("<DriveTimePanel"),
);
assert.ok(detail.includes("<ListingNarrative"));
assert.ok(detail.includes("<ListingFactsPanel"));
assert.ok(detail.includes("<ListingRoomsLive"));
assert.ok(detail.includes("<ListingOpenHousesLive"));
assert.ok(detail.includes("<ListingHistoryPanel"));
assert.ok(detail.includes("<ListingInsightsDeferred"));
assert.ok(detail.includes("<NearbyAmenitiesDeferred"));

assert.ok(sticky.includes("SaveListingButton"));
assert.ok(sticky.includes("WatchListingButton"));
assert.ok(sticky.includes("ShareListingButton"));
assert.ok(sticky.includes("ListingBreadcrumbs"));
assert.equal(sticky.includes("if (isSheet) return null"), false);

assert.ok(gallery.includes("aspect-[4/3]"));
assert.equal(gallery.includes("min-h-[52vh] w-full min-w-full"), false);
assert.ok(gallery.includes('restoreEntry="gallery"'));

assert.equal(host.includes("houzzat-sheet-in"), false);
assert.ok(host.includes("<Panel key={state.href}"));
assert.ok(chrome.includes('LISTING_SHEET_CHROME_BODY = "6.5rem"'));
assert.ok(chrome.includes('aria-label="Back to results"'));
assert.equal(chrome.includes("md:text-canopy"), false);

assert.ok(related.includes('{ id: "same-area", label: "Nearby" }'));
assert.ok(related.includes('{ id: "same-features", label: "Similar homes" }'));
assert.ok(related.includes("Explore nearby homes"));
assert.ok(insights.includes("useListingInsights"));
assert.ok(store.includes("sameListingHref"));

console.log("listing-detail-panels selftest ok");

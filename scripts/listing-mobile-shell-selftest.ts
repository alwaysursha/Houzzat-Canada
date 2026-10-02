/**
 * Listing shell presentation matches 745f2ce.
 * Run: pnpm listing-mobile-shell:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
const gallery = read("src/components/listings/ListingGallery.tsx");
const detail = read("src/components/listings/ListingDetailView.tsx");
const host = read("src/components/mobile/ListingSheetHost.tsx");
const menu = read("src/components/listings/ListingMobileSideMenu.tsx");
const bar = read("src/components/listings/ListingMobileActionBar.tsx");
const panel = read("src/components/listings/ViewingRequestPanel.tsx");
const form = read("src/components/listings/LeadRequestForm.tsx");

assert.ok(
  chrome.includes(
    "font-display text-[1.7rem] font-semibold leading-none tracking-tight text-white sm:text-[1.85rem]",
  ),
);
assert.ok(chrome.includes('aria-label="Back to previous listing"'));
assert.ok(chrome.includes("useSavedListingToggle"));
assert.equal(chrome.includes('aria-label="Previous listing"'), false);

assert.ok(gallery.includes("hidden md:block"));
assert.ok(gallery.includes("md:grid-cols-4 md:grid-rows-2"));
assert.ok(gallery.includes("min-h-[52vh] w-full min-w-full"));
assert.ok(gallery.includes("object-cover"));
assert.ok(gallery.includes("openViewerAt(0)"));
assert.equal(gallery.includes('restoreEntry="gallery"'), false);
assert.equal(gallery.includes("aspect-[4/3]"), false);

assert.ok(detail.includes("<ListingQaPanel"));
assert.ok(detail.includes("Quick question?"));
assert.ok(detail.includes("font-display text-3xl"));
assert.equal(detail.includes("ListingMapViewButton"), false);
assert.equal(detail.includes("order-7 md:contents"), false);
assert.equal(detail.includes("MobilePublicAgentSection"), false);
assert.ok(detail.includes("<ListingAccessGate"));
assert.ok(detail.includes("<ViewingRequestPanel"));
assert.ok(
  detail.indexOf("<ListingQaPanel") < detail.indexOf("<DriveTimePanel"),
);
assert.ok(
  detail.indexOf("<ListingHistoryPanel") <
    detail.indexOf("<ListingInsightsDeferred"),
);
assert.ok(
  detail.indexOf("<ListingInsightsDeferred") <
    detail.indexOf("<ListingRelatedSection"),
);
assert.ok(
  detail.indexOf("<ListingRelatedSection") <
    detail.indexOf("<NearbyAmenitiesDeferred"),
);
assert.ok(detail.includes('{ id: "listing-insights", label: "Insights" }'));
assert.ok(
  detail.indexOf('label: "History"') < detail.indexOf('label: "Insights"'),
);
assert.ok(detail.includes('className="hidden md:block"'));

assert.ok(host.includes("openListingSheet(data.href, browse)"));
assert.ok(host.includes("browseHrefs"));
assert.ok(host.includes("houzzat-sheet-in"));
assert.ok(host.includes("transform: translateY(18px)"));
assert.equal(host.includes("translateX"), false);
assert.ok(host.includes("md:w-[min(1360px,calc(100%-4rem))]"));

assert.ok(menu.includes("md:hidden"));
assert.ok(menu.includes("<ShareListingButton"));
assert.ok(menu.includes("<SaveListingButton"));

assert.ok(bar.includes("md:hidden"));
assert.ok(bar.includes("Book a viewing"));
assert.ok(bar.includes("Watch this area"));
assert.ok(bar.includes("Find similar homes"));
assert.equal(bar.includes("peekLeadRequestEntry"), false);

assert.ok(panel.includes("Ask about this home"));
assert.ok(detail.includes('<ViewingRequestPanel\n            className="hidden md:block"') || detail.includes('className="hidden md:block"'));
assert.equal(panel.includes("publicAgent"), false);
assert.ok(form.includes('kind === "inquiry" ? "CONTACT_AGENT" : "REQUEST_VIEWING"'));
assert.equal(form.includes("restoreEntry"), false);

console.log("listing-mobile-shell selftest ok");

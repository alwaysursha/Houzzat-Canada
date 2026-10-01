/**
 * In-place listing tabs and the summary refinements around them.
 * Run: pnpm listing-detail-panels:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

function count(source: string, needle: string) {
  return source.split(needle).length - 1;
}

const detail = read("src/components/listings/ListingDetailView.tsx");
const panels = read("src/components/listings/ListingDetailPanels.tsx");
const gallery = read("src/components/listings/ListingGallery.tsx");
const related = read("src/components/listings/ListingRelatedSection.tsx");
const insights = read("src/components/listings/insights/ListingInsightsDeferred.tsx");
const share = read("src/components/listings/ShareListingButton.tsx");
const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
const bar = read("src/components/listings/ListingMobileActionBar.tsx");
const store = read("src/lib/mobile/listing-sheet-store.ts");

assert.ok(detail.includes("homesForSaleCommunityPath"));
assert.ok(detail.includes("interceptListingSheetExitClick"));
assert.ok(detail.includes("{listing.community}"));
assert.ok(detail.includes("font-semibold text-canopy underline-offset-2 hover:underline"));
const locality = detail.slice(
  detail.indexOf("{listing.city.trim()}"),
  detail.indexOf("{propertyTypeLabel(listing.propertyType)}"),
);
assert.equal(locality.includes("md:hidden"), false);
assert.equal(locality.includes("hidden md:"), false);

const summaryFacts = detail.slice(
  detail.indexOf("function summaryRangeSqftCaption"),
  detail.indexOf("function DesktopListingActions"),
);
assert.ok(summaryFacts.includes('case "bed"'));
assert.ok(summaryFacts.includes('case "bath"'));
assert.ok(summaryFacts.includes('case "sqft"'));
assert.ok(summaryFacts.includes('case "parking"'));
assert.ok(summaryFacts.includes('segment !== "COMMERCIAL"'));
assert.ok(summaryFacts.includes("formatLivingAreaRangeLabel"));
assert.equal(summaryFacts.includes("summaryExactSqftCaption"), false);
assert.equal(summaryFacts.includes("listing.sqft"), false);
assert.ok(summaryFacts.includes('bedValue === "1" ? "Bedroom" : "Bedrooms"'));
assert.ok(summaryFacts.includes('baths === 1 ? "Bathroom" : "Bathrooms"'));
assert.ok(summaryFacts.includes('parkingSpaces === 1 ? "Spot" : "Spots"'));
assert.ok(summaryFacts.includes("justify-between"));
assert.ok(summaryFacts.includes("whitespace-nowrap"));
assert.ok(summaryFacts.includes("flex-col"));
assert.ok(summaryFacts.includes("md:flex-row"));
assert.ok(summaryFacts.includes("clamp(0.8125rem,3.6vw,1.125rem)"));
assert.ok(summaryFacts.includes("md:shrink-0"));
assert.ok(summaryFacts.includes("md:flex-nowrap"));
assert.equal(summaryFacts.includes("100cqi"), false);
assert.equal(summaryFacts.includes("lg:w-auto"), false);
assert.equal(summaryFacts.includes("minmax(0, 1fr)"), false);
assert.equal(summaryFacts.includes("border"), false);
assert.equal(count(detail, "formatListingSqftLabel("), 1);
assert.ok(
  detail.includes("livingAreaRange: listingFacts?.livingAreaRange"),
);

assert.equal(detail.includes("ListingMapViewButton"), false);
assert.ok(gallery.includes("ListingGalleryMapSlide"));
assert.ok(gallery.includes("hidden md:block"));
assert.ok(gallery.includes("md:grid-cols-4 md:grid-rows-2"));
assert.ok(gallery.includes("min-h-[52vh] w-full min-w-full"));
assert.equal(gallery.includes("aspect-[4/3]"), false);
assert.ok(gallery.includes('restoreEntry="gallery"'));

assert.ok(detail.includes("estimateEligible"));
assert.ok(detail.includes('listing.status === "ACTIVE"'));
assert.ok(detail.includes('listing.transactionType === "SALE"'));
assert.ok(detail.includes("!showClosedPrice"));
assert.ok(detail.includes("eligible={estimateEligible}"));
assert.ok(insights.includes("valuation.restricted"));
assert.ok(insights.includes("valuation.mid == null"));
assert.ok(insights.includes("useListingInsights"));

assert.ok(panels.includes('useState<ListingDetailTab>("overview")'));
assert.equal(panels.includes("scrollIntoView"), false);
assert.equal(panels.includes("router.push"), false);
assert.equal(panels.includes("useRouter"), false);
assert.equal(detail.includes("scrollIntoView"), false);
assert.equal(detail.includes("router.push"), false);
assert.ok(panels.includes("hidden={tab !== panel.id}"));
assert.ok(panels.includes("Nearby") === false);
assert.equal(panels.includes("Nearby Listings"), false);

assert.equal(count(detail, "<ListingHistoryPanel"), 1);
assert.equal(count(detail, "<ListingInsightsDeferred"), 1);
assert.equal(count(detail, "<DriveTimePanel"), 1);
assert.equal(count(detail, "<NearbyAmenitiesDeferred"), 1);
assert.equal(count(detail, "<ListingNarrative"), 1);
assert.equal(count(detail, "<ListingFactsPanel"), 1);

const historyOwner = detail.slice(
  detail.indexOf("history={"),
  detail.indexOf("insights={"),
);
assert.ok(historyOwner.includes("<ListingHistoryPanel"));
const insightsOwner = detail.slice(
  detail.indexOf("insights={"),
  detail.indexOf("neighbourhood={"),
);
assert.ok(insightsOwner.includes("<ListingInsightsDeferred"));
const neighbourhoodOwner = detail.slice(
  detail.indexOf("neighbourhood={"),
  detail.indexOf("comparableSold={"),
);
assert.ok(neighbourhoodOwner.includes("<DriveTimePanel"));
assert.ok(neighbourhoodOwner.includes("<NearbyAmenitiesDeferred"));

assert.ok(detail.includes('presentation="comparable-sold"'));
assert.ok(detail.includes('presentation="similar"'));
assert.ok(related.includes('presentation === "comparable-sold" ? "sold"'));
assert.ok(related.includes('locked ? "same-features"'));
assert.ok(related.includes("relatedResponseCache"));
assert.ok(related.includes("if (locked) return;"));
assert.equal(count(detail, "<ListingRelatedSection"), 2);

assert.ok(chrome.includes("hasBrowse"));
assert.ok(chrome.includes("replaceListingSheet"));
assert.ok(store.includes("sameListingHref"));
assert.ok(share.includes("openUpward"));
assert.ok(share.includes("bottom-full mb-2"));
assert.ok(bar.includes('restoreEntry="concierge"'));
assert.ok(bar.includes("Book a viewing"));
assert.ok(bar.includes("Watch this area"));
assert.ok(detail.includes("<ListingMobileActionBar"));
assert.ok(detail.includes("text-canopy md:text-[2.5rem]"));
assert.equal(detail.includes("md:text-ink"), false);
assert.ok(detail.includes("isListingSheet ? \"pt-0\" : \"pt-3\""));

console.log("listing-detail-panels selftest ok");

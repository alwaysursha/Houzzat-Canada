/**
 * Mobile listing shell: compact chrome, hero gallery, summary.
 * Desktop gallery grid and Previous/Next stay on md+.
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
const booking = read("src/components/listings/ViewingBookingModal.tsx");

assert.ok(
  chrome.includes(
    "font-display text-[1.7rem] font-semibold leading-none tracking-tight text-white sm:text-[1.85rem]",
  ),
);
assert.ok(chrome.includes('aria-label="Previous listing"'));
assert.ok(chrome.includes("md:inline-flex"));
assert.ok(chrome.includes("iconOnly"));
assert.ok(chrome.includes("useSavedListingToggle"));
assert.equal(chrome.includes("Search · Share · Save"), false);

assert.ok(gallery.includes("hidden md:block"));
assert.ok(gallery.includes("md:grid-cols-4 md:grid-rows-2"));
assert.ok(gallery.includes("min-h-[52vh] w-full min-w-full"));
assert.ok(gallery.includes("ListingGalleryMapSlide"));
assert.ok(gallery.includes("object-cover"));
assert.ok(gallery.includes("openStack()"));
assert.ok(gallery.includes('restoreEntry="gallery"'));
assert.equal(gallery.includes("aspect-[4/3]"), false);

assert.ok(detail.includes("ListingDetailPanels"));
assert.equal(detail.includes("DesktopListingSectionNav"), false);
assert.equal(detail.includes("scrollIntoView"), false);
assert.ok(detail.includes("DesktopListingActions"));
assert.ok(detail.includes("lg:col-span-2"));
assert.ok(detail.includes('aria-label="Property facts"'));
assert.equal(detail.includes("ListingMapViewButton"), false);
assert.ok(gallery.includes("ListingGalleryMapSlide"));
assert.ok(detail.includes("Virtual tour"));
assert.ok(detail.includes("<ListingAccessGate"));
assert.ok(detail.includes("<ViewingRequestPanel"));
assert.ok(detail.includes("<MobilePublicAgentSection"));
assert.equal(detail.includes("<ListingQaPanel"), false);
assert.ok(
  detail.indexOf("<ListingHistoryPanel") <
    detail.indexOf("<ListingInsightsDeferred"),
);
assert.ok(
  detail.indexOf("presentation=\"similar\"") <
    detail.indexOf("<MobilePublicAgentSection"),
);
assert.ok(detail.includes('className="hidden md:block"'));

assert.ok(host.includes("min-width: 768px"));
assert.ok(host.includes("2.75rem"));
assert.ok(host.includes("LISTING_SHEET_CHROME_BODY"));

assert.ok(menu.includes("md:hidden"));
assert.ok(menu.includes("<ShareListingButton"));
assert.ok(menu.includes("<SaveListingButton"));

assert.ok(bar.includes("md:hidden"));
assert.ok(bar.includes("setBookingOpen(true)"));
assert.ok(bar.includes('peekLeadRequestEntry() === "gallery"'));
assert.ok(bar.includes('restoreEntry="concierge"'));

const contactButton = panel.slice(
  panel.indexOf("export function MobilePublicAgentSection"),
  panel.indexOf("function useListingViewport"),
);
assert.ok(contactButton.includes("Contact Agent"));
assert.ok(contactButton.includes("{inactive ? ("));
assert.ok(
  contactButton.indexOf("{inactive ? (") >
    contactButton.indexOf("showIdentity && agent"),
);
assert.ok(contactButton.includes("<ListingQaPanel"));
assert.ok(detail.includes("inactive={isInactive}"));
assert.ok(
  detail.includes("isInactive ? () => setMobileInquiryOpen(true) : undefined"),
);
assert.ok(detail.includes("mobileInquiryOpen={isInactive && mobileInquiryOpen}"));
assert.ok(panel.includes('id="listing-inquiry"'));
assert.ok(
  panel.includes(
    'narrow && (restore?.kind === "inquiry" || mobileInquiryOpen)',
  ),
);
assert.equal(panel.split('kind="inquiry"').length - 1, 1);
assert.equal(panel.split("useLeadRequestRestore(").length - 1, 1);
assert.equal(booking.split("useLeadRequestRestore(").length - 1, 1);
assert.ok(!detail.includes("useLeadRequestRestore"));
assert.ok(!detail.includes('kind="inquiry"'));
assert.ok(form.includes('kind === "inquiry" ? "CONTACT_AGENT" : "REQUEST_VIEWING"'));
assert.ok(panel.includes("inactive || viewport === \"wide\""));
assert.ok(panel.includes("!galleryStarted"));
assert.ok(!gallery.includes("CONTACT_AGENT"));
assert.ok(!gallery.includes('kind="inquiry"'));
assert.ok(bar.includes('pending.kind === "inquiry"'));
assert.ok(bar.includes("Watch this area"));
assert.ok(bar.includes("Find similar homes"));
const inactiveBar = bar.slice(
  bar.indexOf("{inactive ? ("),
  bar.indexOf(") : ("),
);
assert.ok(!inactiveBar.includes("Book a viewing"));
assert.ok(bar.includes("Book a viewing"));
assert.ok(panel.includes("Ask about this home"));
assert.ok(panel.includes("hidden md:block"));
assert.ok(detail.includes('className="hidden md:block"'));

console.log("listing-mobile-shell selftest ok");

/**
 * Desktop Previous/Next uses the ordered browsing context on the sheet
 * frame. It replaces the current sheet. It does not grow the stack or
 * invent neighbors.
 * Run: pnpm listing-sheet-browse:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LISTING_SHEET_HISTORY_MAX_AGE_MS,
  backListingSheet,
  beginListingSheetNavigationAway,
  captureListingSheetHistoryMarker,
  closeListingSheet,
  consumeListingSheetNavigationAway,
  discardListingSheetMemoryForReload,
  getListingSheetState,
  historyStateWithoutListingSheet,
  openListingSheet,
  replaceListingSheet,
  restoreListingSheetFromHistory,
} from "../src/lib/mobile/listing-sheet-store";
import {
  browseSourceForHref,
  publishListingBrowseSource,
} from "../src/lib/mobile/listing-browse-source";

const A = "/listing/a-st/A";
const B = "/listing/b-st/B";
const C = "/listing/c-st/C";
const D = "/listing/d-st/D";
const E = "/listing/e-st/E";
const RESULTS = [A, B, C, D, E];

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

function reset() {
  closeListingSheet();
  consumeListingSheetNavigationAway();
  publishListingBrowseSource(null);
}

function testSearchContextNavigation() {
  reset();
  publishListingBrowseSource(RESULTS);
  assert.deepEqual(browseSourceForHref(C), RESULTS);
  assert.equal(browseSourceForHref("/listing/missing/Z"), null);

  openListingSheet(C, browseSourceForHref(C));
  let state = getListingSheetState();
  assert.equal(state.href, C);
  assert.equal(state.depth, 1);
  assert.equal(state.previousHref, B);
  assert.equal(state.nextHref, D);

  assert.equal(replaceListingSheet(state.previousHref!), true);
  state = getListingSheetState();
  assert.equal(state.href, B);
  assert.equal(state.depth, 1);

  assert.equal(replaceListingSheet(C), true);
  assert.equal(replaceListingSheet(D), true);
  assert.equal(replaceListingSheet(E), true);
  state = getListingSheetState();
  assert.equal(state.href, E);
  assert.equal(state.depth, 1);
  assert.equal(state.nextHref, null);
  assert.equal(state.previousHref, D);

  openListingSheet(A, RESULTS);
  state = getListingSheetState();
  assert.equal(state.href, A);
  assert.equal(state.previousHref, null);
  assert.equal(state.nextHref, B);
  assert.equal(replaceListingSheet(state.previousHref ?? ""), false);
  assert.equal(getListingSheetState().href, A);
}

function testReplaceDoesNotGrowStackOrHistoryCalls() {
  reset();
  openListingSheet(C, RESULTS);
  replaceListingSheet(D);
  replaceListingSheet(E);
  const state = getListingSheetState();
  assert.equal(state.depth, 1);
  assert.equal(state.canBack, false);
  assert.equal(state.href, E);

  const host = read("src/components/mobile/ListingSheetHost.tsx");
  assert.equal(host.split("window.history.pushState").length - 1, 1);
  assert.ok(host.includes("if (!historyPushedRef.current)"));
  assert.ok(host.includes("win.location.replace(url)"));
  assert.equal(host.includes("replaceListingSheet"), false);
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  assert.equal(chrome.includes("router.push"), false);
  assert.equal(chrome.includes("window.location.href"), false);
  assert.equal(chrome.includes("location.assign"), false);
}

function testCloseAndBackLeaveSearchMounted() {
  reset();
  openListingSheet(C, RESULTS);
  replaceListingSheet(D);
  openListingSheet("/listing/similar/S");
  let state = getListingSheetState();
  assert.equal(state.depth, 2);
  assert.equal(state.hasBrowse, false);
  assert.equal(state.previousHref, null);

  assert.equal(backListingSheet(), true);
  state = getListingSheetState();
  assert.equal(state.href, D);
  assert.equal(state.depth, 1);
  assert.equal(state.hasBrowse, true);
  assert.equal(state.nextHref, E);

  closeListingSheet();
  state = getListingSheetState();
  assert.equal(state.href, null);
  assert.equal(state.depth, 0);
  assert.equal(state.hasBrowse, false);

  const search = read("src/components/listings/SearchExperience.tsx");
  assert.ok(search.includes("publishListingBrowseSource("));
  assert.equal(search.includes("replaceListingSheet"), false);
  assert.equal(search.includes("window.scrollTo"), false);
}

function testNoFakeContextAndGracefulMiss() {
  reset();
  openListingSheet("/listing/direct/MLS");
  let state = getListingSheetState();
  assert.equal(state.hasBrowse, false);
  assert.equal(state.previousHref, null);
  assert.equal(state.nextHref, null);

  closeListingSheet();
  openListingSheet(C, ["/listing/not-this/X", "/listing/other/Y"]);
  state = getListingSheetState();
  assert.equal(state.hasBrowse, false);

  closeListingSheet();
  openListingSheet(C, RESULTS);
  assert.equal(replaceListingSheet("/listing/removed/GONE"), false);
  assert.equal(getListingSheetState().href, C);
  assert.equal(
    replaceListingSheet("/listing/removed/GONE?payload={}&price=1"),
    false,
  );
}

function testMlsSlugDriftKeepsBrowse() {
  reset();
  publishListingBrowseSource(RESULTS);
  const drifted = "/listing/C";
  const browse = browseSourceForHref(drifted);
  assert.ok(browse);
  openListingSheet(drifted, browse);
  const state = getListingSheetState();
  assert.equal(state.hasBrowse, true);
  assert.equal(state.previousHref, B);
  assert.equal(state.nextHref, D);
  assert.equal(replaceListingSheet(state.nextHref!), true);
  assert.equal(getListingSheetState().href, D);
  assert.equal(getListingSheetState().depth, 1);
}

function testContextStoresPathsOnly() {
  reset();
  openListingSheet(C, [
    A,
    "https://houzzat.local/listing/b-st/B?sheet=1",
    C,
    D,
    E,
    "/search?city=Toronto",
  ]);
  const state = getListingSheetState();
  assert.equal(state.previousHref, B);
  assert.equal(state.nextHref, D);
  const store = read("src/lib/mobile/listing-sheet-store.ts");
  assert.equal(store.includes("primaryImageUrl"), false);
  assert.equal(store.includes("soldPrice"), false);
  const source = read("src/lib/mobile/listing-browse-source.ts");
  assert.ok(source.includes("Paths only"));
}

function testGateIframePanelAndDesktopChrome() {
  const gate = read("src/components/listings/ListingAccessGate.tsx");
  const detail = read("src/components/listings/ListingDetailView.tsx");
  const panel = read("src/components/listings/ListingDetailPanel.tsx");
  const host = read("src/components/mobile/ListingSheetHost.tsx");
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  const nav = read("src/lib/listings/navigate-listing.ts");

  assert.ok(gate.includes('intent: "VIEW_LISTING"'));
  assert.ok(detail.includes("<ListingAccessGate"));
  assert.ok(panel.includes("<ListingDetailView"));
  assert.ok(host.includes("<Panel key={shown.href}"));
  assert.ok(host.includes("browseHrefs"));
  assert.ok(host.includes("openListingSheet(data.href, browse)"));
  assert.ok(nav.includes("browseSourceForHref(path)"));
  assert.ok(nav.includes("browseHrefs: browse"));
  assert.ok(
    chrome.includes(
      "font-display text-[1.7rem] font-semibold leading-none tracking-tight text-white sm:text-[1.85rem]",
    ),
  );
  assert.ok(chrome.includes('aria-label="Back to previous listing"'));
  assert.ok(chrome.includes('aria-label="Close listing"'));
  assert.ok(chrome.includes('aria-label="Previous listing"'));
  assert.ok(chrome.includes('aria-label="Next listing"'));
  assert.ok(chrome.includes("replaceListingSheet"));
  assert.equal(chrome.includes("anonymous-listing-access"), false);
}

function testRefreshRestoresTheOpenListingOnly() {
  reset();
  const now = 1_700_000_000_000;
  const href = "/listing/3275-stalybridge-drive-34-oakville/X13852960";
  openListingSheet(href, [A, href, C]);
  const marker = captureListingSheetHistoryMarker(now);
  assert.ok(marker);
  assert.equal(marker.houzzatListingHref, href);

  discardListingSheetMemoryForReload();
  assert.equal(getListingSheetState().href, null);
  assert.equal(restoreListingSheetFromHistory(marker, now), true);
  let state = getListingSheetState();
  assert.equal(state.href, href);
  assert.equal(state.depth, 1);
  assert.equal(state.previousHref, A);
  assert.equal(state.nextHref, C);
  assert.equal(restoreListingSheetFromHistory(marker, now), false);
  assert.equal(getListingSheetState().depth, 1);

  discardListingSheetMemoryForReload();
  assert.equal(
    restoreListingSheetFromHistory(
      marker,
      now + LISTING_SHEET_HISTORY_MAX_AGE_MS + 1,
    ),
    false,
  );
  assert.equal(getListingSheetState().href, null);

  openListingSheet(href, [A, href, C]);
  replaceListingSheet(C);
  let history: Record<string, unknown> = {
    idx: 1,
    ...captureListingSheetHistoryMarker(now)!,
  };
  history = {
    ...historyStateWithoutListingSheet(history),
    idx: 1,
    ...captureListingSheetHistoryMarker(now)!,
  };
  discardListingSheetMemoryForReload();
  assert.equal(restoreListingSheetFromHistory(history, now), true);
  assert.equal(getListingSheetState().href, C);
  assert.equal(
    (historyStateWithoutListingSheet(history) as { idx?: number }).idx,
    1,
  );

  closeListingSheet();
  assert.equal(captureListingSheetHistoryMarker(now), null);
  const cleared = historyStateWithoutListingSheet(history);
  assert.equal(cleared.houzzatListingHref, undefined);
  assert.equal(cleared.houzzatListingSheet, undefined);
  discardListingSheetMemoryForReload();
  assert.equal(restoreListingSheetFromHistory(cleared, now), false);
  assert.equal(getListingSheetState().href, null);

  openListingSheet(href, [A, href, C]);
  beginListingSheetNavigationAway();
  assert.equal(getListingSheetState().href, null);
  assert.equal(consumeListingSheetNavigationAway(), true);
  assert.equal(restoreListingSheetFromHistory(cleared, now), false);

  const host = read("src/components/mobile/ListingSheetHost.tsx");
  assert.equal(host.split("window.history.pushState").length - 1, 1);
  assert.ok(host.includes("restoreListingSheetFromHistory(window.history.state)"));
  assert.ok(host.includes("historyStateWithoutListingSheet"));
  assert.ok(host.includes("consumeListingSheetNavigationAway"));

  const chip = read("src/components/route-planner/RoutePlannerFloatingChip.tsx");
  const nav = read("src/lib/listings/navigate-listing.ts");
  assert.ok(chip.includes('href="/route-planner"'));
  assert.ok(chip.includes("interceptListingSheetExitClick(event, \"/route-planner\")"));
  assert.ok(chip.includes("z-[210]"));
  assert.ok(nav.includes("beginListingSheetNavigationAway()"));
  assert.equal(nav.includes("closeListingSheet()"), false);
}

reset();
testSearchContextNavigation();
testReplaceDoesNotGrowStackOrHistoryCalls();
testCloseAndBackLeaveSearchMounted();
testNoFakeContextAndGracefulMiss();
testMlsSlugDriftKeepsBrowse();
testContextStoresPathsOnly();
testGateIframePanelAndDesktopChrome();
testRefreshRestoresTheOpenListingOnly();
reset();

console.log("listing-sheet-browse selftest ok");

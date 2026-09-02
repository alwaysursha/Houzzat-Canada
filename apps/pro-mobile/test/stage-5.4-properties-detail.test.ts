/**
 * Stage 5.4 — Native Property Detail + Shortlist + DOM tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unwrapPropertyDetail,
  unwrapSavedListingsBulk,
} from "../src/lib/property-response";
import {
  clearAllWorkspaceCaches,
  propertyDetailCache,
  savedListingsCache,
} from "../src/lib/lead-tab-cache";
import {
  daysOnMarketFromListedAt,
  formatListingTiming,
} from "../../../src/lib/listings/constants";

const REPO_ROOT = join(__dirname, "../../..");
const DETAIL_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/[mlsNumber]/route.ts",
);
const SAVED_LIST_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/saved/route.ts",
);
const SAVED_MUTATION_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/[mlsNumber]/saved/route.ts",
);
const SEARCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/search/route.ts",
);
const BUILD_DETAIL = join(REPO_ROOT, "src/lib/mobile/v2/build-property-detail.ts");
const SAVED_LIB = join(REPO_ROOT, "src/lib/mobile/v2/saved-listings.ts");
const PROPERTIES_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/PropertiesSearchScreen.tsx",
);
const DETAIL_MODAL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/PropertyDetailModal.tsx",
);
const PROPERTY_CARD = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/PropertyListingCard.tsx",
);
const SAVED_HOOK = join(
  REPO_ROOT,
  "apps/pro-mobile/src/hooks/usePropertySavedListings.ts",
);
const CACHE = join(REPO_ROOT, "apps/pro-mobile/src/lib/lead-tab-cache.ts");

async function runStage54Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.4 — PROPERTY DETAIL + SHORTLIST + DOM TESTS");
  console.log("=================================================================\n");

  console.log("[1/12] Mobile v2 property detail route...");
  {
    const route = readFileSync(DETAIL_ROUTE, "utf8");
    assert.ok(route.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(route.includes("loadListingForDetailPage"));
    assert.ok(route.includes("buildMobilePropertyDetailDto"));
    assert.ok(route.includes("isListingSavedByUser"));
    assert.equal(route.includes("WebView"), false);
    console.log("  -> PASS");
  }

  console.log("[2/12] Mobile v2 saved listings routes reuse SavedListing...");
  {
    const list = readFileSync(SAVED_LIST_ROUTE, "utf8");
    const mutate = readFileSync(SAVED_MUTATION_ROUTE, "utf8");
    const lib = readFileSync(SAVED_LIB, "utf8");
    assert.ok(list.includes("listSavedMlsForUser"));
    assert.ok(mutate.includes("saveListingForUser"));
    assert.ok(mutate.includes("unsaveListingForUser"));
    assert.ok(lib.includes("prisma.savedListing"));
    assert.equal(lib.includes("MobileShortlist"), false);
    assert.equal(lib.includes("MobileFavorite"), false);
    console.log("  -> PASS");
  }

  console.log("[3/12] Search route enriches cards with timingLabel...");
  {
    const route = readFileSync(SEARCH_ROUTE, "utf8");
    assert.ok(route.includes("enrichListingCardForMobile"));
    console.log("  -> PASS");
  }

  console.log("[4/12] Canonical DOM parity helpers...");
  {
    const listedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const card = {
      mlsNumber: "W123",
      status: "ACTIVE" as const,
      transactionType: "SALE" as const,
      listedAt,
      soldAt: null,
      daysOnMarket: 5,
      updatedAtMls: null,
    };
    const dom = daysOnMarketFromListedAt(card);
    const timingLabel = formatListingTiming(card);
    assert.equal(dom, 5);
    assert.ok(timingLabel.includes("Added"));
    console.log("  -> PASS");
  }

  console.log("[5/12] unwrapPropertyDetail + unwrapSavedListingsBulk...");
  {
    const detail = unwrapPropertyDetail({
      ok: true,
      data: {
        detail: { mlsNumber: "W123", timingLabel: "Added 3 days ago" },
        saved: true,
      },
    });
    assert.ok(detail?.detail.mlsNumber === "W123");
    assert.equal(detail?.saved, true);

    const saved = unwrapSavedListingsBulk({
      ok: true,
      data: { mlsNumbers: ["W123", "W456"] },
    });
    assert.deepEqual(saved, ["W123", "W456"]);
    console.log("  -> PASS");
  }

  console.log("[6/12] Native PropertyDetailModal instant preview + cache...");
  {
    const modal = readFileSync(DETAIL_MODAL, "utf8");
    const cache = readFileSync(CACHE, "utf8");
    assert.ok(modal.includes("PropertyDetailModal"));
    assert.ok(modal.includes("preview"));
    assert.ok(modal.includes("propertyDetailCache"));
    assert.ok(cache.includes("propertyDetailCache"));
    assert.ok(cache.includes("savedListingsCache"));
    console.log("  -> PASS");
  }

  console.log("[7/12] Shortlist button + saved hook on search screen...");
  {
    const screen = readFileSync(PROPERTIES_SCREEN, "utf8");
    const hook = readFileSync(SAVED_HOOK, "utf8");
    const card = readFileSync(PROPERTY_CARD, "utf8");
    assert.ok(screen.includes("PropertyDetailModal"));
    assert.ok(screen.includes("PropertyListingCard"));
    assert.ok(screen.includes("usePropertySavedListings"));
    assert.ok(card.includes("timingLabel"));
    assert.ok(card.includes("ShortlistButton"));
    assert.ok(screen.includes("onOpen"));
    assert.ok(hook.includes("/properties/saved"));
    assert.ok(hook.includes("/saved"));
    const btn = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/components/ShortlistButton.tsx"),
      "utf8",
    );
    assert.ok(btn.includes("Shortlisted"));
    console.log("  -> PASS");
  }

  console.log("[8/12] No WebView / browser property routes...");
  {
    const screen = readFileSync(PROPERTIES_SCREEN, "utf8");
    const modal = readFileSync(DETAIL_MODAL, "utf8");
    for (const src of [screen, modal]) {
      assert.equal(src.includes("WebView"), false);
      assert.equal(src.includes("Linking.openURL"), false);
      assert.equal(src.includes("/listing/"), false);
      assert.equal(src.includes("houzzat.com/property"), false);
    }
    console.log("  -> PASS");
  }

  console.log("[9/12] Detail DTO builder bounded gallery...");
  {
    const lib = readFileSync(BUILD_DETAIL, "utf8");
    assert.ok(lib.includes(".slice(0, 15)"));
    assert.ok(lib.includes("mlsDisclaimer"));
    console.log("  -> PASS");
  }

  console.log("[10/12] Workspace cache isolation for detail + saved...");
  {
    clearAllWorkspaceCaches();
    savedListingsCache.set("ws1:saved-listings", {
      mlsNumbers: new Set(["W1"]),
      timestamp: Date.now(),
    });
    propertyDetailCache.set("ws1:property:W1", {
      detail: { mlsNumber: "W1" } as never,
      saved: true,
      timestamp: Date.now(),
    });
    clearAllWorkspaceCaches("ws1");
    assert.equal(savedListingsCache.has("ws1:saved-listings"), false);
    assert.equal(propertyDetailCache.has("ws1:property:W1"), false);
    console.log("  -> PASS");
  }

  console.log("[11/12] No new DB migration / listing model...");
  {
    const lib = readFileSync(SAVED_LIB, "utf8");
    assert.equal(lib.includes("prisma.$executeRaw"), false);
    assert.equal(lib.includes("CREATE TABLE"), false);
    assert.equal(lib.includes("savedListing.upsert"), true);
    console.log("  -> PASS");
  }

  console.log("[12/12] Saved route POST handler syntax...");
  {
    const mutate = readFileSync(SAVED_MUTATION_ROUTE, "utf8");
    assert.equal(mutate.includes("{ status: access.status },\n        { status:"), false);
    assert.ok(mutate.includes("return NextResponse.json({\n      ok: true,\n      data: { saved: true"));
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("ALL STAGE 5.4 PROPERTY DETAIL + SHORTLIST + DOM TESTS PASSED!");
  console.log("=================================================================");
}

void runStage54Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Stage 5.5 — Native Shortlist screen tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildShortlistListQuery,
  unwrapShortlistList,
} from "../src/lib/property-response";
import {
  clearAllWorkspaceCaches,
  shortlistListCache,
} from "../src/lib/lead-tab-cache";

const REPO_ROOT = join(__dirname, "../../..");
const SAVED_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/saved/route.ts",
);
const LOAD_CARDS = join(
  REPO_ROOT,
  "src/lib/mobile/v2/load-saved-listing-cards.ts",
);
const SHORTLIST_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/ShortlistScreen.tsx",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const DRAWER = join(REPO_ROOT, "apps/pro-mobile/src/lib/drawer-nav-items.ts");
const META = join(REPO_ROOT, "apps/pro-mobile/src/lib/more-utility-meta.ts");
const CARD = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/PropertyListingCard.tsx",
);
const HOOK = join(
  REPO_ROOT,
  "apps/pro-mobile/src/hooks/usePropertySavedListings.ts",
);
const CONSUMER_SAVED = join(
  REPO_ROOT,
  "src/app/(account)/account/saved/page.tsx",
);

async function runStage55Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.5 — NATIVE SHORTLIST TESTS");
  console.log("=================================================================\n");

  console.log("[1/12] Consumer saved homes authority...");
  {
    const page = readFileSync(CONSUMER_SAVED, "utf8");
    assert.ok(page.includes("savedListing.findMany"));
    assert.ok(page.includes("orderBy: { createdAt: \"desc\" }"));
    assert.ok(page.includes("ListingCard"));
    console.log("  -> PASS");
  }

  console.log("[2/12] Batch shortlist card loader...");
  {
    const lib = readFileSync(LOAD_CARDS, "utf8");
    assert.ok(lib.includes("prisma.savedListing.findMany"));
    assert.ok(lib.includes("prisma.listing.findMany"));
    assert.ok(lib.includes("enrichListingCardForMobile"));
    assert.ok(lib.includes("toCard"));
    assert.equal(lib.includes("getByMls"), false);
    console.log("  -> PASS");
  }

  console.log("[3/12] Saved route enrich=cards...");
  {
    const route = readFileSync(SAVED_ROUTE, "utf8");
    assert.ok(route.includes('enrich === "cards"'));
    assert.ok(route.includes("loadSavedListingCardsForUser"));
    assert.ok(route.includes("authorizeMobileWorkspaceAccess"));
    console.log("  -> PASS");
  }

  console.log("[4/12] unwrapShortlistList + buildShortlistListQuery...");
  {
    const parsed = unwrapShortlistList({
      ok: true,
      data: {
        listings: [{ mlsNumber: "W123", timingLabel: "Added 2 days ago" }],
        total: 1,
        hasMore: false,
        limit: 60,
        offset: 0,
      },
    });
    assert.equal(parsed.listings.length, 1);
    assert.equal(parsed.total, 1);
    const qs = buildShortlistListQuery({ limit: 30, offset: 0 });
    assert.ok(qs.includes("enrich=cards"));
    assert.ok(qs.includes("limit=30"));
    console.log("  -> PASS");
  }

  console.log("[5/12] ShortlistScreen + shared PropertyListingCard...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    const card = readFileSync(CARD, "utf8");
    assert.ok(screen.includes("ShortlistScreen"));
    assert.ok(screen.includes("PropertyDetailModal"));
    assert.ok(screen.includes("PropertyListingCard"));
    assert.ok(card.includes("timingLabel"));
    assert.ok(screen.includes("Browse Properties"));
    assert.ok(card.includes("ShortlistButton"));
    console.log("  -> PASS");
  }

  console.log("[6/12] Navigation wired in AgentShell...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes('activeUtility === "shortlist"'));
    assert.ok(shell.includes("ShortlistScreen"));
    console.log("  -> PASS");
  }

  console.log("[7/12] More drawer + hub entry...");
  {
    const drawer = readFileSync(DRAWER, "utf8");
    const meta = readFileSync(META, "utf8");
    assert.ok(drawer.includes('utilityId: "shortlist"'));
    assert.ok(meta.includes("shortlist:"));
    assert.ok(meta.includes("/account/saved"));
    console.log("  -> PASS");
  }

  console.log("[8/12] Cache coherence helpers...");
  {
    const hook = readFileSync(HOOK, "utf8");
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.ok(hook.includes("clearShortlistListCache"));
    assert.ok(screen.includes("shortlistListCache"));
    assert.ok(screen.includes("usePropertySavedListings"));
    clearAllWorkspaceCaches();
    shortlistListCache.set("ws1:shortlist", {
      listings: [],
      total: 0,
      hasMore: false,
      offset: 0,
      timestamp: Date.now(),
    });
    clearAllWorkspaceCaches("ws1");
    assert.equal(shortlistListCache.has("ws1:shortlist"), false);
    console.log("  -> PASS");
  }

  console.log("[9/12] No WebView / browser / new model...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.equal(screen.includes("WebView"), false);
    assert.equal(screen.includes("Linking.openURL"), false);
    assert.equal(screen.includes("MobileShortlist"), false);
    assert.equal(screen.includes("prisma."), false);
    console.log("  -> PASS");
  }

  console.log("[10/12] Multi-selection is local state only...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.ok(screen.includes("useState<Set<string>>"));
    assert.ok(screen.includes("Select all"));
    assert.equal(screen.includes("prisma"), false);
    console.log("  -> PASS");
  }

  console.log("[11/12] No fake workflow buttons...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.equal(screen.includes("Route"), false);
    assert.equal(screen.includes("CMA"), false);
    assert.equal(screen.includes("Share"), false);
    console.log("  -> PASS");
  }

  console.log("[12/12] Reuses Stage 5.4 saved mutations...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.ok(screen.includes("toggleSaved"));
    assert.ok(screen.includes("PropertyDetailModal"));
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("ALL STAGE 5.5 NATIVE SHORTLIST TESTS PASSED!");
  console.log("=================================================================");
}

void runStage55Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Stage 5.3 — Native Properties Search + Shortlist Email tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPropertiesSearchQuery,
  unwrapPropertiesSearch,
  unwrapShortlistEmail,
} from "../src/lib/property-response";
import {
  clearAllWorkspaceCaches,
  propertySearchCache,
} from "../src/lib/lead-tab-cache";
import { MAX_SHORTLIST_SIZE } from "../src/types/property";

const REPO_ROOT = join(__dirname, "../../..");
const SEARCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/search/route.ts",
);
const SHORTLIST_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/properties/shortlist-email/route.ts",
);
const SENDER_LIB = join(REPO_ROOT, "src/lib/agent/send-shortlist-email.ts");
const WEB_SHORTLIST = join(
  REPO_ROOT,
  "src/app/api/agent/shortlist-email/route.ts",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CC_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommandCentreShell.tsx",
);
const PROPERTIES_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/PropertiesSearchScreen.tsx",
);
const SHORTLIST_SHEET = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/ShortlistEmailSheet.tsx",
);
const CACHE = join(
  REPO_ROOT,
  "apps/pro-mobile/src/lib/lead-tab-cache.ts",
);

async function runStage53Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.3 — NATIVE PROPERTIES SEARCH + SHORTLIST EMAIL TESTS");
  console.log("=================================================================\n");

  console.log("[1/10] Shared sendShortlistEmail extracted...");
  {
    const lib = readFileSync(SENDER_LIB, "utf8");
    const web = readFileSync(WEB_SHORTLIST, "utf8");
    assert.ok(lib.includes("export async function sendShortlistEmail"));
    assert.ok(lib.includes('type: "shortlist_emailed"'));
    assert.ok(lib.includes("sendAndLogClientEmail"));
    assert.ok(web.includes('from "@/lib/agent/send-shortlist-email"'));
    assert.ok(web.includes("sendShortlistEmail("));
    assert.equal(web.includes("prisma.leadActivity.create"), false);
    console.log("  -> PASS");
  }

  console.log("[2/10] Mobile v2 properties search route...");
  {
    const route = readFileSync(SEARCH_ROUTE, "utf8");
    assert.ok(route.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(route.includes("getListingProvider"));
    assert.ok(route.includes("parseListingSearchQueryParams"));
    assert.ok(route.includes('listings: result.items'));
    console.log("  -> PASS");
  }

  console.log("[3/10] Mobile v2 shortlist-email route...");
  {
    const route = readFileSync(SHORTLIST_ROUTE, "utf8");
    assert.ok(route.includes("authorizeMobileLeadAccess"));
    assert.ok(route.includes("sendShortlistEmail"));
    assert.ok(route.includes(".max(24)"));
    assert.ok(route.includes("result.code"));
    console.log("  -> PASS");
  }

  console.log("[4/10] PropertiesSearchScreen + ShortlistEmailSheet exist...");
  {
    const screen = readFileSync(PROPERTIES_SCREEN, "utf8");
    const sheet = readFileSync(SHORTLIST_SHEET, "utf8");
    assert.ok(screen.includes("Email to lead"));
    assert.ok(screen.includes("ShortlistEmailSheet"));
    assert.ok(screen.includes(String(MAX_SHORTLIST_SIZE)));
    assert.ok(screen.includes("LISTING_IMAGE_LIMIT"));
    assert.ok(screen.includes("FlatList"));
    assert.ok(screen.includes("fadeDuration={0}"));
    assert.ok(sheet.includes("/properties/shortlist-email"));
    assert.ok(sheet.includes("CASL"));
    console.log("  -> PASS");
  }

  console.log("[5/10] AgentShell + CommandCentre wire PropertiesSearchScreen...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    const cc = readFileSync(CC_SHELL, "utf8");
    assert.ok(shell.includes('activeUtility === "search"'));
    assert.ok(shell.includes("PropertiesSearchScreen"));
    assert.ok(cc.includes('activeUtility === "search"'));
    assert.ok(cc.includes("PropertiesSearchScreen"));
    console.log("  -> PASS");
  }

  console.log("[6/10] Property search cache cleared on workspace switch...");
  {
    const cache = readFileSync(CACHE, "utf8");
    assert.ok(cache.includes("propertySearchCache"));
    assert.ok(cache.includes("clearPropertySearchCache"));
    propertySearchCache.set("ws_test:properties", {
      listings: [],
      queryKey: "x",
      timestamp: Date.now(),
    });
    clearAllWorkspaceCaches("ws_test");
    assert.equal(propertySearchCache.has("ws_test:properties"), false);
    console.log("  -> PASS");
  }

  console.log("[7/10] buildPropertiesSearchQuery parity...");
  {
    const qs = buildPropertiesSearchQuery({
      q: "Toronto",
      filters: {
        transactionType: "SALE",
        sort: "price_asc",
        minPrice: "500000",
        maxPrice: "",
        minBeds: "3",
        minBaths: "2",
        openHouseOnly: true,
        propertyTypes: ["DETACHED", "TOWNHOUSE"],
      },
    });
    assert.ok(qs.includes("q=Toronto"));
    assert.ok(qs.includes("transactionType=SALE"));
    assert.ok(qs.includes("sort=price_asc"));
    assert.ok(qs.includes("minPrice=500000"));
    assert.ok(qs.includes("minBeds=3"));
    assert.ok(qs.includes("openHouseOnly=1"));
    assert.ok(qs.includes("propertyTypes=DETACHED%2CTOWNHOUSE"));
    console.log("  -> PASS");
  }

  console.log("[8/10] unwrapPropertiesSearch + unwrapShortlistEmail...");
  {
    const search = unwrapPropertiesSearch({
      ok: true,
      data: {
        listings: [{ mlsNumber: "W123" }],
        total: 1,
        nextCursor: null,
        limit: 60,
      },
    });
    assert.equal(search.listings.length, 1);
    assert.equal(search.total, 1);

    const email = unwrapShortlistEmail({
      ok: true,
      data: {
        shareUrl: "https://example.com/share/homes/abc",
        count: 2,
        leadId: "lead_1",
      },
    });
    assert.ok(email?.shareUrl.includes("/share/homes/"));
    assert.equal(email?.count, 2);
    console.log("  -> PASS");
  }

  console.log("[9/10] No browser CRM / WebView in properties module...");
  {
    const screen = readFileSync(PROPERTIES_SCREEN, "utf8");
    const sheet = readFileSync(SHORTLIST_SHEET, "utf8");
    assert.equal(screen.includes("WebView"), false);
    assert.equal(screen.includes('href="/agent'), false);
    assert.equal(screen.includes("Linking.openURL"), false);
    assert.equal(sheet.includes("WebView"), false);
    console.log("  -> PASS");
  }

  console.log("[10/10] Shortlist max 24 enforced in types...");
  {
    assert.equal(MAX_SHORTLIST_SIZE, 24);
    const route = readFileSync(SHORTLIST_ROUTE, "utf8");
    assert.ok(route.includes(".max(24)"));
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("ALL STAGE 5.3 PROPERTIES SEARCH TESTS PASSED!");
  console.log("=================================================================");
}

void runStage53Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

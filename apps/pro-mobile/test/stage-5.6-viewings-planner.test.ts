/**
 * Stage 5.6 — Native Viewings Planner + public share branding tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLegacyHouzzatBrand,
  LEGACY_HOUZZAT_COLORS,
} from "../../../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../../../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../../../src/lib/tenancy/test-fixtures/tenant-b-brand";

const REPO_ROOT = join(__dirname, "../../..");
const MIGRATION = join(
  REPO_ROOT,
  "prisma/migrations/20260901200000_stage_56_viewings_planner/migration.sql",
);
const RESOLVER = join(
  REPO_ROOT,
  "src/lib/tenancy/resolve-public-viewing-share-brand.ts",
);
const PLANNER_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/viewings-planner/route.ts",
);
const OPTIMIZE_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/viewings-planner/optimize/route.ts",
);
const SAVE_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/viewings-planner/save/route.ts",
);
const SHARE_ACTIVITY_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/viewings-planner/share-activity/route.ts",
);
const PUBLIC_SHARE_PAGE = join(
  REPO_ROOT,
  "src/app/viewings/share/[token]/page.tsx",
);
const PLANNER_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/ViewingsPlannerScreen.tsx",
);
const SHORTLIST_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/ShortlistScreen.tsx",
);
const CONSUMER_SHARE_PAGE = join(
  REPO_ROOT,
  "src/app/(marketing)/route-planner/share/[token]/page.tsx",
);
const CONSUMER_SHARE_API = join(
  REPO_ROOT,
  "src/app/api/route-planner/share/route.ts",
);
const PLANNER_LIB = join(REPO_ROOT, "src/lib/mobile/v2/viewings-planner.ts");

async function runStage56Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.6 — VIEWINGS PLANNER + PUBLIC SHARE BRANDING TESTS");
  console.log("=================================================================\n");

  console.log("[1/8] Stage 5.6 migration columns...");
  {
    const sql = readFileSync(MIGRATION, "utf8");
    assert.ok(sql.includes('"leadId"'));
    assert.ok(sql.includes('"workspaceId"'));
    assert.ok(sql.includes('"agentId"'));
    assert.ok(sql.includes('"viewingDate"'));
    assert.ok(sql.includes('"appointmentId"'));
    console.log("  -> PASS");
  }

  console.log("[2/8] resolvePublicViewingShareBrand bypasses legacy scope...");
  {
    const resolver = readFileSync(RESOLVER, "utf8");
    assert.ok(resolver.includes("resolvePublicViewingShareBrand"));
    assert.ok(resolver.includes("workspaceBrandingRowToBrand"));
    assert.ok(resolver.includes("buildLegacyHouzzatBrand"));
    assert.equal(resolver.includes("isTenantBrandingScopeWorkspace"), false);
    assert.equal(resolver.includes("resolveWorkspaceBrand"), false);
    assert.ok(
      resolver.includes("query parameters") ||
        resolver.includes("query params") ||
        resolver.includes("Never uses hostname"),
    );
    console.log("  -> PASS");
  }

  console.log("[3/8] Mobile v2 viewings-planner API routes...");
  {
    const main = readFileSync(PLANNER_ROUTE, "utf8");
    const optimize = readFileSync(OPTIMIZE_ROUTE, "utf8");
    const save = readFileSync(SAVE_ROUTE, "utf8");
    const shareActivity = readFileSync(SHARE_ACTIVITY_ROUTE, "utf8");

    assert.ok(main.includes("authorizeMobileLeadAccess"));
    assert.ok(main.includes("getOrCreateProDraftTour"));
    assert.ok(optimize.includes("optimizeProTour"));
    assert.ok(save.includes("saveProViewingsPlan"));
    assert.ok(shareActivity.includes("logViewingShareActivity"));
    assert.ok(shareActivity.includes("channel"));
    console.log("  -> PASS");
  }

  console.log("[4/8] Public viewings share page uses workspace brand resolver...");
  {
    const page = readFileSync(PUBLIC_SHARE_PAGE, "utf8");
    assert.ok(page.includes("resolvePublicViewingShareBrand"));
    assert.ok(page.includes("serializeProViewingsPlannerPayload"));
    assert.ok(page.includes("ViewingShareClient"));
    assert.ok(page.includes("buildTenantThemeCss"));
    assert.equal(page.includes("searchParams"), false);
    console.log("  -> PASS");
  }

  console.log("[5/8] ViewingsPlannerScreen affordances...");
  {
    const screen = readFileSync(PLANNER_SCREEN, "utf8");
    assert.ok(screen.includes("ViewingsPlannerScreen"));
    assert.ok(screen.includes("Viewings Planner"));
    assert.ok(screen.includes("Save Viewings"));
    assert.ok(screen.includes("Share with Client"));
    assert.equal(screen.includes("WebView"), false);
    assert.equal(screen.includes("prisma."), false);
    console.log("  -> PASS");
  }

  console.log("[6/8] ShortlistScreen Plan Viewings entry...");
  {
    const screen = readFileSync(SHORTLIST_SCREEN, "utf8");
    assert.ok(screen.includes("Plan Viewings"));
    console.log("  -> PASS");
  }

  console.log("[7/8] Consumer /route-planner/share unchanged...");
  {
    const page = readFileSync(CONSUMER_SHARE_PAGE, "utf8");
    const api = readFileSync(CONSUMER_SHARE_API, "utf8");
    assert.ok(page.includes("RoutePlannerClient"));
    assert.ok(page.includes("serializeTour"));
    assert.equal(page.includes("resolvePublicViewingShareBrand"), false);
    assert.equal(page.includes("serializeProViewingsPlannerPayload"), false);
    assert.ok(api.includes("requireFullCustomerUser"));
    assert.ok(api.includes("getOrCreateActiveTour"));
    assert.ok(api.includes("/route-planner/share/"));
    assert.equal(api.includes("viewings-planner"), false);
    console.log("  -> PASS");
  }

  console.log("[8/8] Tenant Canary vs Houzzat brand isolation...");
  {
    const canary = workspaceBrandingRowToBrand(
      TENANT_B_TEST_WORKSPACE_ID,
      TENANT_B_TEST_BRANDING_ROW,
    );
    const houzzat = buildLegacyHouzzatBrand("ws_houzzat_fixture");

    assert.equal(canary.displayName, TENANT_B_TEST_DISPLAY_NAME);
    assert.equal(canary.displayName, "Tenant Canary");
    assert.equal(canary.colors.primary.toUpperCase(), TENANT_B_TEST_PRIMARY_COLOR);
    assert.equal(canary.colors.primary.toUpperCase(), "#2563EB");

    assert.notEqual(houzzat.displayName, "Tenant Canary");
    assert.equal(
      houzzat.colors.primary.toUpperCase(),
      LEGACY_HOUZZAT_COLORS.primary.toUpperCase(),
    );
    assert.equal(houzzat.colors.primary.toUpperCase(), "#0F6B4C");
    assert.notEqual(houzzat.colors.primary, canary.colors.primary);

    const lib = readFileSync(PLANNER_LIB, "utf8");
    assert.ok(lib.includes("resolvePublicViewingShareBrand"));
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("ALL STAGE 5.6 VIEWINGS PLANNER TESTS PASSED!");
  console.log("=================================================================");
}

void runStage56Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Stage 5.12A — Advanced CMA foundation tests (no live DB required).
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

function run() {
  console.log("\n=== STAGE 5.12A — ADVANCED CMA FOUNDATION ===\n");

  console.log("[1] Migration + schema workspaceId nullable...");
  {
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model CmaReport ");
    const block = schema.slice(start, start + 2500);
    assert.match(block, /workspaceId\s+String\?/);
    assert.match(block, /leadId\s+String\?/);
    assert.ok(block.includes("selectedComps"));
    assert.ok(block.includes("subjectSnapshot"));
    assert.ok(block.includes("revokedAt"));
    assert.ok(block.includes("@updatedAt"));
    const mig = join(
      REPO,
      "prisma/migrations/20260902140000_stage_512a_advanced_cma/migration.sql",
    );
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, "utf8");
    assert.ok(sql.includes('ADD COLUMN "workspaceId" TEXT'));
    assert.equal(/\bSET NOT NULL\b/.test(sql), false);
    console.log("  -> PASS");
  }

  console.log("[2] Ownership selftest allows CmaReport.workspaceId...");
  {
    const selftest = read("scripts/workspace-ownership-schema-selftest.ts");
    assert.ok(selftest.includes("testCmaReportHasNullableWorkspaceId"));
    const deferredStart = selftest.indexOf(
      "function testDeferredModelsHaveNoWorkspaceId",
    );
    const deferredEnd = selftest.indexOf(
      "function testCmaReportHasNullableWorkspaceId",
    );
    const deferred = selftest.slice(deferredStart, deferredEnd);
    assert.equal(deferred.includes('"CmaReport"'), false);
    console.log("  -> PASS");
  }

  console.log("[3] Zod / engine / PDF modules present...");
  {
    assert.ok(read("src/lib/cma/schema.ts").includes("CMA_JSON_VERSION"));
    assert.ok(
      read("src/lib/cma/schema.ts").includes("z.literal(CMA_JSON_VERSION)"),
    );
    const engine = read("src/lib/cma/engine.ts");
    assert.ok(engine.includes("findAdvancedComps"));
    assert.ok(engine.includes("analyzeSelectedComps"));
    assert.ok(engine.includes('role === "SOLD"'));
    assert.ok(engine.includes("LIMITED COMPARABLE INVENTORY"));
    assert.ok(engine.includes("flagOutliers"));
    assert.ok(engine.includes("dedupeByCivicSold"));
    assert.equal(engine.includes("subject.listPrice"), false);
    assert.ok(read("src/lib/cma/config.ts").includes("passes"));
    assert.ok(read("src/lib/cma/pdf.ts").includes("generateCmaPdfForReport"));
    assert.ok(
      read("src/lib/cma/browser-rendering-pdf.ts").includes("browser-rendering/pdf"),
    );
    console.log("  -> PASS");
  }

  console.log("[4] Sold vs active separation in engine...");
  {
    const engine = read("src/lib/cma/engine.ts");
    assert.ok(engine.includes("soldCompCount"));
    assert.ok(engine.includes("activeCompCount"));
    assert.ok(engine.includes("weightedPool"));
    console.log("  -> PASS");
  }

  console.log("[5] Engine config + widen stages...");
  {
    const cfg = read("src/lib/cma/config.ts");
    assert.ok(cfg.includes("maxKm: 1.5"));
    assert.ok(cfg.includes("maxKm: 3"));
    assert.ok(cfg.includes("maxKm: 8"));
    assert.ok(cfg.includes("candidatePoolMax: 200"));
    console.log("  -> PASS");
  }

  console.log("[6] Mobile v2 CMA routes + auth patterns...");
  {
    const list = read("src/app/api/mobile/v2/cma/route.ts");
    const one = read("src/app/api/mobile/v2/cma/[id]/route.ts");
    const email = read("src/app/api/mobile/v2/cma/[id]/email/route.ts");
    assert.ok(list.includes("authorizeMobileCmaWorkspace"));
    assert.ok(list.includes("workspaceId: access.workspaceId"));
    assert.ok(list.includes("workspaceId/userId not accepted"));
    assert.ok(one.includes("findWorkspaceCma"));
    assert.ok(email.includes("sendCmaEmailToLead"));
    assert.ok(
      existsSync(
        join(REPO, "src/app/api/mobile/v2/cma/[id]/find-comps/route.ts"),
      ),
    );
    console.log("  -> PASS");
  }

  console.log("[7] Email CMA + no LeadEmailLog FK...");
  {
    const send = read("src/lib/cma/send-cma-email.ts");
    assert.ok(send.includes("sendAndLogClientEmail"));
    assert.ok(send.includes("renderCmaEmail"));
    assert.ok(send.includes("contactConsentAt"));
    assert.ok(send.includes("cma_emailed"));
    assert.ok(send.includes("No LeadEmailLog.cmaReportId FK") || !/\bcmaReportId\s*:/.test(send));
    const schema = read("prisma/schema.prisma");
    const emailLog = schema.slice(
      schema.indexOf("model LeadEmailLog"),
      schema.indexOf("model LeadEmailLog") + 1200,
    );
    assert.equal(emailLog.includes("cmaReportId"), false);
    assert.ok(read("src/lib/email/templates.ts").includes("renderCmaEmail"));
    console.log("  -> PASS");
  }

  console.log("[8] Public CMA revoked + tenant branding...");
  {
    const page = read("src/app/(marketing)/cma/[token]/page.tsx");
    assert.ok(page.includes("revokedAt"));
    assert.ok(page.includes("resolveWorkspaceBrand"));
    assert.ok(
      page.includes("Powered by HouzzatPRO") || page.includes("platformCredit"),
    );
    assert.ok(
      page.includes("not a formal appraisal") || page.includes("disclaimer"),
    );
    assert.ok(page.includes("buildCmaPresentationDto"));
    console.log("  -> PASS");
  }

  console.log("[9] Native CMA screen wired...");
  {
    assert.ok(
      existsSync(join(REPO, "apps/pro-mobile/src/screens/CmaScreen.tsx")),
    );
    const agent = read("apps/pro-mobile/src/screens/AgentShell.tsx");
    assert.ok(agent.includes("CmaScreen"));
    assert.ok(agent.includes('activeUtility === "cma"'));
    const meta = read("apps/pro-mobile/src/lib/more-utility-meta.ts");
    assert.ok(meta.includes("Advanced comparative market analysis"));
    console.log("  -> PASS");
  }

  console.log("[10] PDF deferred → 5.12B Browser Rendering...");
  {
    const pdf = read("src/lib/cma/pdf.ts");
    assert.ok(pdf.includes("generateCmaPdfForReport"));
    assert.ok(pdf.includes("Browser Rendering"));
    assert.ok(read("src/lib/cma/browser-rendering-pdf.ts").includes("browser-rendering/pdf"));
    console.log("  -> PASS");
  }

  console.log("[11] Legacy backfill rule...");
  {
    const bf = read("src/lib/cma/legacy-backfill.ts");
    assert.ok(bf.includes("exactly one ACTIVE WorkspaceMember"));
    assert.ok(bf.includes("leave NULL"));
    assert.ok(bf.includes("Never invent") || bf.includes("otherwise leave NULL"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.12A — ALL TESTS PASSED\n");
}

run();

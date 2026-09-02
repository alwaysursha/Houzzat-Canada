/**
 * Stage 5.12B — CMA PDF static contract tests (no @/ imports for pro-mobile tsc).
 * Runtime coverage: scripts/stage-512b-cma-pdf-selftest.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

function run() {
  console.log("\n=== STAGE 5.12B — CMA PDF (BROWSER RENDERING) ===\n");

  console.log("[1] Modules + route exist; no Prisma PDF fields...");
  {
    assert.ok(existsSync(join(REPO, "src/lib/cma/presentation.ts")));
    assert.ok(existsSync(join(REPO, "src/lib/cma/print-html.ts")));
    assert.ok(existsSync(join(REPO, "src/lib/cma/browser-rendering-pdf.ts")));
    assert.ok(existsSync(join(REPO, "src/lib/cma/filename.ts")));
    assert.ok(
      existsSync(join(REPO, "src/app/api/mobile/v2/cma/[id]/pdf/route.ts")),
    );
    assert.ok(
      existsSync(join(REPO, "scripts/stage-512b-cma-pdf-selftest.ts")),
    );
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model CmaReport ");
    const block = schema.slice(start, start + 2500);
    assert.equal(block.includes("pdfUrl"), false);
    assert.equal(block.includes("pdfBlob"), false);
    assert.equal(block.includes("pdfStatus"), false);
    console.log("  -> PASS");
  }

  console.log("[2] Filename + presentation + print HTML contracts...");
  {
    assert.ok(read("src/lib/cma/filename.ts").includes("sanitizeCmaPdfFilename"));
    assert.ok(read("src/lib/cma/filename.ts").includes("CMA-"));
    const presentation = read("src/lib/cma/presentation.ts");
    assert.ok(presentation.includes("buildCmaPresentationDto"));
    assert.ok(presentation.includes("hasSavedCmaPresentationEvidence"));
    assert.ok(presentation.includes("competitionComps"));
    assert.ok(presentation.includes("Powered by HouzzatPRO") || presentation.includes("platformCredit"));
    assert.equal(presentation.includes("findAdvancedComps"), false);
    const print = read("src/lib/cma/print-html.ts");
    assert.ok(print.includes("size: Letter"));
    assert.ok(print.includes("Current market competition"));
    assert.ok(print.includes("Photo unavailable"));
    assert.ok(print.includes("break-inside"));
    console.log("  -> PASS");
  }

  console.log("[3] Browser Rendering client + PDF orchestrator...");
  {
    const br = read("src/lib/cma/browser-rendering-pdf.ts");
    assert.ok(br.includes("browser-rendering/pdf"));
    assert.ok(br.includes("CLOUDFLARE_ACCOUNT_ID"));
    assert.ok(br.includes("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"));
    assert.ok(br.includes("__cmaBrowserRenderingPdfMock"));
    assert.ok(br.includes("printBackground"));
    const pdf = read("src/lib/cma/pdf.ts");
    assert.ok(pdf.includes("generateCmaPdfForReport"));
    assert.ok(pdf.includes("resolveWorkspaceBrand"));
    assert.ok(pdf.includes("renderCmaPrintHtml"));
    assert.ok(pdf.includes("hasSavedCmaPresentationEvidence"));
    assert.equal(pdf.includes("findAdvancedComps"), false);
    assert.equal(pdf.includes("findComps"), false);
    console.log("  -> PASS");
  }

  console.log("[4] Auth route — application/pdf, no public PDF...");
  {
    const route = read("src/app/api/mobile/v2/cma/[id]/pdf/route.ts");
    assert.ok(route.includes("authorizeMobileCmaWorkspace"));
    assert.ok(route.includes("findWorkspaceCma"));
    assert.ok(route.includes("canAccessCmaInWorkspace"));
    assert.ok(route.includes("generateCmaPdfForReport"));
    assert.ok(route.includes("application/pdf"));
    assert.ok(route.includes("Content-Disposition"));
    assert.equal(/request\.json\(\)/.test(route), false);
    assert.equal(
      existsSync(join(REPO, "src/app/(marketing)/cma/[token]/pdf")),
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[5] Public page shared DTO; revoked 404...");
  {
    const page = read("src/app/(marketing)/cma/[token]/page.tsx");
    assert.ok(page.includes("buildCmaPresentationDto"));
    assert.ok(page.includes("revokedAt"));
    assert.ok(page.includes("notFound()"));
    assert.ok(page.includes("Current market competition"));
    console.log("  -> PASS");
  }

  console.log("[6] Native Download/Share PDF...");
  {
    const native = read("apps/pro-mobile/src/screens/CmaScreen.tsx");
    assert.equal(native.includes("CLOUDFLARE_"), false);
    assert.ok(native.includes("Download PDF"));
    assert.ok(native.includes("Share PDF"));
    assert.ok(native.includes("Preparing PDF"));
    assert.ok(native.includes("pdfInFlight"));
    assert.ok(read("apps/pro-mobile/src/api/client.ts").includes("getPdf"));
    assert.ok(
      existsSync(
        join(
          REPO,
          "apps/pro-mobile/android/app/src/main/java/com/houzzat/pro/PdfShareModule.kt",
        ),
      ),
    );
    const manifest = read(
      "apps/pro-mobile/android/app/src/main/AndroidManifest.xml",
    );
    assert.ok(manifest.includes("fileprovider"));
    assert.ok(
      read(
        "apps/pro-mobile/android/app/src/main/java/com/houzzat/pro/MainApplication.kt",
      ).includes("PdfSharePackage"),
    );
    console.log("  -> PASS");
  }

  console.log("[7] Wrangler documents Browser Rendering (no secrets)...");
  {
    const wrangler = read("wrangler.jsonc");
    assert.ok(wrangler.includes("Browser Rendering"));
    assert.ok(wrangler.includes("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"));
    assert.equal(wrangler.includes("Bearer "), false);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.12B — ALL TESTS PASSED\n");
}

run();

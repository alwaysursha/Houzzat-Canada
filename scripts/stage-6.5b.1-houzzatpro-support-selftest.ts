/**
 * Stage 6.5B.1 — HouzzatPRO support destination selftest.
 * Run: node --import tsx scripts/stage-6.5b.1-houzzatpro-support-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOUZZATPRO_TECHNICAL_SUPPORT_LABEL,
  HOUZZATPRO_TECHNICAL_SUPPORT_URL,
  resolveHouzzatProSupportCta,
} from "../src/lib/platform";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.5B.1 — HOUZZATPRO SUPPORT DESTINATION ===\n");

  // 1. Canonical support URL + label
  {
    const cta = resolveHouzzatProSupportCta();
    assert.equal(cta.href, HOUZZATPRO_TECHNICAL_SUPPORT_URL);
    assert.equal(cta.label, HOUZZATPRO_TECHNICAL_SUPPORT_LABEL);
    assert.equal(cta.href, "https://houzzatpro.com/support");
    console.log("[1] Canonical support CTA configured... PASS");
  }

  // 2. Suspended page wires CTA href
  {
    const suspended = read("src/components/platform/status/PlatformSuspendedPage.tsx");
    assert.ok(suspended.includes("supportCta.href"));
    assert.ok(suspended.includes("resolveHouzzatProSupportCta"));
    assert.ok(!suspended.includes("mailto:"));
    assert.ok(!suspended.includes("tel:"));
    console.log("[2] Suspended page CTA wired to support destination... PASS");
  }

  // 3. Support route + page exist
  {
    assert.ok(read("src/app/(marketing)/support/page.tsx").includes("HouzzatProSupportPage"));
    const supportPage = read("src/components/platform/status/HouzzatProSupportPage.tsx");
    assert.ok(supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_TITLE"));
    assert.ok(supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_EMAIL_LABEL"));
    assert.ok(supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_EMAIL_HREF"));
    assert.ok(supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_RESPONSE_TIME"));
    assert.ok(!supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_PENDING_CONTACT"));
    assert.ok(!supportPage.includes("being configured"));
    assert.ok(!supportPage.includes("<form"));
    assert.ok(!supportPage.includes("tel:"));
    console.log("[3] Minimal /support landing page present... PASS");
  }

  // 4. Marketing layout bypasses tenant chrome on platform-root /support
  {
    const layout = read("src/app/(marketing)/layout.tsx");
    assert.ok(layout.includes("isHouzzatProPlatformSupportRequest"));
    console.log("[4] Marketing layout gates platform /support... PASS");
  }

  // 5. Platform support request is hostname-bound
  {
    const gate = read("src/lib/platform/status/platform-support-request.ts");
    assert.ok(gate.includes("isHouzzatProPlatformRoot"));
    assert.ok(gate.includes('path !== SUPPORT_PATH'));
    console.log("[5] /support limited to HouzzatPRO platform root host... PASS");
  }

  // 6. Coming soon bypass for /support
  {
    assert.ok(read("src/middleware.ts").includes('pathname === "/support"'));
    console.log("[6] Middleware coming-soon bypass for /support... PASS");
  }

  // 7. Production support email is the approved mailto, no phone/form
  {
    const copy = read("src/lib/platform/status/support-copy.ts");
    assert.ok(copy.includes('export const HOUZZATPRO_SUPPORT_PAGE_EMAIL = "support@houzzatpro.com"'));
    assert.ok(copy.includes("mailto:${HOUZZATPRO_SUPPORT_PAGE_EMAIL}"));
    assert.ok(copy.includes("We typically respond within one business day."));
    assert.ok(!copy.includes("being configured"));
    assert.ok(!/\(\d{3}\)/.test(copy));
    const supportPage = read("src/components/platform/status/HouzzatProSupportPage.tsx");
    assert.ok(supportPage.includes("HOUZZATPRO_SUPPORT_PAGE_EMAIL_HREF"));
    console.log("[7] Support page uses approved email mailto... PASS");
  }

  console.log("\nSTAGE 6.5B.1 — ALL TESTS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Lead Profile V2 reversible LeadQuickPopup switch selftest.
 * Run: node --import tsx scripts/lead-profile-v2-popup-switch-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testSwitchDefaultOnMountsV2() {
  const popup = read("src/components/agent/LeadQuickPopup.tsx");
  assert.ok(popup.includes("const USE_LEAD_PROFILE_V2 = true"));
  assert.ok(popup.includes("USE_LEAD_PROFILE_V2 ?"));
  assert.ok(popup.includes("<LeadProfileV2Host"));
  assert.ok(popup.includes("<CustomerProfile"));
  assert.ok(popup.includes('from "@/components/agent/CustomerProfile"'));
  assert.ok(
    popup.includes(
      'from "@/components/agent/lead-profile-v2/LeadProfileV2Host"',
    ),
  );
}

function testFalseRestoresLegacy() {
  const popup = read("src/components/agent/LeadQuickPopup.tsx");
  const trueDecl = "const USE_LEAD_PROFILE_V2 = true";
  const falseDecl = "const USE_LEAD_PROFILE_V2 = false";
  assert.ok(popup.includes(trueDecl));
  assert.equal(popup.includes(falseDecl), false);
  const reverted = popup.replace(trueDecl, falseDecl);
  assert.ok(reverted.includes(falseDecl));
  assert.equal(reverted.includes(trueDecl), false);
  const v2Mount = popup.split("<LeadProfileV2Host")[1]?.split("/>")[0] ?? "";
  const legacyMount = popup.split("<CustomerProfile")[1]?.split("/>")[0] ?? "";
  assert.ok(popup.includes("USE_LEAD_PROFILE_V2 ?"));
  assert.ok(v2Mount.includes("leadId={leadId}"));
  assert.ok(legacyMount.includes("leadId={leadId}"));
  assert.ok(legacyMount.includes('variant="modal"'));
  assert.ok(legacyMount.includes("leadIds={leadIds}"));
  assert.ok(legacyMount.includes("onClose={onClose}"));
  assert.ok(legacyMount.includes("onNavigateLead={onNavigate}"));
}

function testPopupStillOwnsClose() {
  const popup = read("src/components/agent/LeadQuickPopup.tsx");
  assert.ok(popup.includes('if (e.key === "Escape") onClose()'));
  assert.ok(popup.includes('aria-label="Close customer profile"'));
  assert.ok(popup.includes("onClick={onClose}"));
  assert.ok(popup.includes("data-staff-overlay"));
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(host.includes("Escape"), false);
  assert.equal(host.includes("backdrop"), false);
  assert.equal(host.includes("fixed inset-0"), false);
}

function testPrevNextPropsReachV2() {
  const popup = read("src/components/agent/LeadQuickPopup.tsx");
  const v2Mount = popup.split("<LeadProfileV2Host")[1]?.split("/>")[0] ?? "";
  assert.ok(v2Mount.includes("leadId={leadId}"));
  assert.ok(v2Mount.includes('variant="modal"'));
  assert.ok(v2Mount.includes("leadIds={leadIds}"));
  assert.ok(v2Mount.includes("onClose={onClose}"));
  assert.ok(v2Mount.includes("onNavigateLead={onNavigate}"));
  assert.ok(popup.includes('if (e.key === "ArrowLeft"'));
  assert.ok(popup.includes('if (e.key === "ArrowRight"'));
}

function testLegacyUntouchedAndNoCircular() {
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  assert.equal(legacy.includes("lead-profile-v2"), false);
  assert.equal(legacy.includes("leads-v2"), false);
  assert.equal(legacy.includes("LeadQuickPopup"), false);
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(host.includes("LeadQuickPopup"), false);
  assert.equal(host.includes("CustomerProfile"), false);
}

function testNoSchemaOrEnvFlag() {
  const popup = read("src/components/agent/LeadQuickPopup.tsx");
  assert.equal(popup.includes("process.env"), false);
  assert.equal(popup.includes("prisma"), false);
  assert.equal(popup.includes("USE_LEAD_PROFILE_V2 = true"), true);
}

testSwitchDefaultOnMountsV2();
testFalseRestoresLegacy();
testPopupStillOwnsClose();
testPrevNextPropsReachV2();
testLegacyUntouchedAndNoCircular();
testNoSchemaOrEnvFlag();

console.log("lead-profile-v2-popup-switch-selftest: ok");

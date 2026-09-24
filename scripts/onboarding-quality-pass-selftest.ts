/**
 * Onboarding quality pass — continuity prefill, locks, logout/sign-in guards.
 * Run: pnpm exec tsx scripts/onboarding-quality-pass-selftest.ts
 *
 * Pure logic + source guards. No production DB writes / no deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyOnboardingContinuityPrefill,
  emptyOnboardingContinuityLocks,
} from "@/lib/platform/activation/onboarding-continuity";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function emptyIdentity() {
  return {
    agentRegisteredName: null as string | null,
    agentDesignation: null as string | null,
    agentCellPhone: null as string | null,
    recoLicenseNumber: null as string | null,
    recoLicenseExpiresAt: null as string | null,
    brokerageRegisteredName: null as string | null,
    brokerageFax: null as string | null,
    brokeragePhone: null as string | null,
    brokerageAddress: null as string | null,
  };
}

function testContinuityPrefillAndLocks() {
  const fromSales = applyOnboardingContinuityPrefill({
    professionalIdentity: emptyIdentity(),
    contactEmail: null,
    sources: {
      prospectContactName: "Maria Khalid",
      prospectPhone: "437-677-4949",
      prospectBrokerageName: "HomeLife Landmark",
      prospectEmail: "maria@example.com",
      acceptedEmail: "maria@example.com",
      userName: "Maria Khalid",
      userPhone: "437-677-4949",
      workspaceBrokerageAffiliation: "HomeLife Landmark",
    },
  });
  assert.equal(fromSales.professionalIdentity.agentRegisteredName, "Maria Khalid");
  assert.equal(fromSales.professionalIdentity.agentCellPhone, "437-677-4949");
  assert.equal(
    fromSales.professionalIdentity.brokerageRegisteredName,
    "HomeLife Landmark",
  );
  assert.equal(fromSales.contactEmail, "maria@example.com");
  assert.equal(fromSales.locks.agentRegisteredName, true);
  assert.equal(fromSales.locks.agentCellPhone, true);
  assert.equal(fromSales.locks.brokerageRegisteredName, true);
  assert.equal(fromSales.locks.contactEmail, true);

  // Existing customer-entered values are NOT overwritten.
  const preserved = applyOnboardingContinuityPrefill({
    professionalIdentity: {
      ...emptyIdentity(),
      agentRegisteredName: "Custom Agent Name",
      agentCellPhone: "416-555-0100",
      brokerageRegisteredName: "Custom Brokerage",
    },
    contactEmail: "owner@custom.test",
    sources: {
      prospectContactName: "Maria Khalid",
      prospectPhone: "437-677-4949",
      prospectBrokerageName: "HomeLife Landmark",
      prospectEmail: "maria@example.com",
      acceptedEmail: "maria@example.com",
      userName: "Maria Khalid",
      userPhone: "437-677-4949",
      workspaceBrokerageAffiliation: "HomeLife Landmark",
    },
  });
  assert.equal(
    preserved.professionalIdentity.agentRegisteredName,
    "Custom Agent Name",
  );
  assert.equal(preserved.professionalIdentity.agentCellPhone, "416-555-0100");
  assert.equal(
    preserved.professionalIdentity.brokerageRegisteredName,
    "Custom Brokerage",
  );
  assert.equal(preserved.contactEmail, "owner@custom.test");

  // Empty sales sources → no locks, fields stay empty (validation still required in UI).
  const empty = applyOnboardingContinuityPrefill({
    professionalIdentity: emptyIdentity(),
    contactEmail: null,
    sources: {
      prospectContactName: null,
      prospectPhone: null,
      prospectBrokerageName: null,
      prospectEmail: null,
      acceptedEmail: null,
      userName: null,
      userPhone: null,
      workspaceBrokerageAffiliation: null,
    },
  });
  assert.deepEqual(empty.locks, emptyOnboardingContinuityLocks());
  assert.equal(empty.professionalIdentity.agentRegisteredName, null);
  assert.equal(empty.professionalIdentity.agentCellPhone, null);

  console.log("[continuity] prefill + no-overwrite + locks... PASS");
}

function testSourceGuards() {
  const shell = read("src/components/platform/PlatformShell.tsx");
  const mobile = read("src/components/platform/PlatformMobileNav.tsx");
  const signOutBtn = read("src/components/platform/PlatformSignOutButton.tsx");
  const controller = read("src/lib/mobile/pro-native-auth-controller.ts");
  const signInForm = read("src/components/auth/HouzzatProSignInForm.tsx");
  const ownerClient = read("src/components/onboarding/OwnerOnboardingClient.tsx");
  const identitySection = read(
    "src/components/onboarding/ProfessionalIdentitySection.tsx",
  );
  const onboardingLib = read("src/lib/platform/activation/onboarding.ts");

  assert.ok(signOutBtn.includes("performHardSignOut"));
  assert.ok(signOutBtn.includes("HOUZZATPRO_APP_BOOTSTRAP_ORIGIN"));
  assert.ok(shell.includes("PlatformSignOutButton"));
  assert.ok(!shell.includes('/auth/sign-out'));
  assert.ok(mobile.includes("PlatformSignOutButton"));
  assert.ok(!mobile.includes('/auth/sign-out'));

  assert.ok(controller.includes('kind === "no_workspace"'));
  assert.ok(controller.includes('hardGo("/platform")'));
  assert.ok(controller.includes("No active workspace membership found."));
  assert.ok(signInForm.includes("setPending(false)"));
  assert.ok(signInForm.includes("4_000"));

  assert.ok(onboardingLib.includes("applyOnboardingContinuityPrefill"));
  assert.ok(onboardingLib.includes("identityLocks"));
  assert.ok(identitySection.includes("lockAgentName"));
  assert.ok(identitySection.includes("lockAgentCell"));
  assert.ok(identitySection.includes("lockBrokerageName"));
  assert.ok(ownerClient.includes("identityLocks.contactEmail"));
  assert.ok(ownerClient.includes("Enter HouzzatPRO"));
  assert.ok(ownerClient.includes("designJustSaved"));
  assert.ok(ownerClient.includes("Your website setup has been saved"));

  console.log("[source] logout + sign-in + continuity + completion... PASS");
}

function main() {
  console.log("\n=== ONBOARDING QUALITY PASS SELFTEST ===\n");
  testContinuityPrefillAndLocks();
  testSourceGuards();
  console.log("\n[onboarding-quality-pass] ALL PASS\n");
}

main();

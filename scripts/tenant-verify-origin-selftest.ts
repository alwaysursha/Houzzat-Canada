/**
 * Tenant-safe email verification origin (Issue 1).
 *
 * Pure helpers + source guards — no DB writes, no production data.
 *
 * Run: pnpm tenant-verify-origin:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationLink } from "../src/lib/auth/email-verification";
import { safeInternalCallbackUrl } from "../src/lib/auth/safe-callback-url";
import {
  normalizeIdentityEmail,
  parseTenantBoundTokenIdentifier,
  tenantBoundTokenIdentifier,
} from "../src/lib/auth/workspace-identity";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Fixture IDs — do not hardcode Maria's live houzzatpro host in product code. */
const HOUZZAT_WS = "ws_houzzat_fixture";
const MARIA_WS = "ws_maria_fixture";
const SHARED_EMAIL = "omsyed88@gmail.com";

const HOUZZAT_ORIGIN = "https://houzzat.com";
const MARIA_ORIGIN =
  "https://homelife-miracle-realty-ltd.houzzatpro.com";
const MARIA_CUSTOM_ORIGIN = "https://www.miraclehomes.example";

function testHouzzatSignupUsesHouzzatOrigin() {
  const url = verificationLink("tok_houzzat", "/", HOUZZAT_ORIGIN);
  assert.equal(
    new URL(url).origin,
    HOUZZAT_ORIGIN,
    "Houzzat signup must verify on Houzzat origin",
  );
  assert.ok(url.includes("/auth/verify-email"));
  console.log("[verify-origin] Houzzat signup → Houzzat origin... PASS");
}

function testMariaSignupUsesMariaTenantOrigin() {
  const url = verificationLink("tok_maria", "/", MARIA_ORIGIN);
  assert.equal(new URL(url).origin, MARIA_ORIGIN);
  assert.equal(
    new URL(url).hostname,
    "homelife-miracle-realty-ltd.houzzatpro.com",
  );
  assert.notEqual(new URL(url).hostname, "houzzat.com");
  console.log("[verify-origin] Maria signup → Maria tenant origin... PASS");
}

function testMariaResendUsesMariaTenantOrigin() {
  // Resend uses the same verificationLink(origin) path as signup.
  const url = verificationLink("tok_maria_resend", "/account", MARIA_ORIGIN);
  assert.equal(new URL(url).origin, MARIA_ORIGIN);
  assert.equal(new URL(url).searchParams.get("callbackUrl"), "/account");
  console.log("[verify-origin] Maria resend → Maria tenant origin... PASS");
}

function testCustomDomainCompatibleOriginResolution() {
  const url = verificationLink("tok_custom", "/", MARIA_CUSTOM_ORIGIN);
  assert.equal(
    new URL(url).origin,
    MARIA_CUSTOM_ORIGIN,
    "origin must come from tenancy/request — not a hardcoded Maria subdomain",
  );
  console.log(
    "[verify-origin] custom-domain-compatible origin resolution... PASS",
  );
}

function testSameEmailIndependentlyVerifiable() {
  const idH = tenantBoundTokenIdentifier(
    "email-verify",
    HOUZZAT_WS,
    SHARED_EMAIL,
  );
  const idM = tenantBoundTokenIdentifier("email-verify", MARIA_WS, SHARED_EMAIL);
  assert.notEqual(idH, idM);
  assert.equal(
    idH,
    `email-verify:ws:${HOUZZAT_WS}:${normalizeIdentityEmail(SHARED_EMAIL)}`,
  );
  assert.equal(
    idM,
    `email-verify:ws:${MARIA_WS}:${normalizeIdentityEmail(SHARED_EMAIL)}`,
  );

  const parsedH = parseTenantBoundTokenIdentifier("email-verify", idH);
  const parsedM = parseTenantBoundTokenIdentifier("email-verify", idM);
  assert.equal(parsedH?.workspaceId, HOUZZAT_WS);
  assert.equal(parsedM?.workspaceId, MARIA_WS);
  assert.equal(parsedH?.email, parsedM?.email);
  console.log(
    "[verify-origin] same email independently verifiable per workspace... PASS",
  );
}

function testCrossWorkspaceTokenCannotResolveWrongUser() {
  const mariaTokenId = tenantBoundTokenIdentifier(
    "email-verify",
    MARIA_WS,
    SHARED_EMAIL,
  );
  const houzzatTokenId = tenantBoundTokenIdentifier(
    "email-verify",
    HOUZZAT_WS,
    SHARED_EMAIL,
  );

  const mariaParsed = parseTenantBoundTokenIdentifier(
    "email-verify",
    mariaTokenId,
  );
  const houzzatParsed = parseTenantBoundTokenIdentifier(
    "email-verify",
    houzzatTokenId,
  );

  // Maria verification cannot resolve Houzzat User (workspaceId mismatch by design)
  assert.notEqual(mariaParsed?.workspaceId, HOUZZAT_WS);
  assert.equal(mariaParsed?.workspaceId, MARIA_WS);

  // Houzzat verification cannot resolve Maria User
  assert.notEqual(houzzatParsed?.workspaceId, MARIA_WS);
  assert.equal(houzzatParsed?.workspaceId, HOUZZAT_WS);

  // Legacy / global email identifier must not parse as tenant-bound
  assert.equal(
    parseTenantBoundTokenIdentifier("email-verify", `email-verify:${SHARED_EMAIL}`),
    null,
    "no global-email fallback identifier",
  );
  assert.equal(
    parseTenantBoundTokenIdentifier("email-verify", SHARED_EMAIL),
    null,
  );
  console.log(
    "[verify-origin] cross-workspace + no global-email fallback... PASS",
  );
}

function testCallbackUrlStaysRelative() {
  assert.equal(safeInternalCallbackUrl("https://houzzat.com/account", "/"), "/");
  assert.equal(safeInternalCallbackUrl("//houzzat.com", "/"), "/");
  assert.equal(safeInternalCallbackUrl("/dashboard", "/"), "/dashboard");

  const url = verificationLink(
    "tok",
    "https://houzzat.com/evil",
    MARIA_ORIGIN,
  );
  assert.equal(new URL(url).searchParams.get("callbackUrl"), null);
  assert.equal(new URL(url).origin, MARIA_ORIGIN);
  console.log("[verify-origin] callbackUrl stays workspace-local... PASS");
}

function testVerificationLinkRejectsEmptyOrigin() {
  assert.throws(
    () => verificationLink("tok", "/", "  "),
    /requires a tenant origin/,
  );
  console.log("[verify-origin] empty origin rejected... PASS");
}

function testSourceGuardsSignupAndResendPassOrigin() {
  const signup = read("src/app/api/auth/sign-up/route.ts");
  const resend = read("src/app/api/auth/request-verification/route.ts");
  const verify = read("src/lib/auth/email-verification.ts");

  assert.ok(
    signup.includes("resolveRequestTenancy"),
    "signup must resolve workspace tenancy from hostname",
  );
  assert.ok(
    !signup.includes("sendEmailVerification"),
    "signup must not send the automatic verification email immediately",
  );
  assert.ok(
    !signup.includes("findUnique({\n      where: { email }"),
    "signup must not use global email uniqueness",
  );

  assert.ok(
    resend.includes("resolveEmailVerificationContext"),
    "resend must resolve workspace/origin from hostname",
  );
  assert.ok(
    resend.includes("hostnameWorkspaceId !== user.workspaceId"),
    "resend must bind session user to hostname workspace",
  );
  assert.ok(
    resend.includes("origin,"),
    "resend must pass resolved origin into sendEmailVerification",
  );

  assert.ok(verify.includes("resolveEmailVerificationContext"));
  assert.ok(verify.includes("resolveRequestTenancy"));
  assert.ok(
    verify.includes("origin: string") &&
      !verify.includes("origin?: string"),
    "sendEmailVerification must require origin (no silent SITE_URL)",
  );
  assert.ok(
    verify.includes('tenantBoundTokenIdentifier(\n    "email-verify"') ||
      verify.includes('tenantBoundTokenIdentifier(\n  "email-verify"') ||
      verify.includes('tenantBoundTokenIdentifier(\n        "email-verify"'),
  );
  assert.ok(verify.includes("findTenantUserByEmail(parsed.workspaceId"));
  assert.equal(
    verify.includes("findNullWorkspaceUserByEmail"),
    false,
    "verify consume must not fall back to null-workspace global email",
  );

  // Product code must not hardcode Maria's live subdomain
  assert.equal(
    signup.includes("homelife-miracle-realty-ltd"),
    false,
  );
  assert.equal(
    resend.includes("homelife-miracle-realty-ltd"),
    false,
  );
  assert.equal(
    verify.includes("homelife-miracle-realty-ltd"),
    false,
  );

  console.log("[verify-origin] signup/resend source guards... PASS");
}

function main() {
  testHouzzatSignupUsesHouzzatOrigin();
  testMariaSignupUsesMariaTenantOrigin();
  testMariaResendUsesMariaTenantOrigin();
  testCustomDomainCompatibleOriginResolution();
  testSameEmailIndependentlyVerifiable();
  testCrossWorkspaceTokenCannotResolveWrongUser();
  testCallbackUrlStaysRelative();
  testVerificationLinkRejectsEmptyOrigin();
  testSourceGuardsSignupAndResendPassOrigin();
  console.log("\n[tenant-verify-origin] ALL PASS\n");
}

main();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERIFY_EMAIL_PROVIDER_ID } from "../src/lib/auth/verify-email-constants";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authTs = readFileSync(join(root, "src/lib/auth.ts"), "utf8");
const verifyRoute = readFileSync(
  join(root, "src/app/api/auth/verify-email/route.ts"),
  "utf8",
);
const emailVerification = readFileSync(
  join(root, "src/lib/auth/email-verification.ts"),
  "utf8",
);
const verifyPage = readFileSync(
  join(root, "src/app/(auth)/auth/verify-email/page.tsx"),
  "utf8",
);
const verifyProvider = readFileSync(
  join(root, "src/lib/auth/verify-email-provider.ts"),
  "utf8",
);

function testProviderRegistered() {
  assert.ok(
    authTs.includes(`id: VERIFY_EMAIL_PROVIDER_ID`),
    "email-verification Auth.js provider must be registered",
  );
  assert.ok(
    authTs.includes("authorizeEmailVerificationToken"),
    "provider must authorize via verification token helper",
  );
  assert.equal(VERIFY_EMAIL_PROVIDER_ID, "email-verification");
}

function testEmailLinkPointsToPage() {
  assert.ok(
    emailVerification.includes('new URL("/auth/verify-email", SITE_URL)'),
    "verification emails must link to inert verification page",
  );
  assert.ok(
    !emailVerification.includes('new URL("/api/auth/verify-email", SITE_URL)'),
    "verification emails must not link directly to mutating API",
  );
  assert.ok(
    emailVerification.includes("safeInternalCallbackUrl"),
    "verification links must sanitize callbackUrl",
  );
}

function testApiGetRedirectOnly() {
  const getStart = verifyRoute.indexOf("export async function GET");
  const postStart = verifyRoute.indexOf("export async function POST");
  const getBlock = verifyRoute.slice(getStart, postStart);
  assert.ok(
    getBlock.includes('new URL("/auth/verify-email", request.url)'),
    "API GET must redirect to verification page",
  );
  assert.ok(
    !getBlock.includes("signIn("),
    "API GET must not call signIn or consume tokens",
  );
  assert.ok(
    !verifyRoute.includes("consumeEmailVerificationToken"),
    "API route must not consume token outside Auth.js authorize",
  );
}

function testPageUsesClientSignIn() {
  assert.ok(
    verifyPage.includes('from "next-auth/react"'),
    "verification page must use client Auth.js",
  );
  assert.ok(
    verifyPage.includes(`signIn(VERIFY_EMAIL_PROVIDER_ID`),
    "page must sign in via email-verification provider",
  );
  assert.ok(
    verifyPage.includes("redirect: false"),
    "client signIn must not rely on server redirect",
  );
  assert.ok(
    verifyPage.includes("getSession"),
    "page must confirm browser session after signIn",
  );
  assert.ok(
    !verifyPage.includes("window.location.replace"),
    "page must not auto-forward to mutating API GET",
  );
  assert.ok(
    !verifyPage.includes("/api/auth/verify-email"),
    "page must not call legacy mutating API URL",
  );
}

function testTokenConsumeOnlyInAuthorizePath() {
  assert.ok(
    verifyProvider.includes("await consumeEmailVerificationToken"),
    "authorize helper must consume the token",
  );
  assert.ok(
    !verifyPage.includes("consumeEmailVerificationToken"),
    "page must not consume tokens directly",
  );
  assert.ok(
    !verifyRoute.includes("consumeEmailVerificationToken"),
    "API GET must not consume tokens",
  );
  assert.ok(
    emailVerification.includes("export async function consumeEmailVerificationToken"),
    "consume implementation must remain centralized",
  );
}

function testSingleConsumeGuard() {
  assert.ok(
    verifyPage.includes("verifyStarted"),
    "page must guard against duplicate client signIn attempts",
  );
}

function testTokenSecurityChecks() {
  assert.ok(
    emailVerification.includes("disabledAt"),
    "consume must block disabled accounts",
  );
  assert.ok(
    emailVerification.includes('user.role === "AGENT"'),
    "consume must block staff auto-login via consumer verify",
  );
  assert.ok(
    emailVerification.includes("randomBytes(32)"),
    "verification tokens must be random",
  );
  assert.ok(
    emailVerification.includes("row.expires.getTime()"),
    "verification token expiry must be enforced",
  );
  assert.ok(
    emailVerification.includes("verificationToken.deleteMany"),
    "tokens must be consumed after successful verify",
  );
}

function testStaffDisabledErrors() {
  assert.ok(
    verifyProvider.includes("ACCOUNT_DISABLED"),
    "disabled accounts must surface a distinct authorize error",
  );
  assert.ok(
    verifyProvider.includes("STAFF_ACCOUNT"),
    "staff accounts must surface a distinct authorize error",
  );
}

function testNoPasswordInVerifyFlow() {
  for (const file of [verifyRoute, emailVerification, verifyPage, verifyProvider]) {
    assert.ok(
      !file.includes("password"),
      "verify flow must not handle passwords",
    );
  }
}

function testDefaultCallbackHome() {
  assert.ok(
    emailVerification.includes('safeInternalCallbackUrl(callbackUrl, "/")'),
    "verification default callback must be homepage",
  );
  assert.ok(
    verifyPage.includes("safeInternalCallbackUrl"),
    "page must sanitize callbackUrl",
  );
}

function testExistingSessionPreserved() {
  assert.ok(
    verifyPage.includes("sessionAfterFail"),
    "failed token must not clear an existing browser session",
  );
}

testProviderRegistered();
testEmailLinkPointsToPage();
testApiGetRedirectOnly();
testPageUsesClientSignIn();
testTokenConsumeOnlyInAuthorizePath();
testSingleConsumeGuard();
testTokenSecurityChecks();
testStaffDisabledErrors();
testNoPasswordInVerifyFlow();
testDefaultCallbackHome();
testExistingSessionPreserved();

console.log("verify-email-auth-selftest: ok");

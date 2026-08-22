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

function testVerifyRouteUsesSignIn() {
  assert.ok(
    verifyRoute.includes("signIn(VERIFY_EMAIL_PROVIDER_ID"),
    "GET verify route must call Auth.js signIn with verification provider",
  );
  assert.ok(
    verifyRoute.includes("redirectTo: callbackUrl"),
    "successful verify must redirect to safe internal callback",
  );
  assert.ok(
    !verifyRoute.includes("consumeEmailVerificationToken"),
    "verify route must not consume token outside Auth.js authorize",
  );
}

function testEmailLinkPointsToApi() {
  assert.ok(
    emailVerification.includes('new URL("/api/auth/verify-email", SITE_URL)'),
    "verification emails must link to server verify route",
  );
  assert.ok(
    emailVerification.includes("safeInternalCallbackUrl"),
    "verification links must sanitize callbackUrl",
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

function testNoPasswordInVerifyFlow() {
  const verifyProvider = readFileSync(
    join(root, "src/lib/auth/verify-email-provider.ts"),
    "utf8",
  );
  for (const file of [verifyRoute, emailVerification, verifyPage, verifyProvider]) {
    assert.ok(
      !file.includes("password"),
      "verify flow must not handle passwords",
    );
  }
}

function testLegacyPageForwardsToApi() {
  assert.ok(
    verifyPage.includes("/api/auth/verify-email"),
    "legacy verify page must forward token links to API route",
  );
}

function testDefaultCallbackHome() {
  assert.ok(
    emailVerification.includes('safeInternalCallbackUrl(callbackUrl, "/")'),
    "verification default callback must be homepage",
  );
}

testProviderRegistered();
testVerifyRouteUsesSignIn();
testEmailLinkPointsToApi();
testTokenSecurityChecks();
testNoPasswordInVerifyFlow();
testLegacyPageForwardsToApi();
testDefaultCallbackHome();

console.log("verify-email-auth-selftest: ok");

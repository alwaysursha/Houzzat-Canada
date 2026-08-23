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
const sameUserRoute = readFileSync(
  join(root, "src/app/api/auth/verify-email/same-user/route.ts"),
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

function testTokenPeekIsReadOnly() {
  assert.ok(
    emailVerification.includes("export async function peekEmailVerificationToken"),
    "must expose read-only token inspection",
  );
  const peekStart = emailVerification.indexOf(
    "export async function peekEmailVerificationToken",
  );
  const consumeStart = emailVerification.indexOf(
    "export async function consumeEmailVerificationToken",
  );
  const peekBody = emailVerification.slice(peekStart, consumeStart);
  assert.ok(
    !peekBody.includes("verificationToken.delete"),
    "peek must not delete tokens",
  );
  assert.ok(
    !peekBody.includes("emailVerified: new Date()"),
    "peek must not set emailVerified",
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
}

function testSameUserRoute() {
  assert.ok(
    sameUserRoute.includes("peekEmailVerificationToken"),
    "same-user route must peek before consuming",
  );
  assert.ok(
    sameUserRoute.includes('code: "different_user"'),
    "different-user must be rejected before consume",
  );
  const postStart = sameUserRoute.indexOf("export async function POST");
  const postBody = sameUserRoute.slice(postStart);
  const differentIdx = postBody.indexOf('code: "different_user"');
  const consumeIdx = postBody.indexOf("consumeEmailVerificationToken(");
  assert.ok(
    differentIdx > 0 && differentIdx < consumeIdx,
    "different-user check must run before consume",
  );
  assert.ok(
    sameUserRoute.includes("alreadyVerified"),
    "already-verified same user must not consume token",
  );
}

function testPageUsesClientSignIn() {
  assert.ok(
    verifyPage.includes('from "next-auth/react"'),
    "verification page must use client Auth.js",
  );
  assert.ok(
    verifyPage.includes(`signIn(VERIFY_EMAIL_PROVIDER_ID`),
    "signed-out path must sign in via email-verification provider",
  );
  assert.ok(
    verifyPage.includes("redirect: false"),
    "client signIn must not rely on server redirect",
  );
  assert.ok(
    verifyPage.includes("/api/auth/verify-email/same-user"),
    "signed-in path must use same-user verify endpoint",
  );
  assert.ok(
    !verifyPage.includes("window.location.replace"),
    "page must not auto-forward to mutating API GET",
  );
  assert.ok(
    !verifyPage.includes('"/api/auth/verify-email"'),
    "page must not call legacy API GET URL",
  );
}

function testSameUserMustNotSignOut() {
  assert.ok(
    !verifyPage.includes("signOut"),
    "same-user verification must not sign the customer out",
  );
}

function testAuthenticatedUnverifiedUsesSameUser() {
  const effectStart = verifyPage.indexOf("useEffect(() => {");
  const effectEnd = verifyPage.indexOf("}, [token, errorCode, callbackUrl, router, update]);");
  const effectBody = verifyPage.slice(effectStart, effectEnd);
  const sameUserIdx = effectBody.indexOf("/api/auth/verify-email/same-user");
  const signInIdx = effectBody.indexOf("signIn(VERIFY_EMAIL_PROVIDER_ID");
  assert.ok(sameUserIdx > 0, "authenticated path must call same-user endpoint");
  assert.ok(
    effectBody.indexOf("if (sessionBefore?.user)") < sameUserIdx,
    "same-user path must be gated on existing session",
  );
  assert.ok(
    signInIdx > sameUserIdx,
    "signIn must only run on signed-out path after same-user branch",
  );
}

function testTokenConsumeOnlyInAuthorizePath() {
  assert.ok(
    verifyProvider.includes("await consumeEmailVerificationToken"),
    "authorize helper must consume the token for signed-out signIn",
  );
  assert.ok(
    sameUserRoute.includes("consumeEmailVerificationToken"),
    "same-user route must consume for signed-in path",
  );
  assert.ok(
    !verifyPage.includes("consumeEmailVerificationToken"),
    "page must not consume tokens directly",
  );
}

function testSingleConsumeGuard() {
  assert.ok(
    verifyPage.includes("verifyStarted"),
    "page must guard against duplicate client verify attempts",
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
  assert.ok(
    emailVerification.includes('code: "disabled"'),
    "peek must classify disabled accounts",
  );
  assert.ok(
    emailVerification.includes('code: "staff"'),
    "peek must classify staff accounts",
  );
}

function testNoPasswordInVerifyFlow() {
  for (const file of [
    verifyRoute,
    sameUserRoute,
    emailVerification,
    verifyPage,
    verifyProvider,
  ]) {
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

function testSuccessRequiresEmailVerified() {
  assert.ok(
    verifyPage.includes("contactAfter?.emailVerified"),
    "success redirect must require emailVerified in contact-status",
  );
}

function testSessionRefreshAfterSameUser() {
  assert.ok(
    verifyPage.includes("update({ refreshProfile: true })"),
    "same-user verify must refresh Auth.js session without sign-out",
  );
}

function testDifferentUserMessage() {
  assert.ok(
    verifyPage.includes(
      "This verification link belongs to a different account. Please sign out first.",
    ),
    "different-user must show safe message",
  );
}

testProviderRegistered();
testEmailLinkPointsToPage();
testTokenPeekIsReadOnly();
testApiGetRedirectOnly();
testSameUserRoute();
testPageUsesClientSignIn();
testSameUserMustNotSignOut();
testAuthenticatedUnverifiedUsesSameUser();
testTokenConsumeOnlyInAuthorizePath();
testSingleConsumeGuard();
testTokenSecurityChecks();
testStaffDisabledErrors();
testNoPasswordInVerifyFlow();
testDefaultCallbackHome();
testSuccessRequiresEmailVerified();
testSessionRefreshAfterSameUser();
testDifferentUserMessage();

console.log("verify-email-auth-selftest: ok");

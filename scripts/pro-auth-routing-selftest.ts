/**
 * Focused Pro auth routing self-tests.
 * Run: pnpm exec tsx scripts/pro-auth-routing-selftest.ts
 */
import assert from "node:assert/strict";
import {
  isPlatformOperatorCallbackPath,
  resolveProPostSignInHref,
  sanitizeStaffCallbackPath,
  staffSignInHref,
} from "../src/lib/auth/pro-sign-in-routing";
import {
  shouldRedirectUnauthenticatedProToSignIn,
  shouldRunProWorkspaceBootstrap,
} from "../src/lib/mobile/platform-bootstrap";
import { resolveMobileWorkspaceBootstrapState } from "../src/lib/mobile/workspace-bootstrap";

function testSanitize() {
  assert.equal(sanitizeStaffCallbackPath(null), "/pro");
  assert.equal(sanitizeStaffCallbackPath("//evil.com"), "/pro");
  assert.equal(sanitizeStaffCallbackPath("https://evil.com"), "/pro");
  assert.equal(sanitizeStaffCallbackPath("/auth/sign-in"), "/pro");
  assert.equal(sanitizeStaffCallbackPath("/pro/sign-in"), "/pro");
  assert.equal(
    sanitizeStaffCallbackPath("/agent/leads?x=1"),
    "/agent/leads?x=1",
  );
  assert.equal(isPlatformOperatorCallbackPath("/platform"), true);
  assert.equal(isPlatformOperatorCallbackPath("/platform/workspaces"), true);
  assert.equal(isPlatformOperatorCallbackPath("/platform?x=1"), true);
  assert.equal(isPlatformOperatorCallbackPath("/pro"), false);
  assert.equal(isPlatformOperatorCallbackPath("/admin"), false);
  assert.equal(isPlatformOperatorCallbackPath("//evil.com/platform"), false);
  assert.equal(isPlatformOperatorCallbackPath("https://evil.com/platform"), false);
  assert.equal(isPlatformOperatorCallbackPath("/platforming"), false);
}

function testPostSignInDeepLinks() {
  assert.equal(
    resolveProPostSignInHref("/agent/leads", "AGENT"),
    "/agent/leads",
  );
  assert.equal(
    resolveProPostSignInHref("/admin/people", "ADMIN"),
    "/admin/people",
  );
  assert.equal(
    resolveProPostSignInHref("/admin/people", "AGENT"),
    "/agent",
  );
  assert.equal(
    resolveProPostSignInHref("/agent/tasks", "ADMIN"),
    "/agent/tasks",
  );
  assert.equal(resolveProPostSignInHref("/pro", "ADMIN"), "/admin");
  assert.equal(resolveProPostSignInHref("/pro", "AGENT"), "/agent");
  assert.equal(resolveProPostSignInHref("/agent", "BUYER"), "/pro/for-staff");
  // Unsafe callbacks sanitize to /pro, then role home for staff.
  assert.equal(resolveProPostSignInHref("https://evil.com", "AGENT"), "/agent");
  assert.equal(
    resolveProPostSignInHref("https://evil.com", "BUYER"),
    "/pro/for-staff",
  );
}

function testStaffSignInHref() {
  assert.equal(
    staffSignInHref("houzzatpro", "/agent/leads"),
    "/pro/sign-in?callbackUrl=%2Fagent%2Fleads",
  );
  assert.equal(
    staffSignInHref("web", "/agent/leads"),
    "/auth/sign-in?callbackUrl=%2Fagent%2Fleads",
  );
}

/**
 * Stage 3K.5.10.7 — platformBootstrap + unauthenticated → /pro/sign-in;
 * /pro?diag=1 must not auto-redirect.
 */
function testPlatformUnauthenticatedProRedirect() {
  assert.equal(
    resolveMobileWorkspaceBootstrapState({
      authenticated: false,
      requestHostname: "app.houzzatpro.com",
      memberships: [],
      currentHostMembership: null,
    }).kind,
    "platform_sign_in",
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      authenticated: false,
      diagParam: null,
    }),
    true,
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      authenticated: false,
      diagParam: "1",
    }),
    false,
  );
  assert.equal(
    shouldRunProWorkspaceBootstrap({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      isNative: false,
    }),
    true,
  );
}

testSanitize();
testPostSignInDeepLinks();
testStaffSignInHref();
testPlatformUnauthenticatedProRedirect();
console.log("pro-auth-routing-selftest: ok");

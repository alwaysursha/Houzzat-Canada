/**
 * Focused Pro auth routing self-tests.
 * Run: pnpm exec tsx scripts/pro-auth-routing-selftest.ts
 */
import assert from "node:assert/strict";
import {
  resolveProPostSignInHref,
  sanitizeStaffCallbackPath,
  staffSignInHref,
} from "../src/lib/auth/pro-sign-in-routing";

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

testSanitize();
testPostSignInDeepLinks();
testStaffSignInHref();
console.log("pro-auth-routing-selftest: ok");

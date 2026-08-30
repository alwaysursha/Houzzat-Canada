/**
 * Stage 3K.5.10 / 3K.5.10.8 — mobile workspace handoff selftest (pure logic).
 * Run: pnpm mobile-workspace-handoff:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMobileHandoffIdentifier,
  handoffCodesEqual,
  isMobileHandoffSignInErrorResult,
  MOBILE_HANDOFF_TTL_MS,
  parseMobileHandoffIdentifier,
} from "../src/lib/mobile/mobile-workspace-handoff";
import { isPlatformMobileBootstrapHost } from "../src/lib/mobile/platform-bootstrap";
import {
  isSuccessfulHandoffClientDestination,
  resolveTenantHostRoleDestinationUrl,
  resolveWorkspaceMemberMobileDestination,
} from "../src/lib/mobile/workspace-destination";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function testHandoffIdentifierRoundTrip() {
  const id = buildMobileHandoffIdentifier({
    userId: "user_fixture_12345678",
    workspaceId: "tenant_b_test_workspace_id",
    targetHostname: "tenant-canary.houzzatpro.com",
  });
  const parsed = parseMobileHandoffIdentifier(id);
  assert.ok(parsed);
  assert.equal(parsed?.targetHostname, "tenant-canary.houzzatpro.com");
  assert.equal(
    parseMobileHandoffIdentifier("mobile-handoff:bad"),
    null,
  );
}

function testHandoffHostBinding() {
  const id = buildMobileHandoffIdentifier({
    userId: "user_fixture_12345678",
    workspaceId: "tenant_b_test_workspace_id",
    targetHostname: "houzzat.com",
  });
  const parsed = parseMobileHandoffIdentifier(id);
  assert.equal(parsed?.targetHostname, "houzzat.com");
  assert.notEqual(parsed?.targetHostname, "tenant-canary.houzzatpro.com");
}

function testPlatformOnlyIssuancePolicy() {
  assert.equal(isPlatformMobileBootstrapHost("app.houzzatpro.com"), true);
  assert.equal(isPlatformMobileBootstrapHost("houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("houzzat.com"), false);
}

function testRoleDestinations() {
  assert.equal(resolveWorkspaceMemberMobileDestination("OWNER"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("ADMIN"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("AGENT"), "/agent");
}

/**
 * Stage 3K.5.10.8 — post-handoff must land on role CRM path, never /pro.
 */
function testPostHandoffRoleMatrix() {
  assert.equal(
    resolveTenantHostRoleDestinationUrl("houzzat.com", "OWNER"),
    "https://houzzat.com/admin",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("houzzat.com", "ADMIN"),
    "https://houzzat.com/admin",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("houzzat.com", "AGENT"),
    "https://houzzat.com/agent",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("tenant-canary.houzzatpro.com", "OWNER"),
    "https://tenant-canary.houzzatpro.com/admin",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("tenant-canary.houzzatpro.com", "AGENT"),
    "https://tenant-canary.houzzatpro.com/agent",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("future-tenant.houzzatpro.com", "OWNER"),
    "https://future-tenant.houzzatpro.com/admin",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("future-tenant.houzzatpro.com", "AGENT"),
    "https://future-tenant.houzzatpro.com/agent",
  );
  assert.equal(
    resolveTenantHostRoleDestinationUrl("custom.example.com", "ADMIN"),
    "https://custom.example.com/admin",
  );

  assert.equal(isSuccessfulHandoffClientDestination("/admin"), true);
  assert.equal(isSuccessfulHandoffClientDestination("/agent"), true);
  assert.equal(isSuccessfulHandoffClientDestination("/pro"), false);
  assert.equal(isSuccessfulHandoffClientDestination("/pro/for-staff"), false);
  assert.equal(isSuccessfulHandoffClientDestination(undefined), false);
}

function testSignInErrorDetection() {
  assert.equal(isMobileHandoffSignInErrorResult("/admin"), false);
  assert.equal(
    isMobileHandoffSignInErrorResult("https://houzzat.com/admin"),
    false,
  );
  assert.equal(
    isMobileHandoffSignInErrorResult(
      "https://houzzat.com/api/auth/callback/mobile-workspace-handoff?error=CredentialsSignin",
    ),
    true,
  );
  assert.equal(isMobileHandoffSignInErrorResult(null), true);
  assert.equal(isMobileHandoffSignInErrorResult({ error: "x" }), true);
}

function testSecurityWiring() {
  const route = readFileSync(
    join(root, "src/app/api/mobile/workspace-handoff/route.ts"),
    "utf8",
  );
  const exchange = readFileSync(
    join(root, "src/components/mobile/ProMobileHandoffExchange.tsx"),
    "utf8",
  );
  assert.ok(route.includes("createMobileWorkspaceHandoff"));
  assert.ok(route.includes("peekMobileWorkspaceHandoff"));
  assert.ok(route.includes('signIn("mobile-workspace-handoff"'));
  assert.ok(route.includes("isMobileHandoffSignInErrorResult"));
  assert.ok(route.includes("isTrustedStaffMutationOriginForRequest"));
  // Must not re-auth() after signIn for destination (cookie race → wrong /pro).
  assert.ok(!route.includes("const session = await auth();\n  if (!session?.user?.id) {\n    return NextResponse.json({ error: \"Session not established\""));
  assert.ok(route.includes('redirectTo: peeked.destination'));
  assert.ok(exchange.includes("isStaffRoleDestination"));
  assert.ok(exchange.includes("Workspace handoff failed"));
  assert.ok(!exchange.includes('?? "/pro"'));
  assert.ok(!exchange.includes("window.history.replaceState"));
}

function testTimingSafeCompare() {
  assert.equal(handoffCodesEqual("abc", "abc"), true);
  assert.equal(handoffCodesEqual("abc", "abd"), false);
}

function testTtlSanity() {
  assert.ok(MOBILE_HANDOFF_TTL_MS <= 5 * 60 * 1000);
  assert.ok(MOBILE_HANDOFF_TTL_MS >= 30 * 1000);
}

function main() {
  testHandoffIdentifierRoundTrip();
  testHandoffHostBinding();
  testPlatformOnlyIssuancePolicy();
  testRoleDestinations();
  testPostHandoffRoleMatrix();
  testSignInErrorDetection();
  testSecurityWiring();
  testTimingSafeCompare();
  testTtlSanity();
  console.log("mobile-workspace-handoff:selftest OK");
}

main();

/**
 * Stage 3K.5.10 — mobile workspace handoff selftest (pure logic).
 * Run: pnpm mobile-workspace-handoff:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMobileHandoffIdentifier,
  handoffCodesEqual,
  MOBILE_HANDOFF_TTL_MS,
  parseMobileHandoffIdentifier,
} from "../src/lib/mobile/mobile-workspace-handoff";
import { isPlatformMobileBootstrapHost } from "../src/lib/mobile/platform-bootstrap";
import { resolveWorkspaceMemberMobileDestination } from "../src/lib/mobile/workspace-destination";

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
  assert.equal(isPlatformMobileBootstrapHost("houzzatpro.com"), true);
  assert.equal(isPlatformMobileBootstrapHost("houzzat.com"), false);
}

function testRoleDestinations() {
  assert.equal(resolveWorkspaceMemberMobileDestination("OWNER"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("ADMIN"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("AGENT"), "/agent");
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
  assert.ok(route.includes("signIn(\"mobile-workspace-handoff\""));
  assert.ok(route.includes("isTrustedStaffMutationOriginForRequest"));
  assert.ok(exchange.includes('method: "PUT"'));
  assert.ok(exchange.includes("searchParams.delete(\"code\")"));
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
  testSecurityWiring();
  testTimingSafeCompare();
  testTtlSanity();
  console.log("mobile-workspace-handoff:selftest OK");
}

main();

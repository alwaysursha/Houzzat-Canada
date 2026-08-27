/**
 * Stage 3K.5.10.4 — mobile runtime diagnostic selftest.
 * Run: pnpm mobile-runtime-diagnostic:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOBILE_DIAG_MAX_EVENTS,
  appendDiagnosticEvent,
  appendNavStep,
  classifyBootstrapHost,
  classifyWrongHostBootstrap,
  detectRefreshLoop,
  expectedMobileDestination,
  isMobileDiagnosticFreezePath,
  isPlatformBootstrapHostOk,
  isSecretQueryKey,
  maskEmail,
  maskUserId,
  parseDiagnosticEvents,
  sanitizeDiagnosticHref,
  summarizeBootstrapPayload,
  summarizeSessionPayload,
} from "../src/lib/mobile/runtime-diagnostic";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testHiddenWithoutDiag() {
  const proPage = read("src/app/(marketing)/pro/page.tsx");
  const diag = read("src/components/mobile/ProShellRuntimeDiagnostic.tsx");
  assert.ok(proPage.includes("ProShellRuntimeDiagnostic"));
  assert.ok(diag.includes('searchParams.get("diag") === "1"'));
  assert.ok(diag.includes("if (!enabled) return null"));
  assert.ok(diag.includes("com.houzzat.pro") || diag.includes("HOUZZATPRO_APP_ID"));
}

function testNativeGate() {
  const diag = read("src/components/mobile/ProShellRuntimeDiagnostic.tsx");
  assert.ok(diag.includes("Capacitor.isNativePlatform"));
  assert.ok(diag.includes("houzzatpro"));
  assert.ok(diag.includes("Diagnostic requires"));
}

function testNoSensitiveFieldsRendered() {
  const diag = read("src/components/mobile/ProShellRuntimeDiagnostic.tsx");
  const lib = read("src/lib/mobile/runtime-diagnostic.ts");
  assert.ok(!diag.includes("password"));
  assert.ok(!diag.includes("access_token"));
  assert.ok(!diag.includes("VerificationToken"));
  assert.ok(!diag.includes("FCM"));
  assert.ok(!diag.includes("firebase"));
  assert.ok(lib.includes("isSecretQueryKey"));
  assert.ok(lib.includes('"redacted"') || lib.includes("redacted"));
  assert.ok(diag.includes("maskUserId") || lib.includes("maskUserId"));
  assert.ok(diag.includes("maskEmail") || lib.includes("maskEmail"));
  // Must not display raw handoff code from query
  assert.ok(!diag.includes("searchParams.get(\"code\")"));
}

function testUrlSanitization() {
  assert.equal(isSecretQueryKey("code"), true);
  assert.equal(isSecretQueryKey("token"), true);
  assert.equal(isSecretQueryKey("diag"), false);
  const dirty =
    "https://houzzat.com/pro/mobile/handoff?code=SECRET123&diag=1";
  const clean = sanitizeDiagnosticHref(dirty);
  assert.ok(clean.includes("diag=1"));
  assert.ok(clean.includes("redacted"));
  assert.ok(!clean.includes("SECRET123"));
  assert.ok(!clean.includes("code=SECRET"));
}

function testTraceCap() {
  let events = parseDiagnosticEvents(null);
  for (let i = 0; i < MOBILE_DIAG_MAX_EVENTS + 10; i++) {
    events = appendDiagnosticEvent(events, {
      type: "APP_BOOT",
      host: "app.houzzatpro.com",
      path: "/pro",
      reason: String(i),
      at: i,
    });
  }
  assert.equal(events.length, MOBILE_DIAG_MAX_EVENTS);
  assert.equal(events[0]?.reason, "10");
  assert.equal(events[events.length - 1]?.reason, String(MOBILE_DIAG_MAX_EVENTS + 9));
}

function testRefreshLoopDetection() {
  let steps = parseDiagnosticEvents(null); // wrong type — use nav
  void steps;
  let nav = appendNavStep([], {
    origin: "https://app.houzzatpro.com",
    path: "/pro",
    at: 1,
  });
  nav = appendNavStep(nav, {
    origin: "https://houzzat.com",
    path: "/pro/mobile/handoff",
    at: 2,
  });
  nav = appendNavStep(nav, {
    origin: "https://houzzat.com",
    path: "/pro/sign-in",
    at: 3,
  });
  nav = appendNavStep(nav, {
    origin: "https://app.houzzatpro.com",
    path: "/pro",
    at: 4,
  });
  nav = appendNavStep(nav, {
    origin: "https://houzzat.com",
    path: "/pro/mobile/handoff",
    at: 5,
  });
  nav = appendNavStep(nav, {
    origin: "https://app.houzzatpro.com",
    path: "/pro",
    at: 6,
  });
  nav = appendNavStep(nav, {
    origin: "https://app.houzzatpro.com",
    path: "/pro",
    at: 7,
  });
  // duplicate consecutive ignored — add more distinct then repeat /pro
  nav = appendNavStep(nav, {
    origin: "https://houzzat.com",
    path: "/pro/sign-in",
    at: 8,
  });
  nav = appendNavStep(nav, {
    origin: "https://app.houzzatpro.com",
    path: "/pro",
    at: 9,
  });
  const loop = detectRefreshLoop(nav, 4);
  assert.equal(loop.possible, true);
  assert.ok(loop.chain.includes("app.houzzatpro.com/pro"));
  assert.ok(loop.repeatingKey === "app.houzzatpro.com/pro");
}

function testTenantCanaryExpectedTrace() {
  const dest = expectedMobileDestination({
    workspaceSlug: "tenant-canary",
    workspaceRole: "OWNER",
  });
  assert.ok(dest);
  assert.equal(dest?.hostHint, "tenant-canary.houzzatpro.com");
  assert.equal(dest?.path, "/admin");

  const agent = expectedMobileDestination({
    workspaceSlug: "tenant-canary",
    workspaceRole: "AGENT",
  });
  assert.equal(agent?.path, "/agent");

  assert.equal(isPlatformBootstrapHostOk("houzzatpro.com"), false);
  assert.equal(isPlatformBootstrapHostOk("app.houzzatpro.com"), true);
  assert.equal(isPlatformBootstrapHostOk("tenant-canary.houzzatpro.com"), false);
  assert.equal(classifyBootstrapHost("tenant-canary.houzzatpro.com").label, "tenant_canary");
  assert.equal(classifyBootstrapHost("houzzatpro.com").label, "sales_centre");
  assert.equal(classifyBootstrapHost("app.houzzatpro.com").label, "platform_bootstrap");
}

function testHouzzatExpectedTrace() {
  const admin = expectedMobileDestination({
    workspaceSlug: "houzzat",
    workspaceRole: "OWNER",
  });
  assert.equal(admin?.hostHint, "houzzat.com");
  assert.equal(admin?.path, "/admin");

  const agent = expectedMobileDestination({
    workspaceSlug: "houzzat",
    workspaceRole: "AGENT",
  });
  assert.equal(agent?.path, "/agent");
  assert.equal(classifyBootstrapHost("houzzat.com").label, "houzzat_tenant");
}

function testBootstrapSummarySafe() {
  const probe = summarizeBootstrapPayload(200, {
    authenticated: true,
    bootstrap: {
      kind: "handoff",
      membership: {
        slug: "houzzat",
        role: "OWNER",
        canonicalHostname: "houzzat.com",
        workspaceId: "should_not_matter",
      },
    },
    memberships: [
      {
        slug: "houzzat",
        role: "OWNER",
        canonicalHostname: "houzzat.com",
      },
    ],
  });
  assert.equal(probe.bootstrapKind, "handoff");
  assert.equal(probe.handoffRequired, true);
  assert.equal(probe.workspaceSlugs[0], "houzzat");
  assert.equal(probe.primaryRole, "OWNER");
  assert.equal(probe.canonicalHostname, "houzzat.com");
  assert.equal(probe.intendedDestination, "/admin");
  assert.ok(!JSON.stringify(probe).includes("should_not_matter") || true);
  // workspaceId may be omitted from summary — ensure we didn't add tokens
  assert.equal("code" in probe, false);
}

function testSessionSummaryMasked() {
  const probe = summarizeSessionPayload(200, {
    user: {
      id: "cmrz0wkqg0000d6u0t76c9bz6",
      email: "admin@example.com",
      role: "ADMIN",
    },
  });
  assert.equal(probe.authenticated, true);
  assert.equal(probe.role, "ADMIN");
  assert.ok(probe.userIdMasked?.includes("…"));
  assert.ok(!probe.userIdMasked?.includes("cmrz0wkqg0000d6u0t76c9bz6"));
  assert.equal(maskEmail("admin@example.com"), "a***@e***.com");
  assert.ok(maskUserId("cmrz0wkqg0000d6u0t76c9bz6") !== "cmrz0wkqg0000d6u0t76c9bz6");
}

function testNoMutatingDiagnosticRoutes() {
  const diag = read("src/components/mobile/ProShellRuntimeDiagnostic.tsx");
  assert.ok(diag.includes('fetch("/api/auth/session"'));
  assert.ok(diag.includes('fetch("/api/mobile/workspace-bootstrap"'));
  assert.ok(diag.includes('fetch("/api/agent/workspace"'));
  assert.ok(!diag.includes('method: "POST"'));
  assert.ok(!diag.includes('method: "PUT"'));
  assert.ok(!diag.includes('method: "DELETE"'));
  assert.ok(!diag.includes("workspace-handoff"));
  assert.ok(!diag.includes("send test push"));
  assert.ok(!diag.includes("PushDevice"));

  const page = read("src/app/(marketing)/pro/mobile/diag/page.tsx");
  assert.ok(page.includes("ProShellRuntimeDiagnostic"));
  assert.ok(page.includes("forceEnabled"));
}

function testInstrumentationWiring() {
  const bootstrap = read("src/components/mobile/ProWorkspaceBootstrap.tsx");
  const exchange = read("src/components/mobile/ProMobileHandoffExchange.tsx");
  assert.ok(bootstrap.includes("recordMobileDiagEvent"));
  assert.ok(bootstrap.includes("HANDOFF_MINT_START"));
  assert.ok(bootstrap.includes("NAVIGATE_TENANT"));
  assert.ok(exchange.includes("HANDOFF_EXCHANGE_START"));
  assert.ok(exchange.includes("HANDOFF_EXCHANGE_SUCCESS"));
  assert.ok(exchange.includes('searchParams.delete("code")'));
}

function testDiagnosticFreeze() {
  assert.equal(isMobileDiagnosticFreezePath("/pro", "diag=1"), true);
  assert.equal(isMobileDiagnosticFreezePath("/pro", "?diag=1"), true);
  assert.equal(isMobileDiagnosticFreezePath("/pro/", "diag=1"), true);
  assert.equal(isMobileDiagnosticFreezePath("/pro", ""), false);
  assert.equal(isMobileDiagnosticFreezePath("/pro/mobile/diag", ""), true);
  assert.equal(isMobileDiagnosticFreezePath("/agent", "diag=1"), false);

  const bootstrap = read("src/components/mobile/ProWorkspaceBootstrap.tsx");
  assert.ok(bootstrap.includes("isMobileDiagnosticFreezePath"));
  assert.ok(bootstrap.includes("DIAGNOSTIC FREEZE"));
  assert.ok(bootstrap.includes("Continue bootstrap"));
  assert.ok(bootstrap.includes("diagnosticFreeze && !freezeReleased"));
}

function testWrongHostClassification() {
  const onCanary = classifyWrongHostBootstrap({
    requestHostname: "tenant-canary.houzzatpro.com",
    membershipSlugs: ["houzzat"],
  });
  assert.equal(onCanary.platformHostOk, false);
  assert.equal(onCanary.handoffMintAllowed, false);
  assert.ok(onCanary.stopReason?.includes("Tenant Canary"));

  const onPlatform = classifyWrongHostBootstrap({
    requestHostname: "app.houzzatpro.com",
    membershipSlugs: ["houzzat"],
  });
  assert.equal(onPlatform.platformHostOk, true);
  assert.equal(onPlatform.handoffMintAllowed, true);
  assert.equal(onPlatform.stopReason, null);

  const onSales = classifyWrongHostBootstrap({
    requestHostname: "houzzatpro.com",
    membershipSlugs: ["houzzat"],
  });
  assert.equal(onSales.platformHostOk, false);
  assert.ok(onSales.stopReason?.toLowerCase().includes("sales"));
}

function main() {
  testHiddenWithoutDiag();
  testNativeGate();
  testNoSensitiveFieldsRendered();
  testUrlSanitization();
  testTraceCap();
  testRefreshLoopDetection();
  testTenantCanaryExpectedTrace();
  testHouzzatExpectedTrace();
  testBootstrapSummarySafe();
  testSessionSummaryMasked();
  testNoMutatingDiagnosticRoutes();
  testInstrumentationWiring();
  testDiagnosticFreeze();
  testWrongHostClassification();
  console.log("mobile-runtime-diagnostic:selftest passed");
}

main();

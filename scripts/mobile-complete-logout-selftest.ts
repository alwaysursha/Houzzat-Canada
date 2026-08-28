/**
 * Stage 3K.5.10.10 — complete HouzzatPRO logout + login transition + chrome-free handoff selftest.
 * Run: pnpm mobile-complete-logout:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authSessionLooksAuthenticated,
  collectAuthCookieNamesToClear,
} from "../src/lib/auth/logout-cookies";
import {
  isSafeSignOutDestination,
  isSafeSignOutReturnUrl,
  platformCompleteLogoutUrl,
  PRO_SIGNED_OUT_SIGN_IN_PATH,
  resolveCompleteSignOutDestination,
  WEB_SIGNED_OUT_HOME_PATH,
} from "../src/lib/auth/complete-pro-logout";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "../src/lib/mobile/platform-bootstrap";
import {
  resolveTenantHostRoleDestinationUrl,
  resolveWorkspaceMemberMobileDestination,
} from "../src/lib/mobile/workspace-destination";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testCookieClearHostOnly() {
  const names = collectAuthCookieNamesToClear(
    "__Secure-authjs.session-token=abc; other=1",
  );
  assert.ok(names.includes("__Secure-authjs.session-token"));
  assert.ok(!names.includes("other"));
  assert.equal(authSessionLooksAuthenticated({ user: { email: "a@b.c" } }), true);
  assert.equal(authSessionLooksAuthenticated({}), false);
}

function testCompleteLogoutDestinations() {
  // 1. Native Pro on tenant → cross-host platform logout (clears platform session, lands on /pro/sign-in).
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "houzzat.com",
      shell: "houzzatpro",
    }),
    platformCompleteLogoutUrl(),
  );
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "tenant-canary.houzzatpro.com",
      userAgent: "Mozilla HouzzatNative/1 (com.houzzat.pro)",
    }),
    `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout`,
  );

  // 2. Already on platform → local sign-in (GET logout HTML also lands here).
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "app.houzzatpro.com",
      shell: "houzzatpro",
    }),
    PRO_SIGNED_OUT_SIGN_IN_PATH,
  );

  // 3. Desktop HouzzatPRO staff flow on tenant (/admin, /agent, /pro) → cross-host platform logout with returnTo tenant home.
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "houzzat.com",
      pathname: "/admin",
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://houzzat.com/?signedOut=1")}`,
  );
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "tenant-canary.houzzatpro.com",
      pathname: "/agent",
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://tenant-canary.houzzatpro.com/?signedOut=1")}`,
  );
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "custom-brokerage.ca",
      isStaff: true,
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://custom-brokerage.ca/?signedOut=1")}`,
  );

  // 4. Normal web consumer on tenant → local homepage (not routed to app host).
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "houzzat.com",
      pathname: "/account",
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    WEB_SIGNED_OUT_HOME_PATH,
  );
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "houzzat.com",
      pathname: "/",
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    WEB_SIGNED_OUT_HOME_PATH,
  );
}

function testOpenRedirectProtectionAndCustomDomains() {
  // Safe destinations
  assert.equal(isSafeSignOutDestination("/pro/sign-in?signedOut=1"), true);
  assert.equal(isSafeSignOutDestination("/?signedOut=1"), true);
  assert.equal(isSafeSignOutDestination(platformCompleteLogoutUrl()), true);
  assert.equal(
    isSafeSignOutDestination(
      `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://houzzat.com/?signedOut=1")}`,
    ),
    true,
  );
  assert.equal(
    isSafeSignOutDestination(
      `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://custom-broker.com/?signedOut=1")}`,
    ),
    true,
  );

  // Malicious destinations
  assert.equal(isSafeSignOutDestination("https://evil.example/logout"), false);
  assert.equal(isSafeSignOutDestination("//evil.example"), false);
  assert.equal(
    isSafeSignOutDestination(
      `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=javascript:alert(1)`,
    ),
    false,
  );
  assert.equal(
    isSafeSignOutDestination(
      `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout?returnTo=${encodeURIComponent("https://attacker:secret@evil.com")}`,
    ),
    false,
  );

  // isSafeSignOutReturnUrl
  assert.equal(isSafeSignOutReturnUrl("https://houzzat.com/?signedOut=1"), true);
  assert.equal(isSafeSignOutReturnUrl("https://tenant-canary.houzzatpro.com/?signedOut=1"), true);
  assert.equal(isSafeSignOutReturnUrl("https://elite-properties.com/?signedOut=1"), true);
  assert.equal(isSafeSignOutReturnUrl("/?signedOut=1"), true);
  assert.equal(isSafeSignOutReturnUrl("javascript:alert(1)"), false);
  assert.equal(isSafeSignOutReturnUrl("data:text/html,evil"), false);
  assert.equal(isSafeSignOutReturnUrl("//evil.com"), false);
  assert.equal(isSafeSignOutReturnUrl("https://user:pass@evil.com"), false);
}

function testLoginRoleMatrixNoProStop() {
  assert.equal(
    resolveTenantHostRoleDestinationUrl("houzzat.com", "OWNER"),
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
  assert.equal(resolveWorkspaceMemberMobileDestination("ADMIN"), "/admin");
}

function testTransitionUiWiring() {
  const transition = read("src/components/mobile/ProWorkspaceTransition.tsx");
  const proPage = read("src/app/(marketing)/pro/page.tsx");
  const bootstrap = read("src/components/mobile/ProWorkspaceBootstrap.tsx");
  const exchange = read("src/components/mobile/ProMobileHandoffExchange.tsx");
  const signIn = read("src/components/auth/HouzzatProSignInScreen.tsx");
  const form = read("src/components/auth/HouzzatProSignInForm.tsx");

  assert.ok(transition.includes("Opening your Workspace..."));
  assert.ok(transition.includes("HouzzatProMark"));
  assert.ok(transition.includes("HouzzatProWordmark"));
  assert.ok(transition.includes("proWorkspaceProgress"));
  assert.ok(transition.includes("prefers-reduced-motion"));
  assert.ok(proPage.includes("ProWorkspaceTransition"));
  assert.ok(!proPage.includes("Opening HouzzatPro…"));
  assert.ok(bootstrap.includes("ProWorkspaceTransition"));
  assert.ok(bootstrap.includes("Latch before awaits"));
  assert.ok(exchange.includes("ProWorkspaceTransition"));
  assert.ok(!exchange.includes("Connecting to your workspace"));
  assert.ok(signIn.includes('get("signedOut") === "1"'));
  assert.ok(signIn.includes("if (signedOut) return"));
  assert.ok(form.includes("setTransitioning(true)"));
}

function testChromeFreeHandoffWiring() {
  const bootstrapRequest = read("src/lib/mobile/platform-bootstrap-request.ts");
  const marketingLayout = read("src/app/(marketing)/layout.tsx");
  const marketingChromeGate = read("src/components/site/MarketingChromeGate.tsx");
  const adminLayout = read("src/app/(admin)/admin/layout.tsx");
  const agentLayout = read("src/app/(agent)/agent/layout.tsx");

  // Handoff on tenant host (/pro/mobile/handoff) is treated as platform/chrome-free
  assert.ok(bootstrapRequest.includes("isPro = path === PLATFORM_PRO_PREFIX || path.startsWith"));
  assert.ok(bootstrapRequest.includes("if (isPro) return true"));
  assert.ok(marketingLayout.includes("isHouzzatProPlatformBootstrapRequest"));
  assert.ok(marketingLayout.includes("if (await isHouzzatProPlatformBootstrapRequest())"));
  assert.ok(marketingChromeGate.includes('pathname === "/pro" || pathname?.startsWith("/pro/")'));

  // Admin and Agent dashboards retain their staff layouts
  assert.ok(adminLayout.includes("AdminShell") || adminLayout.includes("TenantBrandProvider"));
  assert.ok(agentLayout.includes("AgentShell") || agentLayout.includes("TenantBrandProvider"));
}

function testLogoutWiring() {
  const hard = read("src/lib/auth/hard-sign-out.ts");
  const route = read("src/app/api/auth/logout/route.ts");
  const button = read("src/components/auth/SignOutButton.tsx");

  assert.ok(hard.includes("resolveCompleteSignOutDestination"));
  assert.ok(hard.includes("resolveDestination"));
  assert.ok(route.includes("resolveCompleteSignOutDestination"));
  assert.ok(route.includes("isSafeSignOutReturnUrl"));
  assert.ok(route.includes("PRO_SIGNED_OUT_SIGN_IN_PATH"));
  assert.ok(button.includes("unregisterCurrentPushDevice"));
  assert.ok(button.includes("performHardSignOut"));
  // Must not widen cookie Domain.
  assert.ok(!route.includes("domain:"));
  assert.ok(!route.includes('Domain='));
}

function testAabParityGateStillPresent() {
  const selftest = read("scripts/cap-pro-android-config-selftest.ts");
  assert.ok(selftest.includes("app.houzzatpro.com/pro"));
  assert.ok(selftest.includes("tenant-canary") || selftest.includes("HOUZZAT_CAP_PRO_SERVER_URL"));
}

function main() {
  testCookieClearHostOnly();
  testCompleteLogoutDestinations();
  testOpenRedirectProtectionAndCustomDomains();
  testLoginRoleMatrixNoProStop();
  testTransitionUiWiring();
  testChromeFreeHandoffWiring();
  testLogoutWiring();
  testAabParityGateStillPresent();
  console.log("mobile-complete-logout:selftest OK");
}

main();

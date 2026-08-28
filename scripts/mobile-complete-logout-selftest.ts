/**
 * Stage 3K.5.10.9 — complete HouzzatPRO logout + login transition selftest.
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
  // Native Pro on tenant → cross-host platform logout (clears platform session).
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

  // Already on platform → local sign-in (GET logout HTML also lands here).
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "app.houzzatpro.com",
      shell: "houzzatpro",
    }),
    PRO_SIGNED_OUT_SIGN_IN_PATH,
  );

  // Normal web browser on tenant → homepage (not forced to app host).
  assert.equal(
    resolveCompleteSignOutDestination({
      hostname: "houzzat.com",
      shell: "web",
      userAgent: "Mozilla/5.0",
    }),
    WEB_SIGNED_OUT_HOME_PATH,
  );

  assert.equal(isSafeSignOutDestination("/pro/sign-in?signedOut=1"), true);
  assert.equal(isSafeSignOutDestination("/?signedOut=1"), true);
  assert.equal(isSafeSignOutDestination(platformCompleteLogoutUrl()), true);
  assert.equal(isSafeSignOutDestination("https://evil.example/logout"), false);
  assert.equal(isSafeSignOutDestination("//evil.example"), false);
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

  assert.ok(transition.includes("Opening your workspace…"));
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

function testLogoutWiring() {
  const hard = read("src/lib/auth/hard-sign-out.ts");
  const route = read("src/app/api/auth/logout/route.ts");
  const button = read("src/components/auth/SignOutButton.tsx");

  assert.ok(hard.includes("resolveCompleteSignOutDestination"));
  assert.ok(hard.includes("platformCompleteLogoutUrl") || hard.includes("resolveDestination"));
  assert.ok(route.includes("resolveCompleteSignOutDestination"));
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
  testLoginRoleMatrixNoProStop();
  testTransitionUiWiring();
  testLogoutWiring();
  testAabParityGateStillPresent();
  console.log("mobile-complete-logout:selftest OK");
}

main();

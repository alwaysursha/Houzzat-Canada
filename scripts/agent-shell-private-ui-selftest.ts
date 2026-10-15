/**
 * Private PRO UI marker — InstantShell vs full responsive CRM.
 * Run: pnpm exec tsx scripts/agent-shell-private-ui-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZATPRO_FULL_CRM_UA_MARKER,
  HOUZZATPRO_PRIVATE_UI_UA_MARKER,
  mapNativeAppId,
  nativeAppIdFromUserAgent,
  resolveRequestAppShell,
  shouldGateStaffRoutesForConsumerShell,
  shouldUseProNativeInstantShell,
} from "../src/lib/mobile/app-shell";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const PROD_PRO_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 HouzzatNative/1 (com.houzzat.pro)";
const FULLCRM_PRO_UA =
  `Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 HouzzatNative/1 (com.houzzat.pro) ${HOUZZATPRO_FULL_CRM_UA_MARKER}`;
const PRIVATE_PRO_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 HouzzatNative/1 (com.houzzat.pro) HouzzatProPrivateUI/1";
const CHROME_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const UNKNOWN_NATIVE_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 HouzzatNative/1 (com.houzzat.pro.private)";

function testInstantShellMatrix() {
  assert.equal(HOUZZATPRO_PRIVATE_UI_UA_MARKER, "HouzzatProPrivateUI/1");
  assert.equal(HOUZZATPRO_FULL_CRM_UA_MARKER, "HouzzatProFullCRM/1");

  // Legacy Play PRO (no FullCRM marker) → InstantShell
  assert.equal(shouldUseProNativeInstantShell(PROD_PRO_UA), true);

  // Production FullCRM candidate → full responsive CRM
  assert.equal(shouldUseProNativeInstantShell(FULLCRM_PRO_UA), false);

  // Private PRO → full responsive CRM (bypass InstantShell)
  assert.equal(shouldUseProNativeInstantShell(PRIVATE_PRO_UA), false);

  // Mobile Chrome → full responsive CRM
  assert.equal(shouldUseProNativeInstantShell(CHROME_MOBILE_UA), false);
  assert.equal(shouldUseProNativeInstantShell(null), false);
  assert.equal(shouldUseProNativeInstantShell(""), false);

  // Unknown native appId (com.houzzat.pro.private) → no InstantShell;
  // staff routes remain gated by resolveRequestAppShell → unknown-native.
  assert.equal(shouldUseProNativeInstantShell(UNKNOWN_NATIVE_UA), false);
}

function testPrivateKeepsTrustedProShellForMiddleware() {
  // Private UA still parses as exact production PRO appId for shell mapping.
  assert.equal(nativeAppIdFromUserAgent(PRIVATE_PRO_UA), "com.houzzat.pro");
  assert.equal(mapNativeAppId("com.houzzat.pro"), "houzzatpro");
  assert.equal(
    resolveRequestAppShell({
      userAgent: PRIVATE_PRO_UA,
      cookieValue: null,
    }),
    "houzzatpro",
  );
  assert.equal(
    shouldGateStaffRoutesForConsumerShell("houzzatpro"),
    false,
  );

  // Production PRO unchanged
  assert.equal(
    resolveRequestAppShell({
      userAgent: PROD_PRO_UA,
      cookieValue: null,
    }),
    "houzzatpro",
  );

  // Chrome remains web (no staff gate from shell)
  assert.equal(
    resolveRequestAppShell({
      userAgent: CHROME_MOBILE_UA,
      cookieValue: null,
    }),
    "web",
  );
  assert.equal(shouldGateStaffRoutesForConsumerShell("web"), false);

  // Unknown native appId → gated (existing restriction)
  assert.equal(nativeAppIdFromUserAgent(UNKNOWN_NATIVE_UA), "com.houzzat.pro.private");
  assert.equal(mapNativeAppId("com.houzzat.pro.private"), "unknown-native");
  assert.equal(
    resolveRequestAppShell({
      userAgent: UNKNOWN_NATIVE_UA,
      cookieValue: null,
    }),
    "unknown-native",
  );
  assert.equal(
    shouldGateStaffRoutesForConsumerShell("unknown-native"),
    true,
  );
}

function testWiring() {
  const shell = read("src/components/agent/AgentShell.tsx");
  assert.ok(shell.includes("shouldUseProNativeInstantShell"));
  assert.ok(shell.includes("if (isProNative && !isChatsPage)"));
  assert.ok(shell.includes("<AgentMobileInstantShell"));

  const appShell = read("src/lib/mobile/app-shell.ts");
  assert.ok(appShell.includes("HOUZZATPRO_PRIVATE_UI_UA_MARKER"));
  assert.ok(appShell.includes("Presentation-only"));
  assert.ok(appShell.includes("Never used for auth"));

  const privateCap = read(
    "android-pro-private/app/src/main/assets/capacitor.config.json",
  );
  assert.ok(privateCap.includes("HouzzatNative/1 (com.houzzat.pro)"));
  assert.ok(privateCap.includes("HouzzatProPrivateUI/1"));

  // Production PRO Capacitor config must NOT carry the private UI marker.
  // FullCRM marker is expected on the 1.0.7+ candidate (after cap sync).
  const prodCap = read("android-pro/app/src/main/assets/capacitor.config.json");
  assert.ok(prodCap.includes("HouzzatNative/1 (com.houzzat.pro)"));
  assert.equal(prodCap.includes("HouzzatProPrivateUI"), false);
  assert.ok(prodCap.includes(HOUZZATPRO_FULL_CRM_UA_MARKER));

  const prodConfigTs = read("capacitor.config.pro.ts");
  assert.equal(prodConfigTs.includes("HouzzatProPrivateUI"), false);
  assert.ok(prodConfigTs.includes(HOUZZATPRO_FULL_CRM_UA_MARKER));
}

function main() {
  testInstantShellMatrix();
  testPrivateKeepsTrustedProShellForMiddleware();
  testWiring();
  console.log("agent-shell-private-ui-selftest: ok");
}

main();

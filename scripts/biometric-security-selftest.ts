/**
 * Phase 4B biometric unlock policy + gate sequencing self-tests.
 * Run: pnpm exec tsx scripts/biometric-security-selftest.ts
 */

import assert from "node:assert/strict";
import {
  decideBiometricGatePhase,
  migrateBiometricMode,
  shouldKeepBiometricsEnabledOnLogout,
  shouldRebindBiometricUser,
  shouldStartBiometricLocked,
  usePasswordRequiresExplicitSignOut,
} from "../src/lib/mobile/biometric-policy";
import {
  __resetBiometricGateStateForTests,
  isBiometricGateLocked,
  onBiometricGateUnlocked,
  setBiometricGateLocked,
} from "../src/lib/mobile/biometric-gate-state";

const memory = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = globalThis;
Object.assign(globalThis, {
  location: {
    pathname: "/",
    search: "",
    hash: "",
    href: "https://houzzat.com/",
    assign() {},
  },
});
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, String(v));
  },
  removeItem: (k) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: () => null,
  get length() {
    return memory.size;
  },
};

async function main() {
  // --- credentials → unlock migration ---
  assert.deepEqual(migrateBiometricMode("credentials"), {
    nextMode: "unlock",
    shouldDeleteNativeCredentials: true,
  });
  assert.deepEqual(migrateBiometricMode("unlock"), {
    nextMode: "unlock",
    shouldDeleteNativeCredentials: false,
  });
  assert.deepEqual(migrateBiometricMode(null), {
    nextMode: "unlock",
    shouldDeleteNativeCredentials: false,
  });

  // --- logout preference ---
  assert.equal(shouldKeepBiometricsEnabledOnLogout(), true);
  assert.equal(usePasswordRequiresExplicitSignOut(), true);

  // --- account switch rebind ---
  assert.equal(
    shouldRebindBiometricUser({ boundUserId: null, sessionUserId: "b" }),
    true,
  );
  assert.equal(
    shouldRebindBiometricUser({ boundUserId: "a", sessionUserId: "b" }),
    true,
  );
  assert.equal(
    shouldRebindBiometricUser({ boundUserId: "a", sessionUserId: "a" }),
    false,
  );
  assert.equal(
    shouldRebindBiometricUser({ boundUserId: "a", sessionUserId: null }),
    false,
  );

  // --- gate phases ---
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: false,
      intentionalSignOut: false,
      sessionStatus: "authenticated",
    }),
    "open",
  );
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: true,
      sessionStatus: "authenticated",
    }),
    "open",
  );
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "loading",
    }),
    "cover",
  );
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "unauthenticated",
    }),
    "signed_out",
  );
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "authenticated",
    }),
    "prompt",
  );
  // Hard Account / soft tab nav: already unlocked this WebView session → open
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "authenticated",
      foregroundSessionUnlocked: true,
    }),
    "open",
  );
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "loading",
      foregroundSessionUnlocked: true,
    }),
    "open",
  );
  // Session gone still wins over fg unlock marker
  assert.equal(
    decideBiometricGatePhase({
      biometricsEnabled: true,
      intentionalSignOut: false,
      sessionStatus: "unauthenticated",
      foregroundSessionUnlocked: true,
    }),
    "signed_out",
  );

  assert.equal(
    shouldStartBiometricLocked({
      biometricsEnabledHint: true,
      foregroundSessionUnlocked: false,
    }),
    true,
  );
  assert.equal(
    shouldStartBiometricLocked({
      biometricsEnabledHint: true,
      foregroundSessionUnlocked: true,
    }),
    false,
  );
  assert.equal(
    shouldStartBiometricLocked({
      biometricsEnabledHint: false,
      foregroundSessionUnlocked: false,
    }),
    false,
  );

  // --- gate lock holds pending push ---
  __resetBiometricGateStateForTests();
  const pending = await import("../src/lib/notifications/pending-push-nav");
  pending.__resetPendingPushNavigationForTests();

  setBiometricGateLocked(true);
  assert.equal(isBiometricGateLocked(), true);
  assert.equal(
    pending.stashPendingPushNavigation({
      href: "/account/notifications",
      id: "bio-push-1",
    }),
    "/account/notifications",
  );

  const { consumePendingPushNavigation } = await import(
    "../src/lib/notifications/push-client"
  );
  consumePendingPushNavigation();
  assert.ok(
    pending.peekPendingPushNavigation(),
    "pending survives while gate locked",
  );

  let unlockedFired = false;
  const unsub = onBiometricGateUnlocked(() => {
    unlockedFired = true;
  });
  setBiometricGateLocked(false);
  assert.equal(unlockedFired, true);
  unsub();
  consumePendingPushNavigation();
  assert.equal(pending.peekPendingPushNavigation(), null);
  assert.equal(pending.takePendingPushNavigation(), null);

  // loadBiometricCredentials must be a no-op (no password path)
  const biometrics = await import("../src/lib/mobile/biometrics");
  assert.equal(await biometrics.loadBiometricCredentials(), null);

  // --- foreground unlock survives hard nav marker; clears on invalidate ---
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k) => memory.get(`ls:${k}`) ?? null,
    setItem: (k, v) => {
      memory.set(`ls:${k}`, String(v));
    },
    removeItem: (k) => {
      memory.delete(`ls:${k}`);
    },
    clear: () => {
      for (const key of [...memory.keys()]) {
        if (key.startsWith("ls:")) memory.delete(key);
      }
    },
    key: () => null,
    get length() {
      return [...memory.keys()].filter((k) => k.startsWith("ls:")).length;
    },
  };

  assert.equal(biometrics.readForegroundUnlockedSync(), false);
  biometrics.markForegroundSessionUnlocked();
  assert.equal(biometrics.readForegroundUnlockedSync(), true);
  // Simulate hard Account document remount reading the same sessionStorage
  assert.equal(
    shouldStartBiometricLocked({
      biometricsEnabledHint: true,
      foregroundSessionUnlocked: biometrics.readForegroundUnlockedSync(),
    }),
    false,
  );
  biometrics.clearForegroundSessionUnlocked();
  assert.equal(biometrics.readForegroundUnlockedSync(), false);
  assert.equal(
    shouldStartBiometricLocked({
      biometricsEnabledHint: true,
      foregroundSessionUnlocked: false,
    }),
    true,
  );

  console.log("biometric-security-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

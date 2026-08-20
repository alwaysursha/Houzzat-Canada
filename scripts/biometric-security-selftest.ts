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

  console.log("biometric-security-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Android hardware-back listener registry.
 *
 * Production: one RN BackHandler subscription fans out LIFO to registered
 * handlers (same order semantics as React Native's BackHandler).
 * Tests: __emitHardwareBackPress() without needing the native module.
 *
 * Safe diagnostics only (source + consumed). No tokens or PII.
 */

export type AndroidHardwareBackHandler = () => boolean | null | undefined;

type RegistryEntry = {
  handler: AndroidHardwareBackHandler;
  source: string;
};

type NativeBridge = {
  addEventListener: (
    eventName: "hardwareBackPress",
    handler: () => boolean,
  ) => { remove: () => void };
  exitApp: () => void;
  isAndroid: boolean;
};

const entries: RegistryEntry[] = [];
let nativeSub: { remove: () => void } | null = null;
let nativeBridge: NativeBridge | null | undefined;
let exitAppCount = 0;
let lastEvent: {
  at: number;
  source: string;
  consumed: boolean;
  trigger: string;
} | null = null;

function resolveNativeBridge(): NativeBridge | null {
  if (nativeBridge !== undefined) return nativeBridge;
  try {
    // Deferred load: node selftests must not require Metro's react-native.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native") as {
      BackHandler: {
        addEventListener: NativeBridge["addEventListener"];
        exitApp: () => void;
      };
      Platform: { OS: string };
    };
    nativeBridge = {
      addEventListener: RN.BackHandler.addEventListener.bind(RN.BackHandler),
      exitApp: () => RN.BackHandler.exitApp(),
      isAndroid: RN.Platform.OS === "android",
    };
  } catch {
    nativeBridge = null;
  }
  return nativeBridge;
}

function recordDiag(
  source: string,
  consumed: boolean,
  trigger: string,
): void {
  lastEvent = { at: Date.now(), source, consumed, trigger };
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // Dev-only breadcrumb for real-device "did JS receive hardwareBackPress?"
    console.log(
      `[AndroidBack] trigger=${trigger} source=${source} consumed=${consumed}`,
    );
  }
}

function ensureNativeSubscription(): void {
  if (nativeSub) return;
  const bridge = resolveNativeBridge();
  if (!bridge?.isAndroid) return;
  nativeSub = bridge.addEventListener("hardwareBackPress", () =>
    dispatchAndroidHardwareBackPress("native"),
  );
}

function maybeTearDownNativeSubscription(): void {
  if (entries.length > 0 || !nativeSub) return;
  nativeSub.remove();
  nativeSub = null;
}

/**
 * Register a LIFO hardware-back handler. Removed on cleanup.
 * Mirrors BackHandler.addEventListener("hardwareBackPress", ...).
 */
export function addAndroidHardwareBackListener(
  handler: AndroidHardwareBackHandler,
  source = "handler",
): { remove: () => void } {
  const entry: RegistryEntry = { handler, source };
  entries.push(entry);
  ensureNativeSubscription();
  return {
    remove: () => {
      const idx = entries.lastIndexOf(entry);
      if (idx >= 0) entries.splice(idx, 1);
      maybeTearDownNativeSubscription();
    },
  };
}

/**
 * Dispatch hardwareBackPress LIFO. Returns true if a handler consumed it.
 * If none consume, mirrors RN default → exitApp().
 */
export function dispatchAndroidHardwareBackPress(
  trigger: "native" | "test-emit" = "test-emit",
): boolean {
  recordDiag("dispatch", false, trigger);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry) continue;
    const consumed = Boolean(entry.handler());
    recordDiag(entry.source, consumed, trigger);
    if (consumed) return true;
  }
  exitAppCount += 1;
  recordDiag("exitApp", true, trigger);
  const bridge = resolveNativeBridge();
  bridge?.exitApp();
  return false;
}

export function androidHardwareBackExitApp(): void {
  exitAppCount += 1;
  recordDiag("exitApp-explicit", true, "explicit");
  const bridge = resolveNativeBridge();
  if (bridge) {
    bridge.exitApp();
    return;
  }
}

export function getLastAndroidHardwareBackEvent(): typeof lastEvent {
  return lastEvent;
}

/** Test / diagnostics helpers — no secrets. */
export function __emitHardwareBackPress(): boolean {
  return dispatchAndroidHardwareBackPress("test-emit");
}

export function __getAndroidHardwareBackListenerCount(): number {
  return entries.length;
}

export function __getAndroidHardwareBackExitAppCount(): number {
  return exitAppCount;
}

export function __resetAndroidHardwareBackForTests(): void {
  entries.length = 0;
  exitAppCount = 0;
  lastEvent = null;
  if (nativeSub) {
    nativeSub.remove();
    nativeSub = null;
  }
  // Force re-resolve so tests stay detached from any stubbed RN.
  nativeBridge = undefined;
}

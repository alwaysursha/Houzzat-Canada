"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useSession } from "next-auth/react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBiometricGateLocked } from "@/lib/mobile/biometric-gate-state";
import {
  decideBiometricGatePhase,
  shouldStartBiometricLocked,
} from "@/lib/mobile/biometric-policy";
import {
  clearForegroundSessionUnlocked,
  getBiometricAvailability,
  isBiometricsEnabled,
  markForegroundSessionUnlocked,
  migrateLegacyBiometricCredentialsOnce,
  prepareExplicitSignOut,
  readBiometricEarlyGateSync,
  readForegroundUnlockedSync,
  reconcileBiometricsForSession,
  verifyBiometricIdentity,
  wasIntentionalSignOut,
} from "@/lib/mobile/biometrics";
import { consumePendingPushNavigation } from "@/lib/notifications/push-client";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const BACKGROUND_LOCK_MS = 15_000;
const FADE_MS = 220;

/**
 * Biometric privacy gate for the Capacitor app.
 * Protects an existing Auth.js session — never recreates it from a password.
 *
 * Presentation: Home (or current route) loads normally underneath.
 * Unlock uses the native Android/Knox biometric sheet — we do NOT show a
 * full-screen green “window” or heavy blur behind it.
 * A transparent interaction shield blocks taps until unlock.
 * Compact retry UI appears only after a failed/cancelled native prompt.
 */
export function BiometricLockGate() {
  const { status, data } = useSession();
  const sessionUserId = data?.user?.id ?? null;

  const earlySync = readBiometricEarlyGateSync();
  const initialFgUnlocked = readForegroundUnlockedSync();
  const [native] = useState(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  });
  const [enabled, setEnabled] = useState(earlySync);
  const [intentionalOut, setIntentionalOut] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [fgUnlocked, setFgUnlocked] = useState(initialFgUnlocked);
  const [locked, setLocked] = useState(() =>
    shouldStartBiometricLocked({
      biometricsEnabledHint: Boolean(native && earlySync),
      foregroundSessionUnlocked: initialFgUnlocked,
    }),
  );
  const [privacyCover, setPrivacyCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Biometric unlock");
  /** True after native prompt fails/cancels — show compact retry, not a splash. */
  const [needsRetryUi, setNeedsRetryUi] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const unlockedAtRef = useRef(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const promptingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const intentionalRef = useRef(intentionalOut);
  const statusRef = useRef(status);
  const lockedRef = useRef(locked);

  enabledRef.current = enabled;
  intentionalRef.current = intentionalOut;
  statusRef.current = status;
  lockedRef.current = locked;

  const sessionStatus =
    status === "loading"
      ? "loading"
      : status === "authenticated"
        ? "authenticated"
        : "unauthenticated";

  const phase = decideBiometricGatePhase({
    biometricsEnabled: Boolean(native && enabled && !intentionalOut),
    intentionalSignOut: intentionalOut,
    sessionStatus: prefsReady || earlySync ? sessionStatus : "loading",
    foregroundSessionUnlocked: fgUnlocked,
  });

  const showCover =
    native &&
    (privacyCover ||
      phase === "cover" ||
      (phase === "prompt" && locked));

  useLayoutEffect(() => {
    if (!native) return;
    if (readForegroundUnlockedSync()) {
      setFgUnlocked(true);
      setLocked(false);
      setBiometricGateLocked(false);
      return;
    }
    if (readBiometricEarlyGateSync()) {
      setBiometricGateLocked(true);
    }
  }, [native]);

  useEffect(() => {
    if (showCover) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [showCover]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    void (async () => {
      await migrateLegacyBiometricCredentialsOnce();
      if (cancelled) return;
      const intentional = await wasIntentionalSignOut();
      const on = await isBiometricsEnabled();
      const availability = await getBiometricAvailability();
      if (cancelled) return;
      setIntentionalOut(intentional);
      setEnabled(on);
      setLabel(availability.label);
      setPrefsReady(true);
      if (intentional || !on) {
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
        setLocked(false);
        setBiometricGateLocked(false);
        return;
      }
      if (readForegroundUnlockedSync()) {
        setFgUnlocked(true);
        setLocked(false);
        setBiometricGateLocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native]);

  useEffect(() => {
    if (!native || !enabled || intentionalOut) return;
    if (status !== "authenticated" || !sessionUserId) return;
    void reconcileBiometricsForSession({ userId: sessionUserId });
  }, [native, enabled, intentionalOut, status, sessionUserId]);

  useEffect(() => {
    if (phase === "open" || phase === "signed_out") {
      if (phase === "signed_out") {
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
      }
      setLocked(false);
      setPrivacyCover(false);
      setNeedsRetryUi(false);
      setError(null);
      setBiometricGateLocked(false);
      return;
    }
    if (phase === "cover") {
      setBiometricGateLocked(true);
      return;
    }
    if (phase === "prompt") {
      setLocked(true);
      setBiometricGateLocked(true);
    }
  }, [phase]);

  const unlockFlow = useCallback(async () => {
    if (promptingRef.current) return;
    if (phase !== "prompt") return;
    promptingRef.current = true;
    setBusy(true);
    setError(null);
    // While the OS/Knox sheet is up, hide our custom card so Home stays visible.
    setNeedsRetryUi(false);

    try {
      if (statusRef.current !== "authenticated") {
        setError("Session expired. Sign in to continue.");
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
        setLocked(false);
        setBiometricGateLocked(false);
        return;
      }

      const ok = await verifyBiometricIdentity(`Unlock ${SITE_NAME}`);
      if (!ok) {
        setError(`Couldn’t verify ${label}. Try again.`);
        setNeedsRetryUi(true);
        return;
      }
      unlockedAtRef.current = Date.now();
      markForegroundSessionUnlocked();
      setFgUnlocked(true);
      setLocked(false);
      setPrivacyCover(false);
      setNeedsRetryUi(false);
      setBiometricGateLocked(false);
      consumePendingPushNavigation();
    } finally {
      setBusy(false);
      promptingRef.current = false;
    }
  }, [phase, label]);

  // Auto-open the native biometric sheet once — no custom splash first.
  useEffect(() => {
    if (phase !== "prompt" || !locked) return;
    if (needsRetryUi) return;
    const t = window.setTimeout(() => {
      void unlockFlow();
    }, 280);
    return () => window.clearTimeout(t);
  }, [phase, locked, needsRetryUi, unlockFlow]);

  useEffect(() => {
    if (!native) return;

    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        backgroundedAtRef.current = Date.now();
        if (enabledRef.current && !intentionalRef.current) {
          setPrivacyCover(true);
        }
        return;
      }

      const away = backgroundedAtRef.current
        ? Date.now() - backgroundedAtRef.current
        : 0;
      backgroundedAtRef.current = null;

      if (away < BACKGROUND_LOCK_MS) {
        if (!lockedRef.current) setPrivacyCover(false);
        return;
      }

      if (Date.now() - unlockedAtRef.current < 2_000) {
        setPrivacyCover(false);
        return;
      }

      void (async () => {
        if (await wasIntentionalSignOut()) {
          setPrivacyCover(false);
          return;
        }
        if (!(await isBiometricsEnabled())) {
          setPrivacyCover(false);
          return;
        }
        if (statusRef.current !== "authenticated") {
          setPrivacyCover(false);
          return;
        }
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
        setError(null);
        setNeedsRetryUi(false);
        setLocked(true);
        setBiometricGateLocked(true);
      })();
    });

    return () => {
      void sub.then((handle) => handle.remove());
    };
  }, [native]);

  async function onUsePassword() {
    setBusy(true);
    try {
      await prepareExplicitSignOut();
      window.location.assign("/api/auth/logout");
    } catch {
      setBusy(false);
      setError("Couldn’t sign out. Try again.");
      setNeedsRetryUi(true);
    }
  }

  if (!mounted) return null;

  const promptUi = phase === "prompt" && locked;
  const showRetryCard = promptUi && needsRetryUi && !busy;
  /** Soft dim only while backgrounded (app switcher privacy) — not during unlock. */
  const appSwitcherCover = privacyCover && !locked;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[300] flex flex-col items-center justify-end",
        "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
        "transition-opacity ease-out",
        visible ? "opacity-100" : "opacity-0",
        // Transparent shield while native biometrics run — Home stays sharp underneath.
        // Slight dim only for app-switcher privacy, never a green blurred window.
        appSwitcherCover ? "bg-ink/40" : "bg-transparent",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Houzzat"
      aria-busy={busy}
    >
      {/* Invisible hit-catcher — blocks interaction; does not obscure Home. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 cursor-default"
        onClick={(e) => {
          e.preventDefault();
          if (showRetryCard) return;
          if (promptUi && !busy) void unlockFlow();
        }}
      />

      {showRetryCard ? (
        <div
          className={cn(
            "relative z-10 mx-4 mb-6 w-full max-w-sm rounded-2xl border border-line bg-surface px-5 py-5 text-ink shadow-[0_12px_40px_rgb(10_47_36/0.22)]",
            "transition-transform ease-out",
            visible ? "translate-y-0" : "translate-y-3",
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          <div className="flex flex-col items-center gap-3.5 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-canopy/10 text-canopy">
              <Fingerprint className="size-7" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-ink">
                Unlock {SITE_NAME}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                Use {label} to continue. Home is ready underneath.
              </p>
              {error ? (
                <p className="mt-2 text-sm font-medium text-signal">{error}</p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => void unlockFlow()}
                className="h-12 w-full"
              >
                {busy ? "Checking…" : `Unlock with ${label}`}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={busy}
                onClick={() => void onUsePassword()}
                className="h-11 w-full"
              >
                Sign in another way
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
const FADE_MS = 260;

/**
 * Biometric privacy gate for the Capacitor app.
 * Protects an existing Auth.js session — never recreates it from a password.
 *
 * Presentation: translucent blur over the live app shell + compact unlock card
 * (not a separate full-screen green splash). Interaction stays blocked until unlock.
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

  // Fade the overlay in/out without remounting private content underneath.
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

  // Preferences + migration — once on native mount.
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

  // Align lock with phase — never re-lock while foreground session is unlocked.
  useEffect(() => {
    if (phase === "open" || phase === "signed_out") {
      if (phase === "signed_out") {
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
      }
      setLocked(false);
      setPrivacyCover(false);
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

    try {
      // Reuse SessionProvider state — no duplicate getSession() here.
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
        return;
      }
      unlockedAtRef.current = Date.now();
      markForegroundSessionUnlocked();
      setFgUnlocked(true);
      setLocked(false);
      setPrivacyCover(false);
      setBiometricGateLocked(false);
      consumePendingPushNavigation();
    } finally {
      setBusy(false);
      promptingRef.current = false;
    }
  }, [phase, label]);

  useEffect(() => {
    if (phase !== "prompt" || !locked) return;
    const t = window.setTimeout(() => {
      void unlockFlow();
    }, 350);
    return () => window.clearTimeout(t);
  }, [phase, locked, unlockFlow]);

  // Single appStateChange listener for the native lifetime of this mount.
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
        // Background timeout invalidates foreground unlock for this session.
        clearForegroundSessionUnlocked();
        setFgUnlocked(false);
        setError(null);
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
    }
  }

  if (!mounted) return null;

  const promptUi = phase === "prompt" && locked;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[300] flex flex-col items-center justify-end sm:justify-center",
        "bg-canopy/50 backdrop-blur-xl transition-opacity ease-out",
        "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Houzzat"
    >
      {/* Extra privacy veil so signed-in chrome cannot be read through blur */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canopy/35 via-ink/25 to-ink/45"
        aria-hidden
      />

      <div
        className={cn(
          "relative z-10 mx-4 mb-8 w-full max-w-sm rounded-2xl border border-white/20 bg-canopy px-5 py-6 text-white shadow-[0_16px_48px_rgb(10_47_36/0.35)] sm:mb-0",
          "transition-transform ease-out",
          visible ? "translate-y-0" : "translate-y-3",
        )}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        {promptUi ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className={cn(
                "flex size-16 items-center justify-center rounded-full bg-white/15",
                busy && "animate-pulse",
              )}
            >
              <Fingerprint className="size-8" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">
                Unlock {SITE_NAME}
              </p>
              <p className="mt-1 text-sm text-white/75">
                Confirm it’s you with {label}.
              </p>
              {error ? (
                <p className="mt-2.5 text-sm font-medium text-amber-100">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => void unlockFlow()}
                className="h-12 w-full bg-white text-canopy-deep hover:bg-white/90"
              >
                {busy ? "Checking…" : `Unlock with ${label}`}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={busy}
                onClick={() => void onUsePassword()}
                className="h-11 w-full border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                Sign in another way
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="size-14 rounded-full bg-white/10" aria-hidden />
            <p className="text-sm text-white/70">Preparing unlock…</p>
          </div>
        )}
      </div>
    </div>
  );
}

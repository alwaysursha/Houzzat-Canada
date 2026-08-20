"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useSession } from "next-auth/react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBiometricGateLocked } from "@/lib/mobile/biometric-gate-state";
import { decideBiometricGatePhase } from "@/lib/mobile/biometric-policy";
import {
  getBiometricAvailability,
  isBiometricsEnabled,
  migrateLegacyBiometricCredentialsOnce,
  prepareExplicitSignOut,
  readBiometricEarlyGateSync,
  reconcileBiometricsForSession,
  verifyBiometricIdentity,
  wasIntentionalSignOut,
} from "@/lib/mobile/biometrics";
import { consumePendingPushNavigation } from "@/lib/notifications/push-client";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const BACKGROUND_LOCK_MS = 15_000;

/**
 * Full-screen biometric gate for the Capacitor app.
 * Protects access to an existing Auth.js session — never recreates it
 * from a stored password.
 */
export function BiometricLockGate() {
  const { status, data } = useSession();
  const sessionUserId = data?.user?.id ?? null;

  const earlySync = readBiometricEarlyGateSync();
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
  const [locked, setLocked] = useState(Boolean(native && earlySync));
  const [privacyCover, setPrivacyCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Biometric unlock");

  const unlockedAtRef = useRef(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const promptingRef = useRef(false);
  const unlockedThisSessionRef = useRef(false);
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
  });

  const showCover =
    native &&
    (privacyCover ||
      phase === "cover" ||
      (phase === "prompt" && locked));

  useLayoutEffect(() => {
    if (!native) return;
    if (readBiometricEarlyGateSync()) {
      setBiometricGateLocked(true);
    }
  }, [native]);

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
        unlockedThisSessionRef.current = true;
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

  // Align lock with phase without re-locking after a successful unlock.
  useEffect(() => {
    if (phase === "open" || phase === "signed_out") {
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
      if (!unlockedThisSessionRef.current) {
        setLocked(true);
        setBiometricGateLocked(true);
      }
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
        unlockedThisSessionRef.current = true;
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
      unlockedThisSessionRef.current = true;
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
        setError(null);
        unlockedThisSessionRef.current = false;
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

  if (!showCover) return null;

  const promptUi = phase === "prompt" && locked;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-canopy text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Houzzat"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
        <p className="font-display text-4xl tracking-tight">{SITE_NAME}</p>
        {promptUi ? (
          <>
            <div
              className={cn(
                "flex size-20 items-center justify-center rounded-full bg-white/15",
                busy && "animate-pulse",
              )}
            >
              <Fingerprint className="size-10" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="max-w-sm text-center">
              <p className="text-lg font-semibold">Unlock with {label}</p>
              <p className="mt-1.5 text-sm text-white/75">
                Confirm it’s you to open your saved homes and watchlist.
              </p>
              {error ? (
                <p className="mt-3 text-sm font-medium text-amber-100">{error}</p>
              ) : null}
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2.5">
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
                className="h-12 w-full border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                Sign in another way
              </Button>
            </div>
          </>
        ) : (
          <div className="size-20 rounded-full bg-white/10" aria-hidden />
        )}
      </div>
    </div>
  );
}

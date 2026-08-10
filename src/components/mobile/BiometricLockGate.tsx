"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { getSession, signIn } from "next-auth/react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBiometricAvailability,
  getBiometricMode,
  isBiometricsEnabled,
  loadBiometricCredentials,
  verifyBiometricIdentity,
} from "@/lib/mobile/biometrics";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const BACKGROUND_LOCK_MS = 15_000;

/**
 * Full-screen biometric gate for the Capacitor app.
 * - Session still valid → verify → unlock
 * - Session expired + stored credentials → biometric re-sign-in
 * - Otherwise → Unlock retry / Use password (dismiss + open sign-in)
 */
export function BiometricLockGate() {
  const [active, setActive] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Biometrics");
  const unlockedAtRef = useRef(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const promptingRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      const enabled = await isBiometricsEnabled();
      if (cancelled || !enabled) return;
      const availability = await getBiometricAvailability();
      if (cancelled) return;
      setLabel(availability.label);
      setActive(true);
      setLocked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlockFlow = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const mode = await getBiometricMode();
      const session = await getSession();

      if (session?.user) {
        const ok = await verifyBiometricIdentity(`Unlock ${SITE_NAME}`);
        if (!ok) {
          setError(`Couldn’t verify ${label}. Try again.`);
          return;
        }
        unlockedAtRef.current = Date.now();
        setLocked(false);
        return;
      }

      if (mode === "credentials") {
        const creds = await loadBiometricCredentials();
        if (!creds) {
          setError("No saved login found. Sign in with your password.");
          return;
        }
        const result = await signIn("credentials", {
          email: creds.email,
          password: creds.password,
          redirect: false,
        });
        if (result?.error) {
          setError("Saved login failed. Sign in with your password.");
          return;
        }
        unlockedAtRef.current = Date.now();
        setLocked(false);
        return;
      }

      // Unlock-only (e.g. Google) with no session — must sign in manually.
      setError("Session expired. Sign in to continue.");
    } finally {
      setBusy(false);
      promptingRef.current = false;
    }
  }, [label]);

  useEffect(() => {
    if (!active || !locked) return;
    const t = window.setTimeout(() => {
      void unlockFlow();
    }, 350);
    return () => window.clearTimeout(t);
  }, [active, locked, unlockFlow]);

  useEffect(() => {
    if (!active) return;

    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const away = backgroundedAtRef.current
        ? Date.now() - backgroundedAtRef.current
        : 0;
      backgroundedAtRef.current = null;
      if (away < BACKGROUND_LOCK_MS) return;
      if (Date.now() - unlockedAtRef.current < 2_000) return;
      void (async () => {
        if (!(await isBiometricsEnabled())) return;
        setError(null);
        setLocked(true);
      })();
    });

    return () => {
      void sub.then((handle) => handle.remove());
    };
  }, [active]);

  if (!active || !locked) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-canopy text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Houzzat"
    >
      <div
        className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      >
        <p className="font-display text-4xl tracking-tight">{SITE_NAME}</p>
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
            onClick={() => {
              unlockedAtRef.current = Date.now();
              setLocked(false);
              window.dispatchEvent(new Event("houzzat:open-sign-in"));
            }}
            className="h-12 w-full border-white/30 bg-transparent text-white hover:bg-white/10"
          >
            Use password
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  disableBiometrics,
  enableBiometricsUnlockOnly,
  enableBiometricsWithCredentials,
  getBiometricAvailability,
  getBiometricMode,
  isBiometricsEnabled,
} from "@/lib/mobile/biometrics";

/**
 * Account settings: enable/disable Face ID or fingerprint on native only.
 * Credentials users can store email+password in Keystore; Google-only = unlock gate.
 */
export function BiometricsAccountToggle({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const { confirm, toast } = useSiteAlert();
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("Biometrics");
  const [mode, setMode] = useState<"credentials" | "unlock" | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const refresh = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setVisible(false);
      return;
    }
    const availability = await getBiometricAvailability();
    if (!availability.available) {
      setVisible(false);
      return;
    }
    setLabel(availability.label);
    setVisible(true);
    setEnabled(await isBiometricsEnabled());
    setMode(await getBiometricMode());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!visible) return null;

  async function onDisable() {
    const ok = await confirm({
      title: `Turn off ${label}?`,
      message:
        "You’ll need your password (or Google) to sign in again. Saved login on this device will be cleared.",
      confirmLabel: "Turn off",
      cancelLabel: "Keep on",
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    try {
      await disableBiometrics();
      setEnabled(false);
      setMode(null);
      setShowPassword(false);
      setPassword("");
      toast({ message: `${label} turned off.`, tone: "success" });
    } finally {
      setPending(false);
    }
  }

  async function onEnableUnlockOnly() {
    setPending(true);
    try {
      const result = await enableBiometricsUnlockOnly();
      if (!result.ok) {
        toast({ message: result.error, tone: "error" });
        return;
      }
      setEnabled(true);
      setMode("unlock");
      toast({ message: `${label} enabled.`, tone: "success" });
    } finally {
      setPending(false);
    }
  }

  async function onEnableWithPassword() {
    if (!password) {
      toast({ message: "Enter your password to save a quick login.", tone: "error" });
      return;
    }
    setPending(true);
    try {
      const result = await enableBiometricsWithCredentials({
        email,
        password,
      });
      if (!result.ok) {
        toast({ message: result.error, tone: "error" });
        return;
      }
      setEnabled(true);
      setMode("credentials");
      setShowPassword(false);
      setPassword("");
      toast({
        message: `${label} enabled — unlock or quick sign-in on this device.`,
        tone: "success",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 md:hidden">
      <div>
        <h2 className="font-semibold text-ink">{label}</h2>
        <p className="mt-1 text-sm text-ink/55">
          {enabled
            ? mode === "credentials"
              ? `Unlock Houzzat and sign back in quickly with ${label}.`
              : `Unlock Houzzat with ${label} while signed in. Sign in again if your session expires.`
            : hasPassword
              ? `Use ${label} to unlock the app and sign in faster next time.`
              : `Use ${label} to unlock the app while you’re signed in.`}
        </p>
      </div>

      {enabled ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => void onDisable()}
        >
          {pending ? "Updating…" : `Turn off ${label}`}
        </Button>
      ) : showPassword && hasPassword ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/45">
              Password
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your Houzzat password"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => void onEnableWithPassword()}
            >
              {pending ? "Enabling…" : `Enable ${label}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setShowPassword(false);
                setPassword("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (hasPassword) {
              setShowPassword(true);
              return;
            }
            void onEnableUnlockOnly();
          }}
        >
          {pending ? "Enabling…" : `Enable ${label}`}
        </Button>
      )}
    </section>
  );
}

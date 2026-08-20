"use client";

import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  disableBiometrics,
  enableBiometricsUnlockOnly,
  getBiometricAvailability,
  isBiometricsEnabled,
} from "@/lib/mobile/biometrics";
import { useCallback, useEffect, useState } from "react";

/**
 * Account settings: enable/disable biometric app unlock on native only.
 * Unlock-only — never stores email/password.
 */
export function BiometricsAccountToggle({
  email: _email,
  hasPassword: _hasPassword,
  userId,
}: {
  email: string;
  hasPassword: boolean;
  userId?: string | null;
}) {
  const { confirm, toast } = useSiteAlert();
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("Biometric unlock");
  const [unavailableHint, setUnavailableHint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setVisible(false);
      return;
    }
    const availability = await getBiometricAvailability();
    setLabel(availability.label);
    if (!availability.available) {
      setVisible(true);
      setEnabled(false);
      setUnavailableHint(
        availability.errorCode != null
          ? `${availability.label} isn’t set up or is temporarily unavailable. Check your device security settings.`
          : `This device doesn’t support ${availability.label.toLowerCase()}.`,
      );
      return;
    }
    setUnavailableHint(null);
    setVisible(true);
    setEnabled(await isBiometricsEnabled());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!visible) return null;

  async function onDisable() {
    const ok = await confirm({
      title: `Turn off ${label}?`,
      message:
        "You’ll unlock Houzzat without biometrics on this device. Your account stays signed in.",
      confirmLabel: "Turn off",
      cancelLabel: "Keep on",
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    try {
      await disableBiometrics();
      setEnabled(false);
      toast({ message: `${label} turned off.`, tone: "success" });
    } finally {
      setPending(false);
    }
  }

  async function onEnable() {
    setPending(true);
    try {
      const result = await enableBiometricsUnlockOnly({ userId });
      if (!result.ok) {
        toast({ message: result.error, tone: "error" });
        return;
      }
      setEnabled(true);
      toast({
        message: `${label} enabled — protects this app while you’re signed in.`,
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
          {unavailableHint
            ? unavailableHint
            : enabled
              ? `Unlock Houzzat with ${label} while signed in. If your session expires, sign in normally — biometrics never recreate your login.`
              : `Use ${label} to protect the app on this device while you’re signed in. Your password is never stored for biometrics.`}
        </p>
      </div>

      {unavailableHint ? null : enabled ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => void onDisable()}
        >
          {pending ? "Updating…" : `Turn off ${label}`}
        </Button>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() => void onEnable()}
        >
          {pending ? "Enabling…" : `Enable ${label}`}
        </Button>
      )}
    </section>
  );
}

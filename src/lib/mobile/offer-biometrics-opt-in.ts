"use client";

import {
  enableBiometricsUnlockOnly,
  getBiometricAvailability,
  markBiometricsOptInOffered,
  shouldOfferBiometricsOptIn,
} from "@/lib/mobile/biometrics";

type ConfirmFn = (options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) => Promise<boolean>;

/**
 * After a successful email/password sign-in on native, offer biometric unlock once.
 * Unlock-only — does not store the password.
 */
export async function offerBiometricsAfterCredentialsSignIn(input: {
  email: string;
  password: string;
  confirm: ConfirmFn;
  userId?: string | null;
}): Promise<void> {
  void input.email;
  void input.password;
  if (!(await shouldOfferBiometricsOptIn())) return;

  const availability = await getBiometricAvailability();
  const accepted = await input.confirm({
    title: `Use ${availability.label}?`,
    message: `Protect Houzzat on this device with ${availability.label} while you’re signed in. Your password is not stored.`,
    confirmLabel: `Enable ${availability.label}`,
    cancelLabel: "Not now",
  });

  await markBiometricsOptInOffered();
  if (!accepted) return;

  await enableBiometricsUnlockOnly({ userId: input.userId });
}

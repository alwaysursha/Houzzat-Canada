"use client";

import {
  enableBiometricsWithCredentials,
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
 * After a successful email/password sign-in on native, offer Face ID / fingerprint once.
 */
export async function offerBiometricsAfterCredentialsSignIn(input: {
  email: string;
  password: string;
  confirm: ConfirmFn;
}): Promise<void> {
  if (!(await shouldOfferBiometricsOptIn())) return;

  const availability = await getBiometricAvailability();
  const accepted = await input.confirm({
    title: `Use ${availability.label} next time?`,
    message: `Unlock Houzzat and sign in faster with ${availability.label}. Your password stays on this device in secure storage.`,
    confirmLabel: `Enable ${availability.label}`,
    cancelLabel: "Not now",
  });

  await markBiometricsOptInOffered();
  if (!accepted) return;

  await enableBiometricsWithCredentials({
    email: input.email,
    password: input.password,
  });
}

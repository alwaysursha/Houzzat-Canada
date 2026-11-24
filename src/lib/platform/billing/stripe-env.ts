/**
 * Stage 6.8B — Stripe server env (secret key + webhook signing secret only).
 * Never expose these to the client. Never log raw values.
 */

import { assertStagingStripeCredentials } from "@/lib/platform/billing/staging-isolation";
import { readHouzzatProStagingOrigin } from "@/lib/platform/billing/staging-origin";

export class StripeConfigError extends Error {
  readonly code = "STRIPE_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

export function readStripeSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  assertStagingStripeCredentials(env);
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) {
    throw new StripeConfigError("STRIPE_SECRET_KEY is not configured.");
  }
  if (!key.startsWith("sk_")) {
    throw new StripeConfigError("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

export function readStripeWebhookSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    throw new StripeConfigError("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  if (!secret.startsWith("whsec_")) {
    throw new StripeConfigError(
      "STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.",
    );
  }
  return secret;
}

/** True when both secrets are present (does not validate with Stripe). */
export function isStripeBillingConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (readHouzzatProStagingOrigin(env).status !== "absent") {
    try {
      assertStagingStripeCredentials(env);
    } catch {
      return false;
    }
    const whsec = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
    return whsec.startsWith("whsec_");
  }
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const whsec = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  return key.startsWith("sk_") && whsec.startsWith("whsec_");
}

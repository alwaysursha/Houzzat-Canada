/**
 * Stage 6.8B — Stripe server env (secret key + webhook signing secret only).
 * Never expose these to the client. Never log raw values.
 */

export class StripeConfigError extends Error {
  readonly code = "STRIPE_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

export function readStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) {
    throw new StripeConfigError("STRIPE_SECRET_KEY is not configured.");
  }
  if (!key.startsWith("sk_")) {
    throw new StripeConfigError("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

export function readStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
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
export function isStripeBillingConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const whsec = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  return key.startsWith("sk_") && whsec.startsWith("whsec_");
}

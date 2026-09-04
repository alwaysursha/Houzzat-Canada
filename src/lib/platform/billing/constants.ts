/** Stage 6.8B — Stripe Checkout foundation constants (no Workspace provisioning). */

export const STRIPE_BILLING_AUDIT = {
  CHECKOUT_CREATED: "STRIPE_CHECKOUT_CREATED",
  CHECKOUT_COMPLETED: "STRIPE_CHECKOUT_COMPLETED",
  SUBSCRIPTION_ACTIVATED: "SUBSCRIPTION_ACTIVATED",
  PAYMENT_FAILED: "STRIPE_PAYMENT_FAILED",
} as const;

export const SUBSCRIPTION_ENTITY_TYPE = "Subscription";

/** Informational return path after Stripe-hosted Checkout (never payment authority). */
export const STRIPE_CHECKOUT_STATUS_PATH = "/subscribe/payment/status";

export const STRIPE_CHECKOUT_METADATA_KEYS = {
  offerId: "offerId",
  subscriptionId: "subscriptionId",
  prospectId: "prospectId",
} as const;

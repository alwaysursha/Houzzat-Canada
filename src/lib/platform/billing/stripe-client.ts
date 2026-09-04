/**
 * Stage 6.8B — Stripe SDK client for Cloudflare Workers / OpenNext.
 * Uses fetch HTTP client (nodejs_compat). Server-side secret only.
 */

import Stripe from "stripe";
import { readStripeSecretKey } from "@/lib/platform/billing/stripe-env";

let cached: Stripe | null = null;

export function getStripeClient(secretKey?: string): Stripe {
  if (secretKey) {
    return new Stripe(secretKey, {
      httpClient: Stripe.createFetchHttpClient(),
      typescript: true,
    });
  }
  if (cached) return cached;
  cached = new Stripe(readStripeSecretKey(), {
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
  });
  return cached;
}

/** Test helper — clear cached client. */
export function clearStripeClientCacheForTests(): void {
  cached = null;
}

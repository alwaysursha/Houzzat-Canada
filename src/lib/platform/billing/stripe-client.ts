/**
 * Stage 6.8B — Stripe SDK client for Cloudflare Workers / OpenNext.
 * Uses fetch HTTP client (nodejs_compat). Server-side secret only.
 */

import Stripe from "stripe";
import { readStripeSecretKey } from "@/lib/platform/billing/stripe-env";
import { assertStagingStripeCredentials } from "@/lib/platform/billing/staging-isolation";
import {
  readHouzzatProStagingOrigin,
  StagingBillingSafetyError,
} from "@/lib/platform/billing/staging-origin";

let cached: Stripe | null = null;

function assertExplicitStagingSecret(secretKey: string): void {
  const staging = readHouzzatProStagingOrigin();
  if (staging.status === "absent") return;
  if (secretKey.startsWith("sk_live_") || !secretKey.startsWith("sk_test_")) {
    throw new StagingBillingSafetyError(
      "Staging requires a Stripe test secret key.",
    );
  }
  assertStagingStripeCredentials();
}

export function getStripeClient(secretKey?: string): Stripe {
  if (secretKey) {
    assertExplicitStagingSecret(secretKey);
    return new Stripe(secretKey, {
      httpClient: Stripe.createFetchHttpClient(),
      typescript: true,
    });
  }
  assertStagingStripeCredentials();
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

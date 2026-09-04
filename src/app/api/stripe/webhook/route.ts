import { NextResponse } from "next/server";
import { processStripeWebhook } from "@/lib/platform/billing/webhook";

export const runtime = "nodejs";

/**
 * Stripe webhook — signature-verified payment authority for SaaS Checkout.
 * Browser success redirects must never activate Subscriptions.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  try {
    const result = await processStripeWebhook({
      rawBody,
      signatureHeader: signature,
    });
    return NextResponse.json({
      ok: true,
      received: result.received,
      handled: result.handled,
      action: result.action,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    // Do not leak secrets; signature failures return 400 for Stripe retries.
    const status =
      /signature|Stripe-Signature|webhook secret/i.test(message) ? 400 : 500;
    console.error("[stripe-webhook] processing error", message);
    return NextResponse.json({ ok: false, error: "webhook_error" }, { status });
  }
}

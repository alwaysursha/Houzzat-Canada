import { NextResponse } from "next/server";
import {
  allowCheckoutPaymentStatusRequest,
  isPlausibleStripeCheckoutSessionId,
  resolveCheckoutPaymentStatus,
} from "@/lib/platform/billing";
import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const runtime = "nodejs";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    },
  });
}

/**
 * GET ?session_id=cs_…
 * Read-only webhook-authoritative payment/provision status for the return page.
 * Never activates Subscription.
 */
export async function GET(request: Request) {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname || !isHouzzatProPlatformRoot(hostname)) {
    return noStoreJson({ ok: false, code: "NOT_FOUND", message: "Not found" }, 404);
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
  if (!isPlausibleStripeCheckoutSessionId(sessionId)) {
    return noStoreJson(
      { ok: false, code: "INVALID_SESSION", message: "Invalid checkout session." },
      400,
    );
  }

  const clientIp = clientIpFromPublicRequest(request);
  if (
    !allowCheckoutPaymentStatusRequest({
      clientIp,
      sessionIdPrefix: sessionId.slice(0, 24),
    })
  ) {
    return noStoreJson(
      { ok: false, code: "RATE_LIMITED", message: "Too many requests." },
      429,
    );
  }

  const status = await resolveCheckoutPaymentStatus({
    stripeCheckoutSessionId: sessionId,
  });

  return noStoreJson({
    ok: true,
    data: {
      phase: status.phase,
      nextAction: status.nextAction,
      paymentConfirmed: status.paymentConfirmed,
      provisioningComplete: status.provisioningComplete,
      activationRequired: status.activationRequired,
      activationComplete: status.activationComplete,
      provisioningRecoverable: status.provisioningRecoverable,
      // Intentionally omit workspaceId / emails / tokens from poll payload.
    },
  });
}

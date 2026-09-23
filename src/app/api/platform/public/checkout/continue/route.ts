import { NextResponse } from "next/server";
import {
  allowCheckoutPaymentStatusRequest,
  continueAfterCheckoutPayment,
  isPlausibleStripeCheckoutSessionId,
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
 * POST { session_id }
 * Server-mediated continue into activation or Pro sign-in after authoritative ready state.
 * Never activates Subscription. Does not expose prior email activation tokens.
 */
export async function POST(request: Request) {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname || !isHouzzatProPlatformRoot(hostname)) {
    return noStoreJson({ ok: false, code: "NOT_FOUND", message: "Not found" }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson(
      { ok: false, code: "INVALID_REQUEST", message: "Invalid request." },
      400,
    );
  }

  const sessionId =
    body &&
    typeof body === "object" &&
    "session_id" in body &&
    typeof (body as { session_id?: unknown }).session_id === "string"
      ? (body as { session_id: string }).session_id.trim()
      : "";

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
      sessionIdPrefix: `continue:${sessionId.slice(0, 24)}`,
    })
  ) {
    return noStoreJson(
      { ok: false, code: "RATE_LIMITED", message: "Too many requests." },
      429,
    );
  }

  const result = await continueAfterCheckoutPayment({
    stripeCheckoutSessionId: sessionId,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_READY"
        ? 409
        : result.code === "UNKNOWN_SESSION"
          ? 404
          : result.code === "FAILED"
            ? 400
            : 409;
    return noStoreJson(
      { ok: false, code: result.code, message: result.message },
      status,
    );
  }

  return noStoreJson({
    ok: true,
    data: {
      kind: result.kind,
      url: result.url,
    },
  });
}

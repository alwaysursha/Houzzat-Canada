import { NextResponse } from "next/server";
import {
  allowOfferCheckoutRequest,
  createCheckoutForAcceptedOffer,
  OfferCheckoutPublicError,
} from "@/lib/platform/billing";
import { hashCommercialOfferToken } from "@/lib/platform/offers/token";
import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

function publicError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false as const, code, message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
}

function resolveReturnOrigin(request: Request, hostname: string): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https");
  const hostHeader =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    hostname;
  return `${proto}://${hostHeader}`;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const hostname = extractTrustedRequestHostname(request);
    if (!hostname || !isHouzzatProPlatformRoot(hostname)) {
      return publicError(
        403,
        "PLATFORM_HOST_REQUIRED",
        "This action is only available on the HouzzatPRO website.",
      );
    }

    const { token } = await context.params;
    const rawToken = typeof token === "string" ? token : "";
    if (!rawToken || rawToken.length < 16) {
      return publicError(
        404,
        "OFFER_UNAVAILABLE",
        "This private offer is no longer available.",
      );
    }

    // Reject bodies that try to supply commercial authority.
    const text = await request.text();
    if (text.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        return publicError(400, "INVALID_BODY", "Unable to start Checkout.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return publicError(400, "INVALID_BODY", "Unable to start Checkout.");
      }
      for (const key of Object.keys(body as Record<string, unknown>)) {
        // Checkout accepts an empty body only — no client commercial fields.
        return publicError(400, "INVALID_FIELD", "Unable to start Checkout.");
      }
    }

    const clientIp = clientIpFromPublicRequest(request);
    const tokenHashPrefix = hashCommercialOfferToken(rawToken).slice(0, 16);
    if (!allowOfferCheckoutRequest({ clientIp, tokenHashPrefix })) {
      return publicError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      );
    }

    const result = await createCheckoutForAcceptedOffer({
      rawToken,
      returnOrigin: resolveReturnOrigin(request, hostname),
    });

    return NextResponse.json(
      {
        ok: true as const,
        data: {
          // Embedded Checkout client secret only — never Stripe customer/sub ids.
          clientSecret: result.clientSecret,
        },
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  } catch (error) {
    if (error instanceof OfferCheckoutPublicError) {
      return publicError(error.status, error.code, error.message);
    }
    console.error("[platform-public-offer-checkout] unhandled error", error);
    return publicError(
      500,
      "INTERNAL_ERROR",
      "Unable to start Checkout right now. Please try again shortly.",
    );
  }
}

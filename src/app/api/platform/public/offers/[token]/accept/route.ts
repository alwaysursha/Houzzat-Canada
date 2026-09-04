import { NextResponse } from "next/server";
import {
  acceptPrivateOfferByRawToken,
  OfferAcceptPublicError,
} from "@/lib/platform/offers/accept";
import { allowOfferAcceptRequest } from "@/lib/platform/offers/accept-rate-limit";
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

function publicOk(data: {
  outcome: "accepted" | "already_accepted";
  offerId: string;
}) {
  return NextResponse.json(
    {
      ok: true as const,
      data: {
        accepted: true,
        outcome: data.outcome,
        // Never return legal versions as client authority; never return hash/email.
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
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

    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      const parsed = text.trim() ? (JSON.parse(text) as unknown) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return publicError(400, "INVALID_BODY", "Please complete the form and try again.");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return publicError(400, "INVALID_BODY", "Please complete the form and try again.");
    }

    // Reject client attempts to supply legal versions / commercial authority.
    for (const key of [
      "termsVersion",
      "privacyVersion",
      "commercialTermsHash",
      "negotiatedRecurringAmountCents",
      "setupFeeCents",
      "planCode",
      "lineItems",
      "offerId",
      "status",
    ]) {
      if (key in body) {
        return publicError(400, "INVALID_FIELD", "Please complete the form and try again.");
      }
    }

    const clientIp = clientIpFromPublicRequest(request);
    const tokenHashPrefix = hashCommercialOfferToken(rawToken).slice(0, 16);
    if (!allowOfferAcceptRequest({ clientIp, tokenHashPrefix })) {
      return publicError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      );
    }

    const result = await acceptPrivateOfferByRawToken({
      rawToken,
      email: typeof body.email === "string" ? body.email : "",
      acceptTerms: body.acceptTerms === true,
      acceptPrivacy: body.acceptPrivacy === true,
      acceptCommercialTerms: body.acceptCommercialTerms === true,
      ipAddress: clientIp === "unknown" ? null : clientIp,
      userAgent: request.headers.get("user-agent"),
    });

    return publicOk({
      outcome: result.outcome,
      offerId: result.offerId,
    });
  } catch (error) {
    if (error instanceof OfferAcceptPublicError) {
      return publicError(error.status, error.code, error.message);
    }
    console.error("[platform-public-offer-accept] unhandled error", error);
    return publicError(
      500,
      "INTERNAL_ERROR",
      "Unable to accept this offer right now. Please try again shortly.",
    );
  }
}

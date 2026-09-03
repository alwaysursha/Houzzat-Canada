import { NextResponse } from "next/server";
import {
  allowBookDemoRequest,
  assertBookDemoPlatformHostname,
  BookDemoPublicError,
  BOOK_DEMO_HONEYPOT_FIELD,
  clientIpFromPublicRequest,
  receiveWebsiteDemoRequest,
} from "@/lib/platform/public";
import { notifyBookDemoEmails } from "@/lib/platform/public/book-demo-emails";
import { BOOK_DEMO_TURNSTILE_ERROR_MESSAGE } from "@/lib/platform/public/turnstile-constants";
import { verifyTurnstileToken } from "@/lib/platform/public/turnstile-verify";
import { normalizeProspectEmail } from "@/lib/platform/prospects/normalize-email";

export const runtime = "nodejs";

function publicOk() {
  return NextResponse.json({ ok: true as const, data: { received: true } });
}

function publicError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false as const, code, message },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    assertBookDemoPlatformHostname(request);

    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (!text.trim()) {
        return publicError(400, "INVALID_BODY", "Please complete the form and try again.");
      }
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return publicError(400, "INVALID_BODY", "Please complete the form and try again.");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return publicError(400, "INVALID_BODY", "Please complete the form and try again.");
    }

    // Reject privileged / injection fields — public intake only.
    for (const key of [
      "status",
      "ownerOperatorId",
      "notesInternal",
      "source",
      "operatorId",
      "prospectId",
      "id",
    ]) {
      if (key in body) {
        return publicError(400, "INVALID_FIELD", "Please complete the form and try again.");
      }
    }

    const clientIp = clientIpFromPublicRequest(request);
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : "";

    // Fail closed BEFORE any prospect / activity / audit writes.
    await verifyTurnstileToken({
      token: turnstileToken,
      remoteIp: clientIp,
    });

    const email =
      typeof body.email === "string" ? normalizeProspectEmail(body.email) : "";
    if (!allowBookDemoRequest({ clientIp, email: email || "unknown" })) {
      return publicError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      );
    }

    const teamSizeRaw = body.teamSize;
    const teamSize =
      typeof teamSizeRaw === "number"
        ? teamSizeRaw
        : typeof teamSizeRaw === "string" && teamSizeRaw.trim()
          ? Number(teamSizeRaw)
          : Number.NaN;

    const intake = await receiveWebsiteDemoRequest({
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      email: typeof body.email === "string" ? body.email : "",
      phone: typeof body.phone === "string" ? body.phone : "",
      brokerageName:
        typeof body.brokerageName === "string" ? body.brokerageName : "",
      teamSize,
      website: typeof body.website === "string" ? body.website : null,
      region: typeof body.region === "string" ? body.region : null,
      message: typeof body.message === "string" ? body.message : null,
      faxNumber:
        typeof body[BOOK_DEMO_HONEYPOT_FIELD] === "string"
          ? (body[BOOK_DEMO_HONEYPOT_FIELD] as string)
          : null,
    });

    // Persistence is authoritative. Email failures must never fail intake.
    if (intake.outcome !== "honeypot" && intake.emailPayload) {
      try {
        await notifyBookDemoEmails({
          prospectId: intake.prospectId,
          activityId: intake.activityId,
          fields: intake.emailPayload,
        });
      } catch (error) {
        console.error(
          "[platform-public-book-demo] notification side-effect failed",
          error instanceof Error ? error.message : "error",
        );
      }
    }

    // Always identical success — no existence / outcome / email-status leak.
    return publicOk();
  } catch (error) {
    if (error instanceof BookDemoPublicError) {
      const message =
        error.code.startsWith("TURNSTILE_")
          ? BOOK_DEMO_TURNSTILE_ERROR_MESSAGE
          : error.message;
      return publicError(error.status, error.code, message);
    }
    console.error("[platform-public-book-demo] unhandled error", error);
    return publicError(
      500,
      "INTERNAL_ERROR",
      "Unable to submit your request right now. Please try again shortly.",
    );
  }
}

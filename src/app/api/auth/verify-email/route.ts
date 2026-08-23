import { NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";
import { VERIFY_EMAIL_PROVIDER_ID } from "@/lib/auth/verify-email-constants";

const schema = z.object({
  token: z.string().trim().min(10).max(200),
});

/**
 * Legacy email links may still point here. GET is inert — redirect to the
 * verification page without consuming the token (scanner-safe).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const callbackUrl = safeInternalCallbackUrl(
    url.searchParams.get("callbackUrl"),
    "/",
  );

  const pageUrl = new URL("/auth/verify-email", request.url);
  if (token) {
    pageUrl.searchParams.set("token", token);
  } else {
    pageUrl.searchParams.set("error", "missing");
  }
  if (callbackUrl !== "/") {
    pageUrl.searchParams.set("callbackUrl", callbackUrl);
  }

  return NextResponse.redirect(pageUrl);
}

/** Programmatic verify (POST). Prefer browser signIn on /auth/verify-email. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const callbackUrl = safeInternalCallbackUrl(
    typeof body === "object" &&
      body !== null &&
      "callbackUrl" in body &&
      typeof (body as { callbackUrl?: unknown }).callbackUrl === "string"
      ? (body as { callbackUrl: string }).callbackUrl
      : null,
    "/",
  );

  try {
    const result = await signIn(VERIFY_EMAIL_PROVIDER_ID, {
      token: parsed.data.token,
      redirect: false,
    });
    if (result && typeof result === "object" && "error" in result && result.error) {
      return NextResponse.json(
        { error: "Verification link expired or invalid." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, callbackUrl });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      const message = (error as { message: string }).message;
      if (message === "ACCOUNT_DISABLED") {
        return NextResponse.json(
          {
            error:
              "This account has been disabled. Contact Houzzat support.",
          },
          { status: 403 },
        );
      }
      if (message === "STAFF_ACCOUNT") {
        return NextResponse.json(
          { error: "Use your team sign-in page for this account." },
          { status: 403 },
        );
      }
    }
    return NextResponse.json(
      { error: "Verification link expired or invalid." },
      { status: 400 },
    );
  }
}

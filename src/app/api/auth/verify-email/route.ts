import { NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";
import { VERIFY_EMAIL_PROVIDER_ID } from "@/lib/auth/verify-email-constants";

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const schema = z.object({
  token: z.string().trim().min(10).max(200),
});

function verifyPageRedirect(
  request: Request,
  params: { error?: string; callbackUrl?: string },
) {
  const url = new URL("/auth/verify-email", request.url);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.callbackUrl && params.callbackUrl !== "/") {
    url.searchParams.set("callbackUrl", params.callbackUrl);
  }
  return NextResponse.redirect(url);
}

/**
 * Email links land here: consume token via Auth.js, establish session, redirect.
 * Legacy /auth/verify-email?token= pages forward to this route.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const callbackUrl = safeInternalCallbackUrl(
    url.searchParams.get("callbackUrl"),
    "/",
  );

  if (!token) {
    return verifyPageRedirect(request, { error: "missing", callbackUrl });
  }

  try {
    await signIn(VERIFY_EMAIL_PROVIDER_ID, {
      token,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    return verifyPageRedirect(request, { error: "invalid", callbackUrl });
  }

  return NextResponse.redirect(new URL(callbackUrl, request.url));
}

/** Programmatic verify without session (legacy). Prefer GET + Auth.js signIn. */
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
    if (result && "error" in result && result.error) {
      return NextResponse.json(
        { error: "Verification link expired or invalid." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, callbackUrl });
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    return NextResponse.json(
      { error: "Verification link expired or invalid." },
      { status: 400 },
    );
  }
}

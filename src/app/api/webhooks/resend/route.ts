import { NextResponse } from "next/server";
import { handleResendWebhook } from "@/lib/email/resend-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleResendWebhook(rawBody, request.headers);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    handled: result.handled,
    type: result.type ?? null,
  });
}

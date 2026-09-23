import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PASSWORD_RESET_MIN_LENGTH,
  consumePasswordResetToken,
  peekPasswordResetToken,
} from "@/lib/auth/password-reset";

const peekSchema = z.object({
  token: z.string().trim().min(10).max(200),
});

const consumeSchema = z.object({
  token: z.string().trim().min(10).max(200),
  password: z
    .string()
    .min(PASSWORD_RESET_MIN_LENGTH, "Password must be at least 8 characters.")
    .max(128),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = peekSchema.safeParse({ token: url.searchParams.get("token") });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const peek = await peekPasswordResetToken(parsed.data.token);
  if (!peek.ok) {
    return NextResponse.json(
      { ok: false, error: peek.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = consumeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter a new password of at least 8 characters.",
      },
      { status: 400 },
    );
  }

  const result = await consumePasswordResetToken(
    parsed.data.token,
    parsed.data.password,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    workspaceId: result.workspaceId,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  consumeEmailVerificationToken,
  peekEmailVerificationToken,
} from "@/lib/auth/email-verification";

const schema = z.object({
  token: z.string().trim().min(10).max(200),
});

/**
 * Verify email for the currently signed-in customer when the token belongs
 * to them — no sign-out, no Auth.js credentials re-login.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

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

  const peek = await peekEmailVerificationToken(parsed.data.token);
  if (!peek.ok) {
    return NextResponse.json(
      { error: peek.error, code: peek.code },
      { status: 400 },
    );
  }

  if (peek.userId !== session.user.id) {
    return NextResponse.json(
      {
        error:
          "This verification link belongs to a different account. Please sign out first.",
        code: "different_user",
      },
      { status: 403 },
    );
  }

  if (peek.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const consumed = await consumeEmailVerificationToken(parsed.data.token);
  if (!consumed.ok) {
    return NextResponse.json({ error: consumed.error }, { status: 400 });
  }

  if (consumed.user.id !== session.user.id) {
    return NextResponse.json(
      { error: "Verification could not be completed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

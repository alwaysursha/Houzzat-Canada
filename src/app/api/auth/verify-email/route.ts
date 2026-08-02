import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeEmailVerificationToken } from "@/lib/auth/email-verification";

const schema = z.object({
  token: z.string().trim().min(10).max(200),
});

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

  const result = await consumeEmailVerificationToken(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email: result.email });
}

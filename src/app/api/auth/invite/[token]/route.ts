import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acceptOrganizationInvite,
  loadInvitePreview,
} from "@/lib/agent/accept-invite";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const acceptSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const preview = await loadInvitePreview(token);
  if (!preview) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  return NextResponse.json({ invite: preview });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const session = await auth();
  const actingUserId = session?.user?.id ?? null;

  const result = await acceptOrganizationInvite({
    token,
    actingUserId,
    name: parsed.data.name,
    password: parsed.data.password,
  });

  if (!result.ok) {
    const status =
      result.code === "NEED_SIGN_IN"
        ? 401
        : result.code === "WRONG_ACCOUNT"
          ? 403
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: result.userId,
    createdAccount: result.createdAccount,
  });
}

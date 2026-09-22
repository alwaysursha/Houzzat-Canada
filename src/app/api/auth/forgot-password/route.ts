import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PASSWORD_RESET_COOLDOWN_MS,
  requestPasswordReset,
  resolvePasswordResetContext,
} from "@/lib/auth/password-reset";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";

const schema = z.object({
  email: z.string().trim().email().max(254),
});

const lastSentByKey = new Map<string, number>();

function opaqueOk() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const email = normalizeIdentityEmail(parsed.data.email);
  const { origin, siteName, workspaceId } =
    await resolvePasswordResetContext(request);

  // Phase 3: reset only on tenant hosts with a resolved workspace.
  if (!workspaceId) {
    return opaqueOk();
  }

  const cooldownKey = `${workspaceId}:${email}`;
  const last = lastSentByKey.get(cooldownKey) ?? 0;
  if (Date.now() - last < PASSWORD_RESET_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Please wait a minute before requesting another email." },
      { status: 429 },
    );
  }

  lastSentByKey.set(cooldownKey, Date.now());

  try {
    await requestPasswordReset({ email, origin, siteName, workspaceId });
  } catch (error) {
    console.error("[password-reset] request failed", error);
  }

  return opaqueOk();
}

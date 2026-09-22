import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { isEmailVerified } from "@/lib/account-access";
import {
  isEmailSendConfigured,
  sendEmailVerification,
  VERIFY_RESEND_COOLDOWN_MS,
} from "@/lib/auth/email-verification";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";

const schema = z.object({
  callbackUrl: z.string().trim().max(500).optional(),
});

const lastSentByUser = new Map<string, number>();

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", requiresAuth: true },
      { status: 401 },
    );
  }

  if (isEmailVerified(user)) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (!isEmailSendConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured yet. Ask your agent to verify your account, or try again once email sending is enabled.",
        emailNotConfigured: true,
      },
      { status: 503 },
    );
  }

  const last = lastSentByUser.get(user.id) ?? 0;
  if (Date.now() - last < VERIFY_RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Please wait a minute before requesting another email." },
      { status: 429 },
    );
  }

  let callbackUrl: string | undefined;
  try {
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (parsed.success) {
      const raw = parsed.data.callbackUrl;
      if (raw?.startsWith("/")) callbackUrl = raw;
    }
  } catch {
    // empty body ok
  }

  if (!user.workspaceId) {
    return NextResponse.json(
      { error: "Verification is only available for workspace accounts." },
      { status: 400 },
    );
  }

  const result = await sendEmailVerification({
    email: user.email,
    name: user.name,
    callbackUrl,
    customerId: user.id,
    workspaceId: user.workspaceId,
  });

  if (result === "failed") {
    return NextResponse.json(
      { error: "Could not send verification email." },
      { status: 502 },
    );
  }

  lastSentByUser.set(user.id, Date.now());

  // Best-effort activity on CRM leads.
  scheduleWorkerSideEffect(
    prisma.lead
      .findMany({
        where: { customerId: user.id },
        select: { id: true },
        take: 10,
      })
      .then((leads) =>
        leads.length
          ? prisma.leadActivity.createMany({
              data: leads.map((lead) => ({
                leadId: lead.id,
                userId: user.id,
                type: "email_verification_requested",
                body: "Customer requested email verification",
              })),
            })
          : undefined,
      ),
  );

  return NextResponse.json({
    ok: true,
    sent: result === "sent",
    skipped: result === "skipped",
  });
}

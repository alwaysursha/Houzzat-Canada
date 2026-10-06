import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { rehashPhoneCredentialForEdit } from "@/lib/auth/phone-credential";
import { sendPhoneOtp } from "@/lib/auth/phone-otp";
import { prisma } from "@/lib/prisma";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";

const schema = z.object({
  phone: z.string().trim().min(7).max(40),
});

/**
 * Edit phone during onboarding: update canonical phone, invalidate old OTPs,
 * rehash PHONE_E164 credential when applicable, send new OTP.
 * Does not create another User or Lead.
 */
export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user?.workspaceId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid mobile number." },
      { status: 400 },
    );
  }

  const row = await prisma.user.findFirst({
    where: { id: user.id, workspaceId: user.workspaceId },
    select: {
      passwordCredentialKind: true,
      phoneOtpVerifiedAt: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const phoneColumns = parsePhoneColumnsForWrite(parsed.data.phone);
  if (!phoneColumns.ok || !phoneColumns.columns.phoneE164) {
    return NextResponse.json(
      { error: "Enter a valid mobile number." },
      { status: 400 },
    );
  }
  const phoneE164 = phoneColumns.columns.phoneE164;

  // Invalidate outstanding OTP challenges for this user in this workspace.
  await prisma.phoneOtpChallenge.updateMany({
    where: {
      workspaceId: user.workspaceId,
      userId: user.id,
      consumedAt: null,
    },
    data: { consumedAt: new Date(), expiresAt: new Date() },
  });

  let passwordHash: string | undefined;
  if (row.passwordCredentialKind === "PHONE_E164") {
    const rehashed = await rehashPhoneCredentialForEdit(phoneE164);
    if (!rehashed.ok) {
      return NextResponse.json({ error: rehashed.error }, { status: 400 });
    }
    passwordHash = rehashed.hash;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: phoneColumns.columns.phone ?? null,
      phoneE164: phoneColumns.columns.phoneE164 ?? null,
      phoneOtpVerifiedAt: null,
      ...(passwordHash ? { password: passwordHash } : {}),
    },
  });

  const sent = await sendPhoneOtp({
    db: prisma,
    workspaceId: user.workspaceId,
    userId: user.id,
    phoneE164,
  });
  if (!sent.ok) {
    return NextResponse.json(
      {
        ok: true,
        phoneUpdated: true,
        otpError: sent.error,
        resendAvailableAt: sent.resendAvailableAt ?? null,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    phoneUpdated: true,
    maskedPhone: sent.maskedPhone,
    resendAvailableAt: sent.resendAvailableAt,
  });
}

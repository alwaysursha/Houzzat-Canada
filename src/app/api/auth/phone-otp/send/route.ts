import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { sendPhoneOtp } from "@/lib/auth/phone-otp";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await requireCustomerUser();
  if (!user?.workspaceId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const row = await prisma.user.findFirst({
    where: { id: user.id, workspaceId: user.workspaceId },
    select: {
      phoneE164: true,
      phoneOtpVerifiedAt: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (row.phoneOtpVerifiedAt) {
    return NextResponse.json({
      ok: true,
      alreadyVerified: true,
      maskedPhone: null,
    });
  }
  const phoneE164 = row.phoneE164;
  if (!phoneE164) {
    return NextResponse.json(
      { error: "Add a mobile number first." },
      { status: 400 },
    );
  }

  const result = await sendPhoneOtp({
    db: prisma,
    workspaceId: user.workspaceId,
    userId: user.id,
    phoneE164,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        resendAvailableAt: result.resendAvailableAt ?? null,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    maskedPhone: result.maskedPhone,
    resendAvailableAt: result.resendAvailableAt,
  });
}

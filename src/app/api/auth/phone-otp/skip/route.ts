import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { scheduleAgentNewLeadSignupSms } from "@/lib/sms/automations/triggers";

/**
 * Skip OTP — retain phone, leave phoneOtpVerifiedAt null, continue funnel.
 * Does not roll back User or Lead.
 */
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
      leads: {
        where: { workspaceId: user.workspaceId },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Idempotent agent SMS if create-time send was missed; never arms welcome chat.
  const leadId = row.leads[0]?.id;
  if (leadId) {
    scheduleAgentNewLeadSignupSms(leadId);
  }

  return NextResponse.json({
    ok: true,
    phoneRetained: Boolean(row.phoneE164),
    phoneOtpVerified: Boolean(row.phoneOtpVerifiedAt),
  });
}

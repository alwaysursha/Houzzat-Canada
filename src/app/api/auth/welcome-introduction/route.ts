/**
 * Arm Customer Introduction (welcome chat/SMS) after qualification + ~60s
 * active browsing. Idempotent via SmsAutomationDispatch cycle key.
 */
import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { scheduleCustomerIntroductionSmsAutomationsForLead } from "@/lib/sms/automations";

export async function POST() {
  const user = await requireCustomerUser();
  if (!user?.workspaceId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const row = await prisma.user.findFirst({
    where: { id: user.id, workspaceId: user.workspaceId },
    select: {
      qualificationCompletedAt: true,
      phoneE164: true,
      phone: true,
      leads: {
        where: { workspaceId: user.workspaceId, source: "SIGNUP" },
        select: { id: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!row?.qualificationCompletedAt) {
    return NextResponse.json(
      { ok: false, reason: "qualification_incomplete" },
      { status: 409 },
    );
  }

  const leadId = row.leads[0]?.id;
  if (!leadId) {
    return NextResponse.json({ ok: false, reason: "no_signup_lead" }, { status: 404 });
  }

  // Skip when the buyer already started a human chat.
  const priorCustomerChat = await prisma.message.findFirst({
    where: {
      leadId,
      senderKind: "CUSTOMER",
      channel: "CHAT",
    },
    select: { id: true },
  });
  if (priorCustomerChat) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "customer_chat_exists",
    });
  }

  scheduleCustomerIntroductionSmsAutomationsForLead(leadId);
  return NextResponse.json({ ok: true, scheduled: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { verifyPhoneOtp } from "@/lib/auth/phone-otp";
import { prisma } from "@/lib/prisma";
import { scheduleSignupSmsAutomations } from "@/lib/sms/automations/triggers";

const schema = z.object({
  code: z.string().trim().min(4).max(12),
});

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
      { error: "Enter the 6-digit code." },
      { status: 400 },
    );
  }

  const result = await verifyPhoneOtp({
    db: prisma,
    workspaceId: user.workspaceId,
    userId: user.id,
    code: parsed.data.code,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const lead = await prisma.lead.findFirst({
    where: { customerId: user.id, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (lead) scheduleSignupSmsAutomations(lead.id);

  return NextResponse.json({ ok: true });
}

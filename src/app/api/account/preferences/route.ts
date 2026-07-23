import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  emailAlertsEnabled: z.boolean().optional(),
  smsAlertsEnabled: z.boolean().optional(),
  phone: z.string().trim().max(40).optional(),
});

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailAlertsEnabled: parsed.data.emailAlertsEnabled,
      smsAlertsEnabled: parsed.data.smsAlertsEnabled,
      phone: parsed.data.phone,
      caslConsentAt:
        parsed.data.emailAlertsEnabled || parsed.data.smsAlertsEnabled
          ? user.caslConsentAt ?? new Date()
          : user.caslConsentAt,
    },
    select: {
      emailAlertsEnabled: true,
      smsAlertsEnabled: true,
      phone: true,
      vowAcceptedAt: true,
      vowVersion: true,
    },
  });

  return NextResponse.json({ ok: true, preferences: updated });
}

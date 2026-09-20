import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import {
  logContactActivityForCustomer,
  logLeadActivityForCustomer,
} from "@/lib/agent/log-contact-activity";
import { prisma } from "@/lib/prisma";
import { phoneColumnsForWrite } from "@/lib/sms/e164";
import { scheduleUnsubscribeSmsAutomations } from "@/lib/sms/automations";

const schema = z.object({
  emailAlertsEnabled: z.boolean().optional(),
  smsAlertsEnabled: z.boolean().optional(),
  phone: z.string().trim().max(40).optional(),
  relatedListingsMode: z.enum(["SAME_AREA", "SAME_FEATURES"]).optional(),
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

  const phoneProvided = parsed.data.phone !== undefined;
  const phoneValue = phoneProvided
    ? parsed.data.phone?.trim() || null
    : undefined;
  const phoneChanged =
    phoneValue !== undefined && phoneValue !== (user.phone ?? null);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailAlertsEnabled: parsed.data.emailAlertsEnabled,
      smsAlertsEnabled: parsed.data.smsAlertsEnabled,
      ...(phoneValue !== undefined
        ? {
            ...phoneColumnsForWrite(phoneValue),
            phoneUpdateRequestedAt: null,
            ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
          }
        : {}),
      relatedListingsMode: parsed.data.relatedListingsMode,
      caslConsentAt:
        parsed.data.emailAlertsEnabled || parsed.data.smsAlertsEnabled
          ? user.caslConsentAt ?? new Date()
          : user.caslConsentAt,
    },
    select: {
      emailAlertsEnabled: true,
      smsAlertsEnabled: true,
      phone: true,
      relatedListingsMode: true,
      vowAcceptedAt: true,
      vowVersion: true,
    },
  });

  if (
    parsed.data.emailAlertsEnabled === false &&
    user.emailAlertsEnabled !== false
  ) {
    await logLeadActivityForCustomer({
      customerId: user.id,
      type: "unsubscribe",
      body: "Customer turned off email alerts",
      actorUserId: user.id,
      meta: { channel: "email" },
    });
  } else if (
    parsed.data.emailAlertsEnabled === true &&
    user.emailAlertsEnabled === false
  ) {
    await logLeadActivityForCustomer({
      customerId: user.id,
      type: "contact_updated_by_customer",
      body: "Customer re-enabled email alerts",
      actorUserId: user.id,
      meta: { channel: "email", source: "preferences" },
    });
  }

  if (
    parsed.data.smsAlertsEnabled === false &&
    user.smsAlertsEnabled !== false
  ) {
    await logLeadActivityForCustomer({
      customerId: user.id,
      type: "unsubscribe",
      body: "Customer turned off SMS alerts",
      actorUserId: user.id,
      meta: { channel: "sms" },
    });
    scheduleUnsubscribeSmsAutomations(user.id);
  }

  if (phoneChanged) {
    await logContactActivityForCustomer({
      customerId: user.id,
      type: "contact_updated_by_customer",
      body: phoneValue
        ? `Customer updated contact: phone → ${phoneValue}`
        : "Customer updated contact: phone cleared",
      actorUserId: user.id,
      meta: { phone: phoneValue, source: "preferences" },
    });
  }

  return NextResponse.json({ ok: true, preferences: updated });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import {
  applyCanonicalCustomerContact,
} from "@/lib/agent/lead-info-change";
import {
  logContactActivityForCustomer,
  logLeadActivityForCustomer,
} from "@/lib/agent/log-contact-activity";
import { prisma } from "@/lib/prisma";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { scheduleLeadInfoUpdatedForCustomer } from "@/lib/notifications/staff-events";
import {
  scheduleCustomerIntroductionIfFirstValidE164,
  scheduleUnsubscribeSmsAutomations,
} from "@/lib/sms/automations";

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
  const parsedPhone =
    phoneValue !== undefined ? parsePhoneColumnsForWrite(phoneValue) : null;
  if (parsedPhone && !parsedPhone.ok) {
    return NextResponse.json({ error: parsedPhone.error }, { status: 400 });
  }

  let phoneChanges: Awaited<
    ReturnType<typeof applyCanonicalCustomerContact>
  > | null = null;
  if (phoneValue) {
    phoneChanges = await applyCanonicalCustomerContact(prisma, user.id, {
      phone: phoneValue,
    });
    if (!phoneChanges.ok) {
      return NextResponse.json(
        { error: phoneChanges.error },
        { status: phoneChanges.status },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailAlertsEnabled: parsed.data.emailAlertsEnabled,
      smsAlertsEnabled: parsed.data.smsAlertsEnabled,
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
      phoneE164: true,
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

  if (phoneChanges?.ok && phoneChanges.changes.length) {
    await logContactActivityForCustomer({
      customerId: user.id,
      type: "contact_updated_by_customer",
      body: `Customer updated contact: ${phoneChanges.changes.map((c) => c.label).join("; ")}`,
      actorUserId: user.id,
      meta: { source: "preferences", changes: phoneChanges.changes.map((c) => c.label) },
    });
    scheduleLeadInfoUpdatedForCustomer({
      customerId: user.id,
      changes: phoneChanges.changes,
      actorUserId: user.id,
    });
    scheduleCustomerIntroductionIfFirstValidE164({
      customerId: user.id,
      previousPhone: user.phone,
      previousPhoneE164: null,
      nextPhone: updated.phone,
      nextPhoneE164: updated.phoneE164,
    });
  }

  return NextResponse.json({ ok: true, preferences: updated });
}

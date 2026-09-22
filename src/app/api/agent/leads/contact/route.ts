import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { scheduleCustomerIntroductionIfFirstValidE164 } from "@/lib/sms/automations";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const schema = z
  .object({
    leadId: z.string().min(1),
    email: z.string().trim().email().max(200).optional(),
    phone: nullableText(40),
    address: nullableText(300),
  })
  .refine(
    (v) =>
      v.email !== undefined || v.phone !== undefined || v.address !== undefined,
    { message: "Provide email, phone, and/or address" },
  );

export async function PATCH(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: {
      id: true,
      organizationId: true,
      workspaceId: true,
      assignedAgentId: true,
      customerId: true,
      customer: {
        select: { id: true, email: true, phone: true, phoneE164: true, homeAddress: true },
      },
    },
  });

  if (!lead || !canAccessLead(ctx, lead) || !lead.customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextEmail =
    parsed.data.email !== undefined
      ? parsed.data.email.toLowerCase()
      : undefined;
  const nextPhone = parsed.data.phone;
  const nextAddress = parsed.data.address;
  const parsedPhone =
    nextPhone !== undefined ? parsePhoneColumnsForWrite(nextPhone) : null;
  if (parsedPhone && !parsedPhone.ok) {
    return NextResponse.json({ error: parsedPhone.error }, { status: 400 });
  }

  if (nextEmail && nextEmail !== lead.customer.email) {
    const taken = await prisma.user.findFirst({
      where: { email: nextEmail, workspaceId: lead.workspaceId },
      select: { id: true },
    });
    if (taken && taken.id !== lead.customer.id) {
      return NextResponse.json(
        { error: "That email is already in use." },
        { status: 409 },
      );
    }
  }

  const addressChanged =
    nextAddress !== undefined && nextAddress !== lead.customer.homeAddress;

  const updated = await prisma.user.update({
    where: { id: lead.customer.id },
    data: {
      ...(nextEmail !== undefined
        ? {
            email: nextEmail,
            emailUpdateRequestedAt: null,
            ...(nextEmail !== lead.customer.email
              ? { emailVerified: null }
              : {}),
          }
        : {}),
      ...(parsedPhone
        ? {
            ...parsedPhone.columns,
            phoneUpdateRequestedAt: null,
            ...(nextPhone !== lead.customer.phone
              ? { phoneVerifiedAt: null }
              : {}),
          }
        : {}),
      ...(nextAddress !== undefined
        ? {
            homeAddress: nextAddress,
            ...(addressChanged ? { homeLat: null, homeLng: null } : {}),
          }
        : {}),
    },
    select: { email: true, phone: true, phoneE164: true, homeAddress: true },
  });

  const changes: string[] = [];
  if (nextEmail !== undefined && nextEmail !== lead.customer.email) {
    changes.push(`email → ${nextEmail}`);
  }
  if (nextPhone !== undefined && nextPhone !== lead.customer.phone) {
    changes.push(nextPhone ? `phone → ${nextPhone}` : "phone cleared");
  }
  if (addressChanged) {
    changes.push(
      nextAddress ? `address → ${nextAddress}` : "address cleared",
    );
  }

  if (changes.length) {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        type: "contact_update",
        body: changes.join("; "),
        meta: {
          email: updated.email,
          phone: updated.phone,
          homeAddress: updated.homeAddress,
        },
      },
    });
  }

  if (parsedPhone && lead.customer) {
    scheduleCustomerIntroductionIfFirstValidE164({
      customerId: lead.customer.id,
      previousPhone: lead.customer.phone,
      previousPhoneE164: lead.customer.phoneE164,
      nextPhone: updated.phone,
      nextPhoneE164: updated.phoneE164,
    });
  }

  return NextResponse.json({
    ok: true,
    email: updated.email,
    phone: updated.phone,
    phoneE164: updated.phoneE164,
    address: updated.homeAddress,
  });
}

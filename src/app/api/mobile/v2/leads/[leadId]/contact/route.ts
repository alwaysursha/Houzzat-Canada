/**
 * Stage 4.5.2 — PATCH /api/mobile/v2/leads/[leadId]/contact
 *
 * Mirrors PATCH /api/agent/leads/contact for native CRM.
 * Workspace authority: token.wsId ONLY (authorizeMobileLeadAccess).
 * HTTP-mode safe: flat Prisma writes only (no $transaction / updateMany).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";
import { isInvalidContactPhoneError, parsePhoneColumnsForWrite } from "@/lib/sms/e164";

export const runtime = "nodejs";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

/** Path leadId is authoritative — reject client workspace/lead overrides. */
const schema = z
  .object({
    email: z.string().trim().email().max(200).optional(),
    phone: nullableText(40),
    address: nullableText(300),
  })
  .strict()
  .refine(
    (v) =>
      v.email !== undefined || v.phone !== undefined || v.address !== undefined,
    { message: "Provide email, phone, and/or address" },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid contact payload",
        },
        { status: 400 },
      );
    }

    // Re-read customer under the already-authorized lead id only.
    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: {
        id: true,
        customerId: true,
        customer: {
          select: { id: true, email: true, phone: true, homeAddress: true },
        },
      },
    });

    if (!lead?.customer) {
      return NextResponse.json(
        { ok: false, code: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
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
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: parsedPhone.error,
        },
        { status: 400 },
      );
    }

    if (nextEmail && nextEmail !== lead.customer.email) {
      const taken = await prisma.user.findUnique({
        where: { email: nextEmail },
        select: { id: true },
      });
      if (taken && taken.id !== lead.customer.id) {
        return NextResponse.json(
          {
            ok: false,
            code: "EMAIL_IN_USE",
            message: "That email is already in use.",
          },
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
          userId: access.userId,
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

    return NextResponse.json({
      ok: true,
      email: updated.email,
      phone: updated.phone,
      phoneE164: updated.phoneE164,
      address: updated.homeAddress,
    });
  } catch (error: unknown) {
    if (isInvalidContactPhoneError(error)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: error.message },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

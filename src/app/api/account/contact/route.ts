import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { logContactActivityForCustomer } from "@/lib/agent/log-contact-activity";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    email: z.string().trim().email().max(200).optional(),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: "Provide email and/or phone",
  });

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const nextEmail =
    parsed.data.email !== undefined
      ? parsed.data.email.toLowerCase()
      : undefined;
  const nextPhone = parsed.data.phone;

  if (nextEmail && nextEmail !== user.email) {
    const taken = await prisma.user.findUnique({
      where: { email: nextEmail },
      select: { id: true },
    });
    if (taken && taken.id !== user.id) {
      return NextResponse.json(
        { error: "That email is already in use." },
        { status: 409 },
      );
    }
  }

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, phone: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(nextEmail !== undefined
        ? {
            email: nextEmail,
            emailUpdateRequestedAt: null,
            ...(nextEmail !== current.email ? { emailVerified: null } : {}),
          }
        : {}),
      ...(nextPhone !== undefined
        ? {
            phone: nextPhone,
            phoneUpdateRequestedAt: null,
            ...(nextPhone !== current.phone ? { phoneVerifiedAt: null } : {}),
          }
        : {}),
    },
    select: {
      email: true,
      phone: true,
      emailUpdateRequestedAt: true,
      phoneUpdateRequestedAt: true,
    },
  });

  const changes: string[] = [];
  if (nextEmail !== undefined && nextEmail !== current.email) {
    changes.push(`email → ${nextEmail}`);
  }
  if (nextPhone !== undefined && nextPhone !== current.phone) {
    changes.push(nextPhone ? `phone → ${nextPhone}` : "phone cleared");
  }

  if (changes.length) {
    await logContactActivityForCustomer({
      customerId: user.id,
      type: "contact_updated_by_customer",
      body: `Customer updated contact: ${changes.join("; ")}`,
      actorUserId: user.id,
      meta: {
        email: updated.email,
        phone: updated.phone,
        changes,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    email: updated.email,
    phone: updated.phone,
    needPhone:
      !updated.phone?.trim() || updated.phoneUpdateRequestedAt != null,
    needEmail: updated.emailUpdateRequestedAt != null,
  });
}

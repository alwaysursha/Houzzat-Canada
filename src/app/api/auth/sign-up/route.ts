import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { VOW_VERSION } from "@/lib/vow";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  acceptVow: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Please provide name, email, password, and accept client/VOW terms.",
        },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const password = await bcrypt.hash(parsed.data.password, 10);
    const now = new Date();

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        password,
        role: "CUSTOMER",
        vowAcceptedAt: now,
        vowVersion: VOW_VERSION,
        caslConsentAt: now,
        consentEvents: {
          create: {
            kind: "vow_accept",
            version: VOW_VERSION,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    console.error("[sign-up]", error);
    return NextResponse.json(
      { error: "Could not create account." },
      { status: 500 },
    );
  }
}

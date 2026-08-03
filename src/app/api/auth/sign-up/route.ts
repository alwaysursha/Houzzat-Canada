import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { captureWebsiteLead } from "@/lib/agent/lead-intake";
import { sendEmailVerification } from "@/lib/auth/email-verification";
import { TERMS_ACCEPT_KIND, TERMS_VERSION } from "@/lib/consent";
import { prisma } from "@/lib/prisma";
import { VOW_VERSION } from "@/lib/vow";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  acceptTerms: z.literal(true),
  /** buyer (default) | seller — seller signup / sell-a-home paths */
  intent: z.enum(["buyer", "seller"]).optional(),
});

function requestClientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  return { ip, userAgent };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Please provide name, email, password, and accept the Terms & Conditions.",
        },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const password = await bcrypt.hash(parsed.data.password, 10);
    const now = new Date();
    const { ip, userAgent } = requestClientMeta(request);
    const asSeller = parsed.data.intent === "seller";

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        password,
        role: "BUYER",
        isBuyer: true,
        isSeller: asSeller,
        activeMode: asSeller ? "SELLER" : "BUYER",
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        vowAcceptedAt: now,
        vowVersion: VOW_VERSION,
        caslConsentAt: now,
        consentEvents: {
          create: [
            {
              kind: TERMS_ACCEPT_KIND,
              version: TERMS_VERSION,
              email,
              ip,
              userAgent,
            },
            {
              kind: "vow_accept",
              version: VOW_VERSION,
              email,
              ip,
              userAgent,
            },
          ],
        },
      },
    });

    try {
      await captureWebsiteLead({
        source: "SIGNUP",
        customerId: user.id,
        name: user.name,
        email: user.email,
        isBuyer: true,
        isSeller: asSeller,
        score: asSeller ? 40 : 20,
      });
    } catch (err) {
      console.error("[sign-up] lead capture failed", err);
    }

    void sendEmailVerification({
      email,
      name: parsed.data.name,
      callbackUrl: "/account",
    }).catch((err) => {
      console.error("[sign-up] verification email failed", err);
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

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { captureWebsiteLead } from "@/lib/agent/lead-intake";
import {
  sendEmailVerification,
  sendWelcomeEmail,
} from "@/lib/auth/email-verification";
import {
  COMMUNICATIONS_CONSENT_KIND,
  COMMUNICATIONS_CONSENT_VERSION,
  TERMS_ACCEPT_KIND,
  TERMS_VERSION,
} from "@/lib/consent";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { VOW_VERSION } from "@/lib/vow";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128),
  /** Always true from the client — Terms accepted by creating an account. */
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

function validationErrorMessage(error: z.ZodError): string {
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "acceptTerms") {
      return "You must accept the Terms & Conditions.";
    }
    if (issue.message && typeof issue.message === "string") {
      return issue.message;
    }
  }
  return "Please check your name, email, and password.";
}

function duplicateEmailResponse() {
  return NextResponse.json(
    {
      error:
        "An account with this email already exists. Sign in instead, or use a different email.",
    },
    { status: 409 },
  );
}

function mapSignUpFailure(error: unknown): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = error.meta?.target;
      if (
        target === "User_email_key" ||
        (Array.isArray(target) && target.includes("email"))
      ) {
        return duplicateEmailResponse();
      }
    }
  }

  console.error("[sign-up]", error);
  return NextResponse.json(
    {
      error:
        "We couldn't create your account right now. Please try again in a moment.",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid sign-up request. Please try again." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: validationErrorMessage(parsed.error) },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, disabledAt: true },
    });

    if (existing) {
      if (existing.disabledAt) {
        return NextResponse.json(
          {
            error:
              "This account has been disabled. Contact Houzzat support if you need help.",
          },
          { status: 403 },
        );
      }
      return duplicateEmailResponse();
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
            {
              kind: COMMUNICATIONS_CONSENT_KIND,
              version: COMMUNICATIONS_CONSENT_VERSION,
              email,
              ip,
              userAgent,
            },
          ],
        },
      },
    });

    // Respond before Resend / CRM side effects — awaiting them caused Worker
    // timeouts and left users seeing "Could not create account" after a
    // successful DB insert (duplicate email on retry).
    scheduleWorkerSideEffect(
      (async () => {
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

        const [verifyStatus, welcomeStatus] = await Promise.all([
          sendEmailVerification({
            email,
            name: parsed.data.name,
            callbackUrl: "/account",
            customerId: user.id,
          }).catch((err) => {
            console.error("[sign-up] verification email failed", err);
            return "failed" as const;
          }),
          sendWelcomeEmail({
            email,
            name: parsed.data.name,
            customerId: user.id,
          }).catch((err) => {
            console.error("[sign-up] welcome email failed", err);
            return "failed" as const;
          }),
        ]);
        console.info("[sign-up] emails", { email, verifyStatus, welcomeStatus });
      })(),
    );

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    return mapSignUpFailure(error);
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { captureWebsiteLead } from "@/lib/agent/lead-intake";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/auth/existing-account-message";
import { persistSignupConsentEvents } from "@/lib/auth/sign-up-consent";
import {
  sendEmailVerification,
  sendWelcomeEmail,
} from "@/lib/auth/email-verification";
import {
  findTenantUserIdByEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/workspace-identity";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { TERMS_VERSION } from "@/lib/consent";
import { VOW_VERSION } from "@/lib/vow";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

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

type SignUpStage =
  | "tenancy_resolve"
  | "user_lookup"
  | "password_hash"
  | "user_create"
  | "consent_create"
  | "signup_complete";

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

function requestCorrelationId(request: Request): string | undefined {
  return (
    request.headers.get("cf-ray") ||
    request.headers.get("x-request-id") ||
    undefined
  );
}

function logSignUpStage(
  stage: SignUpStage,
  meta?: { correlationId?: string; userId?: string },
) {
  console.info("[sign-up]", { stage, ...meta });
}

function logSignUpFailure(
  stage: SignUpStage,
  error: unknown,
  correlationId?: string,
) {
  const prismaCode =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : undefined;
  const errorName = error instanceof Error ? error.name : undefined;
  const message =
    error instanceof Error
      ? error.message.slice(0, 240)
      : String(error).slice(0, 240);

  console.error("[sign-up]", {
    stage,
    prismaCode,
    errorName,
    message,
    correlationId,
  });
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
    { error: EXISTING_ACCOUNT_SIGN_IN_MESSAGE },
    { status: 409 },
  );
}

function mapSignUpFailure(
  error: unknown,
  stage: SignUpStage,
  correlationId?: string,
): NextResponse {
  logSignUpFailure(stage, error, correlationId);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return duplicateEmailResponse();
    }
  }

  return NextResponse.json(
    {
      error:
        "We couldn't create your account right now. Please try again in a moment.",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);

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

  const email = normalizeIdentityEmail(parsed.data.email);
  let stage: SignUpStage = "tenancy_resolve";

  try {
    logSignUpStage(stage, { correlationId });
    const tenancy = await resolveRequestTenancy(request);
    if (!tenancy.ok) {
      return NextResponse.json(
        {
          error:
            "Sign-up is only available on a workspace website. Open your brokerage site and try again.",
        },
        { status: 400 },
      );
    }
    const workspaceId = tenancy.workspaceId;

    stage = "user_lookup";
    logSignUpStage(stage, { correlationId });
    // Phase 3: same email in another workspace MUST NOT block signup.
    // NULL-workspace orphans / platform must NEVER resolve here.
    const existing = await findTenantUserIdByEmail(workspaceId, email);

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

    stage = "password_hash";
    logSignUpStage(stage, { correlationId });
    const password = await bcrypt.hash(parsed.data.password, 10);
    const now = new Date();
    const { ip, userAgent } = requestClientMeta(request);
    const asSeller = parsed.data.intent === "seller";

    stage = "user_create";
    logSignUpStage(stage, { correlationId });
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        password,
        workspaceId,
        role: "BUYER",
        isBuyer: true,
        isSeller: asSeller,
        activeMode: asSeller ? "SELLER" : "BUYER",
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        vowAcceptedAt: now,
        vowVersion: VOW_VERSION,
        caslConsentAt: now,
      },
    });

    stage = "consent_create";
    logSignUpStage(stage, { correlationId, userId: user.id });
    await persistSignupConsentEvents(prisma, {
      userId: user.id,
      email,
      ip,
      userAgent,
    });

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
            request,
          });
        } catch (err) {
          console.error("[sign-up] lead capture failed", err);
        }

        const [verifyStatus, welcomeStatus] = await Promise.all([
          sendEmailVerification({
            email,
            name: parsed.data.name,
            callbackUrl: "/",
            customerId: user.id,
            workspaceId,
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

    stage = "signup_complete";
    logSignUpStage(stage, { correlationId, userId: user.id });
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    return mapSignUpFailure(error, stage, correlationId);
  }
}

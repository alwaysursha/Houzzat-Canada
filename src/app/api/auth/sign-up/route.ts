import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pickUtm } from "@/lib/ads/utm";
import { captureWebsiteLead } from "@/lib/agent/lead-intake";
import {
  buildCaptureContext,
  pickClickIds,
  type CaptureContext,
} from "@/lib/auth/capture-attribution";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/auth/existing-account-message";
import { hashPhoneCredential } from "@/lib/auth/phone-credential";
import { persistSignupConsentEvents } from "@/lib/auth/sign-up-consent";
import { sendWelcomeEmail } from "@/lib/auth/email-verification";
import { nextEmailVerifyNudgeDueAt } from "@/lib/auth/verify-email-nudge";
import {
  findTenantUserIdByEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/workspace-identity";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { TERMS_VERSION } from "@/lib/consent";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { VOW_VERSION } from "@/lib/vow";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().min(7, "Enter a valid mobile number.").max(40),
  /** Always true from the client — Terms accepted by creating an account. */
  acceptTerms: z.literal(true),
  /** buyer (default) | seller — seller signup / sell-a-home paths */
  intent: z.enum(["buyer", "seller"]).optional(),
  credentialMode: z.literal("phone_e164").optional(),
  captureContext: z.record(z.string(), z.unknown()).optional(),
});

type SignUpStage =
  | "tenancy_resolve"
  | "user_lookup"
  | "password_hash"
  | "user_create"
  | "lead_capture"
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
    if (field === "phone") {
      return "Enter a valid mobile number.";
    }
    if (issue.message && typeof issue.message === "string") {
      return issue.message;
    }
  }
  return "Please check your name, email, and mobile number.";
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

function sanitizeCaptureContext(
  raw: Record<string, unknown> | undefined,
  body: Record<string, unknown>,
): CaptureContext {
  const click = pickClickIds(body);
  const base = buildCaptureContext({
    intent:
      typeof raw?.intent === "string"
        ? (raw.intent as CaptureContext["intent"])
        : null,
    mlsNumber: typeof raw?.mlsNumber === "string" ? raw.mlsNumber : null,
    listingAddress:
      typeof raw?.listingAddress === "string" ? raw.listingAddress : null,
    listingPrice:
      typeof raw?.listingPrice === "number" ? raw.listingPrice : null,
    pathname: typeof raw?.pathname === "string" ? raw.pathname : null,
    callbackUrl: typeof raw?.callbackUrl === "string" ? raw.callbackUrl : null,
    searchUrl: typeof raw?.searchUrl === "string" ? raw.searchUrl : null,
    searchFilters:
      raw?.searchFilters && typeof raw.searchFilters === "object"
        ? (raw.searchFilters as Record<string, unknown>)
        : null,
    visitorKey: typeof raw?.visitorKey === "string" ? raw.visitorKey : null,
    sessionKey: typeof raw?.sessionKey === "string" ? raw.sessionKey : null,
    utmSource: typeof raw?.utmSource === "string" ? raw.utmSource : null,
    utmMedium: typeof raw?.utmMedium === "string" ? raw.utmMedium : null,
    utmCampaign: typeof raw?.utmCampaign === "string" ? raw.utmCampaign : null,
    utmContent: typeof raw?.utmContent === "string" ? raw.utmContent : null,
    adCampaignId:
      typeof raw?.adCampaignId === "string" ? raw.adCampaignId : null,
    landingPageId:
      typeof raw?.landingPageId === "string" ? raw.landingPageId : null,
    referrer: typeof raw?.referrer === "string" ? raw.referrer : null,
    gclid: click.gclid ?? (typeof raw?.gclid === "string" ? raw.gclid : null),
    gbraid:
      click.gbraid ?? (typeof raw?.gbraid === "string" ? raw.gbraid : null),
    wbraid:
      click.wbraid ?? (typeof raw?.wbraid === "string" ? raw.wbraid : null),
  });
  return base;
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

  const bodyRecord =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const utm = pickUtm(bodyRecord);
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
    const credential = await hashPhoneCredential(parsed.data.phone);
    if (!credential.ok) {
      return NextResponse.json({ error: credential.error }, { status: 400 });
    }
    const phoneColumns = parsePhoneColumnsForWrite(credential.phoneE164);
    if (!phoneColumns.ok) {
      return NextResponse.json(
        { error: "Enter a valid mobile number." },
        { status: 400 },
      );
    }

    const now = new Date();
    const { ip, userAgent } = requestClientMeta(request);
    const asSeller = parsed.data.intent === "seller";
    const captureContext = sanitizeCaptureContext(
      parsed.data.captureContext,
      bodyRecord,
    );

    stage = "user_create";
    logSignUpStage(stage, { correlationId });
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        password: credential.hash,
        passwordCredentialKind: "PHONE_E164",
        workspaceId,
        role: "BUYER",
        isBuyer: true,
        isSeller: asSeller,
        activeMode: asSeller ? "SELLER" : "BUYER",
        ...phoneColumns.columns,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        vowAcceptedAt: now,
        vowVersion: VOW_VERSION,
        caslConsentAt: now,
        emailVerifyNudgeDueAt: nextEmailVerifyNudgeDueAt(now),
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

    // User + Lead must exist before OTP. Await capture (do not defer).
    stage = "lead_capture";
    logSignUpStage(stage, { correlationId, userId: user.id });
    try {
      const captured = await captureWebsiteLead({
        source: "SIGNUP",
        customerId: user.id,
        name: user.name,
        email: user.email,
        phone: credential.phoneE164,
        isBuyer: true,
        isSeller: asSeller,
        score: asSeller ? 40 : 20,
        utm,
        request,
        deferSignupSms: true,
      });
      await prisma.lead.update({
        where: { id: captured.lead.id },
        data: {
          captureContext: captureContext as Prisma.InputJsonValue,
          ...(captureContext.mlsNumber
            ? { listingMls: captureContext.mlsNumber }
            : {}),
        },
      });
    } catch (err) {
      console.error("[sign-up] lead capture failed", err);
      // User already created — do not roll back. Client can continue OTP.
    }

    scheduleWorkerSideEffect(
      (async () => {
        const welcomeStatus = await sendWelcomeEmail({
          email,
          name: parsed.data.name,
          customerId: user.id,
        }).catch((err) => {
          console.error("[sign-up] welcome email failed", err);
          return "failed" as const;
        });
        console.info("[sign-up] emails", { email, welcomeStatus });
      })(),
    );

    stage = "signup_complete";
    logSignUpStage(stage, { correlationId, userId: user.id });
    return NextResponse.json({
      ok: true,
      userId: user.id,
      needsQualification: true,
    });
  } catch (error) {
    return mapSignUpFailure(error, stage, correlationId);
  }
}

import { randomBytes } from "crypto";
import type { ActiveMode, Role } from "@prisma/client";
import { SITE_URL } from "@/lib/constants";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { isResendConfigured } from "@/lib/email/config";
import { renderVerifyEmail, renderWelcomeEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

export const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Min gap between verification emails for the same address. */
export const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

export function isEmailSendConfigured() {
  return isResendConfigured();
}

export async function createEmailVerificationToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

  await prisma.verificationToken.deleteMany({
    where: { identifier: normalized },
  });

  await prisma.verificationToken.create({
    data: {
      identifier: normalized,
      token,
      expires,
    },
  });

  return { token, expires, email: normalized };
}

export function verificationLink(token: string, callbackUrl?: string) {
  const url = new URL("/auth/verify-email", SITE_URL);
  url.searchParams.set("token", token);
  const safe = safeInternalCallbackUrl(callbackUrl, "/");
  if (safe !== "/") {
    url.searchParams.set("callbackUrl", safe);
  }
  return url.toString();
}

/**
 * Create token + send verification email.
 * Returns skipped when Resend is not configured.
 */
export async function sendEmailVerification(input: {
  email: string;
  name?: string | null;
  callbackUrl?: string;
  customerId?: string | null;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailSendConfigured()) {
    console.info("[verify-email:stub] RESEND_API_KEY missing", input.email);
    return "skipped";
  }

  const { token, email } = await createEmailVerificationToken(input.email);
  const link = verificationLink(token, input.callbackUrl);
  const rendered = renderVerifyEmail({
    name: input.name,
    verifyUrl: link,
  });

  const user =
    input.customerId
      ? { id: input.customerId }
      : await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });

  const result = await sendAndLogClientEmail({
    to: email,
    rendered,
    stream: "notify",
    customerId: user?.id,
    logToCrm: true,
  });

  return result.status === "sent"
    ? "sent"
    : result.status === "skipped"
      ? "skipped"
      : "failed";
}

export async function sendWelcomeEmail(input: {
  email: string;
  name?: string | null;
  customerId?: string | null;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailSendConfigured()) return "skipped";

  const rendered = renderWelcomeEmail({ name: input.name });
  const result = await sendAndLogClientEmail({
    to: input.email.trim().toLowerCase(),
    rendered,
    stream: "notify",
    customerId: input.customerId,
    logToCrm: true,
  });

  return result.status === "sent"
    ? "sent"
    : result.status === "skipped"
      ? "skipped"
      : "failed";
}

export type VerificationTokenPeekCode =
  | "missing"
  | "expired"
  | "invalid"
  | "disabled"
  | "staff";

export type VerificationTokenPeekResult =
  | {
      ok: true;
      userId: string;
      emailVerified: boolean;
    }
  | { ok: false; error: string; code: VerificationTokenPeekCode };

/** Read token owner/expiry without consuming or deleting the token. */
export async function peekEmailVerificationToken(
  token: string,
): Promise<VerificationTokenPeekResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Missing verification token.", code: "missing" };
  }

  const row = await prisma.verificationToken.findUnique({
    where: { token: trimmed },
  });
  if (!row) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "invalid",
    };
  }
  if (row.expires.getTime() < Date.now()) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "expired",
    };
  }

  const email = row.identifier.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      emailVerified: true,
      role: true,
      disabledAt: true,
    },
  });
  if (!user) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
      code: "invalid",
    };
  }
  if (user.disabledAt) {
    return {
      ok: false,
      error: "This account has been disabled. Contact Houzzat support.",
      code: "disabled",
    };
  }
  if (user.role === "AGENT" || user.role === "ADMIN") {
    return {
      ok: false,
      error: "Use your team sign-in page for this account.",
      code: "staff",
    };
  }

  return {
    ok: true,
    userId: user.id,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string | null;
        image: string | null;
        role: Role;
        isBuyer: boolean;
        isSeller: boolean;
        activeMode: ActiveMode;
      };
    }
  | { ok: false; error: string }
> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Missing verification token." };

  const row = await prisma.verificationToken.findUnique({
    where: { token: trimmed },
  });
  if (!row) {
    return {
      ok: false,
      error: "Verification link expired or invalid.",
    };
  }
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "Verification link expired or invalid." };
  }

  const email = row.identifier.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      isBuyer: true,
      isSeller: true,
      activeMode: true,
      disabledAt: true,
    },
  });
  if (!user) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "Account not found for this link." };
  }

  if (user.disabledAt) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "This account has been disabled. Contact Houzzat support.",
    };
  }

  if (user.role === "AGENT" || user.role === "ADMIN") {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "Use your team sign-in page for this account.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
  ]);

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      isBuyer: user.isBuyer,
      isSeller: user.isSeller,
      activeMode: user.activeMode,
    },
  };
}

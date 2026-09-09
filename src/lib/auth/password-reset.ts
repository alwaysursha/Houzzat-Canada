import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";
import { isResendConfigured } from "@/lib/email/config";
import { prisma } from "@/lib/prisma";
import { resolveTrustedRequestOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_MIN_LENGTH = 8;
const RESET_IDENTIFIER_PREFIX = "password-reset:";

export function passwordResetIdentifier(email: string) {
  return `${RESET_IDENTIFIER_PREFIX}${email.trim().toLowerCase()}`;
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isEmailSendConfigured() {
  return isResendConfigured();
}

export async function resolvePasswordResetContext(request: Request): Promise<{
  origin: string;
  siteName: string;
}> {
  const tenancy = await resolveRequestTenancy(request);
  if (tenancy.ok) {
    return {
      origin: tenancy.origin,
      siteName: tenancy.brand.displayName || SITE_NAME,
    };
  }

  const trusted = resolveTrustedRequestOrigin(request);
  if (trusted.ok) {
    return { origin: trusted.origin, siteName: SITE_NAME };
  }

  return { origin: SITE_URL, siteName: SITE_NAME };
}

export function passwordResetLink(token: string, origin: string) {
  const url = new URL("/auth/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createPasswordResetToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const raw = randomBytes(32).toString("hex");
  const token = hashPasswordResetToken(raw);
  const identifier = passwordResetIdentifier(normalized);
  const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });

  return { raw, expires, email: normalized };
}

/**
 * Create a reset token and email it when the account can use a password.
 * Always opaque to the caller — missing/disabled/OAuth-only accounts skip send.
 */
export async function requestPasswordReset(input: {
  email: string;
  origin: string;
  siteName?: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const normalized = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      disabledAt: true,
    },
  });

  if (!user?.password || user.disabledAt) {
    return "skipped";
  }

  if (!isEmailSendConfigured()) {
    const { raw } = await createPasswordResetToken(normalized);
    const link = passwordResetLink(raw, input.origin);
    console.info("[password-reset:stub] RESEND_API_KEY missing", {
      email: normalized,
      resetUrl: link,
    });
    return "skipped";
  }

  const { raw } = await createPasswordResetToken(normalized);
  const link = passwordResetLink(raw, input.origin);
  return sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    resetUrl: link,
    customerId: user.id,
    siteName: input.siteName,
  });
}

export type PasswordResetPeekResult =
  | { ok: true }
  | { ok: false; error: string };

export async function peekPasswordResetToken(
  token: string,
): Promise<PasswordResetPeekResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "This reset link is missing." };
  }

  const row = await prisma.verificationToken.findUnique({
    where: { token: hashPasswordResetToken(trimmed) },
  });
  if (!row || !row.identifier.startsWith(RESET_IDENTIFIER_PREFIX)) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (row.expires.getTime() < Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  return { ok: true };
}

export async function consumePasswordResetToken(
  token: string,
  newPassword: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "This reset link is missing." };
  }
  if (newPassword.length < PASSWORD_RESET_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword.length > 128) {
    return { ok: false, error: "Password is too long." };
  }

  const hashedToken = hashPasswordResetToken(trimmed);
  const row = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });
  if (!row || !row.identifier.startsWith(RESET_IDENTIFIER_PREFIX)) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const email = row.identifier.slice(RESET_IDENTIFIER_PREFIX.length);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, disabledAt: true },
  });
  if (!user) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (user.disabledAt) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } }).catch(
      () => undefined,
    );
    return {
      ok: false,
      error: "This account has been disabled. Contact support.",
    };
  }

  const password = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password },
    }),
    prisma.verificationToken.deleteMany({
      where: { identifier: passwordResetIdentifier(email) },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { ok: true, email: user.email };
}

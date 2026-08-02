import { randomBytes } from "crypto";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Min gap between verification emails for the same address. */
export const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

export function isEmailSendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
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
  if (callbackUrl?.startsWith("/")) {
    url.searchParams.set("callbackUrl", callbackUrl);
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
}): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailSendConfigured()) {
    console.info("[verify-email:stub] RESEND_API_KEY missing", input.email);
    return "skipped";
  }

  const { token, email } = await createEmailVerificationToken(input.email);
  const link = verificationLink(token, input.callbackUrl);
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";

  const result = await sendNotification({
    toEmail: email,
    subject: `Verify your email for ${SITE_NAME}`,
    text: [
      greet,
      "",
      `Please verify your email address to keep full access to ${SITE_NAME}.`,
      "",
      `Verify here (link valid for 7 days):`,
      link,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
  });

  return result.email;
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Missing verification token." };

  const row = await prisma.verificationToken.findUnique({
    where: { token: trimmed },
  });
  if (!row) return { ok: false, error: "Invalid or expired verification link." };
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "This verification link has expired." };
  }

  const email = row.identifier.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    await prisma.verificationToken.delete({ where: { token: trimmed } }).catch(
      () => undefined,
    );
    return { ok: false, error: "Account not found for this link." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
  ]);

  return { ok: true, email };
}

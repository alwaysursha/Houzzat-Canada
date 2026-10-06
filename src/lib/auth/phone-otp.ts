/**
 * Consumer SMS OTP — independent of emailVerified and agent phoneVerifiedAt.
 * Codes are hashed at rest; never log plaintext OTP.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeToE164 } from "@/lib/sms/e164";
import { sendSms } from "@/lib/sms/transport";

export const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
export const PHONE_OTP_RESEND_COOLDOWN_MS = 45 * 1000;
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_OTP_MAX_SENDS_PER_HOUR = 5;

function hashOtpCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

function codesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function maskPhoneE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    return `(${area}) •••-${last4}`;
  }
  return `•••-${last4}`;
}

type OtpDb = Pick<PrismaClient, "phoneOtpChallenge" | "user">;

export async function sendPhoneOtp(input: {
  db: OtpDb;
  workspaceId: string;
  userId: string;
  phoneE164: string;
  now?: Date;
}): Promise<
  | { ok: true; maskedPhone: string; resendAvailableAt: string }
  | { ok: false; error: string; status: number; resendAvailableAt?: string }
> {
  const now = input.now ?? new Date();
  const phoneE164 = normalizeToE164(input.phoneE164);
  if (!phoneE164) {
    return { ok: false, error: "Enter a valid mobile number.", status: 400 };
  }

  const recent = await input.db.phoneOtpChallenge.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      sentAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    orderBy: { sentAt: "desc" },
    take: PHONE_OTP_MAX_SENDS_PER_HOUR,
  });
  if (recent.length >= PHONE_OTP_MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      error: "Too many codes sent. Try again later.",
      status: 429,
    };
  }
  const last = recent[0];
  if (
    last &&
    now.getTime() - last.sentAt.getTime() < PHONE_OTP_RESEND_COOLDOWN_MS
  ) {
    const available = new Date(
      last.sentAt.getTime() + PHONE_OTP_RESEND_COOLDOWN_MS,
    );
    return {
      ok: false,
      error: "Please wait before requesting another code.",
      status: 429,
      resendAvailableAt: available.toISOString(),
    };
  }

  const code = generateOtpCode();
  const salt = `${input.workspaceId}:${input.userId}:${phoneE164}`;
  const codeHash = hashOtpCode(code, salt);
  const expiresAt = new Date(now.getTime() + PHONE_OTP_TTL_MS);

  await input.db.phoneOtpChallenge.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      phoneE164,
      codeHash,
      expiresAt,
      maxAttempts: PHONE_OTP_MAX_ATTEMPTS,
      sentAt: now,
    },
  });

  const body = `Your Houzzat verification code is ${code}. It expires in 10 minutes.`;
  const result = await sendSms({
    workspaceId: input.workspaceId,
    to: phoneE164,
    body,
    smsClass: "transactional",
  }).catch(() => ({ status: "failed" as const }));

  if (result.status === "failed" && process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error: "Could not send the verification code. Try again.",
      status: 502,
    };
  }

  return {
    ok: true,
    maskedPhone: maskPhoneE164(phoneE164),
    resendAvailableAt: new Date(
      now.getTime() + PHONE_OTP_RESEND_COOLDOWN_MS,
    ).toISOString(),
  };
}

export async function verifyPhoneOtp(input: {
  db: OtpDb;
  workspaceId: string;
  userId: string;
  code: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = input.now ?? new Date();
  const code = input.code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code.", status: 400 };
  }

  const challenge = await input.db.phoneOtpChallenge.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!challenge) {
    return {
      ok: false,
      error: "Code expired or not found. Request a new one.",
      status: 400,
    };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return {
      ok: false,
      error: "Too many attempts. Request a new code.",
      status: 429,
    };
  }

  const salt = `${input.workspaceId}:${input.userId}:${challenge.phoneE164}`;
  const expected = hashOtpCode(code, salt);
  const match = codesEqual(expected, challenge.codeHash);

  await input.db.phoneOtpChallenge.update({
    where: { id: challenge.id },
    data: {
      attempts: { increment: 1 },
      ...(match ? { consumedAt: now } : {}),
    },
  });

  if (!match) {
    return { ok: false, error: "Incorrect code. Try again.", status: 400 };
  }

  await input.db.user.update({
    where: { id: input.userId },
    data: { phoneOtpVerifiedAt: now },
  });

  return { ok: true };
}

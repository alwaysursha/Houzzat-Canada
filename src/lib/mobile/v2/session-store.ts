/**
 * Stage 4.1 — Mobile v2 Session & Revocation Storage.
 *
 * Persists mobile refresh sessions using hashed tokens in VerificationToken table:
 * identifier: "mobile-v2-session:<userId>:<jti>"
 * token: hashToken(rawRefreshToken)
 * expires: expiresAt
 *
 * This provides zero-schema-change, database-level revocation and replay protection.
 */

import { prisma } from "@/lib/prisma";
import { hashToken } from "./tokens";

const SESSION_IDENTIFIER_PREFIX = "mobile-v2-session:";

export function buildSessionIdentifier(userId: string, jti: string): string {
  return `${SESSION_IDENTIFIER_PREFIX}${userId}:${jti}`;
}

export async function storeMobileSession(input: {
  userId: string;
  jti: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<void> {
  const identifier = buildSessionIdentifier(input.userId, input.jti);
  const tokenHash = hashToken(input.refreshToken);

  await prisma.verificationToken.upsert({
    where: {
      identifier_token: {
        identifier,
        token: tokenHash,
      },
    },
    create: {
      identifier,
      token: tokenHash,
      expires: input.expiresAt,
    },
    update: {
      expires: input.expiresAt,
    },
  });
}

export async function validateMobileSession(input: {
  userId: string;
  jti: string;
  refreshToken: string;
}): Promise<boolean> {
  const identifier = buildSessionIdentifier(input.userId, input.jti);
  const tokenHash = hashToken(input.refreshToken);

  const record = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier,
        token: tokenHash,
      },
    },
  });

  if (!record) return false;
  if (record.expires.getTime() < Date.now()) {
    // Expired -> clean up
    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });
    return false;
  }

  return true;
}

export async function revokeMobileSession(input: {
  userId: string;
  jti?: string;
}): Promise<void> {
  if (input.jti) {
    const identifier = buildSessionIdentifier(input.userId, input.jti);
    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });
  } else {
    // Revoke all mobile sessions for this user
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: {
          startsWith: `${SESSION_IDENTIFIER_PREFIX}${input.userId}:`,
        },
      },
    });
  }
}

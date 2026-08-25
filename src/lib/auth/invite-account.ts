/**
 * Flat staff-account creation for invite acceptance (Workers-safe).
 *
 * PrismaNeonHttp rejects nested relation creates / createMany on this path —
 * same class of failure as consumer sign-up before flat consent writes.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TERMS_VERSION } from "@/lib/consent";
import { persistSignupConsentEvents } from "@/lib/auth/sign-up-consent";
import { VOW_VERSION } from "@/lib/vow";

type Db = Pick<PrismaClient, "user" | "agentProfile" | "consentEvent">;

export async function createAgentAccountFromInvite(
  db: Db,
  input: {
    name: string;
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ userId: string }> {
  const hashed = await bcrypt.hash(input.password, 10);
  const now = new Date();

  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashed,
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      emailVerified: now,
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      vowAcceptedAt: now,
      vowVersion: VOW_VERSION,
      caslConsentAt: now,
    },
  });

  await db.agentProfile.create({
    data: { userId: user.id, active: true },
  });

  await persistSignupConsentEvents(db, {
    userId: user.id,
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { userId: user.id };
}

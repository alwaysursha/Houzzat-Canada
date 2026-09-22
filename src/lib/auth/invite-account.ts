/**
 * Flat staff-account creation for invite acceptance (Workers-safe).
 *
 * PrismaNeonHttp rejects nested relation creates / createMany on this path —
 * same class of failure as consumer sign-up before flat consent writes.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { ParsedAdminManagedAgentProfile } from "@/lib/agent/admin-managed-profile";
import { TERMS_VERSION } from "@/lib/consent";
import { persistSignupConsentEvents } from "@/lib/auth/sign-up-consent";
import { VOW_VERSION } from "@/lib/vow";

type Db = Pick<PrismaClient, "user" | "agentProfile" | "consentEvent">;

function agentProfileCreateData(
  userId: string,
  profile?: ParsedAdminManagedAgentProfile | null,
) {
  return {
    userId,
    active: true,
    ...(profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          recoLicenseNumber: profile.recoLicenseNumber,
          recoLicenseExpiresAt: profile.recoLicenseExpiresAt,
        }
      : {}),
  };
}

/**
 * Admin invite: create AGENT User + AgentProfile without a password.
 * Activation later only sets credentials. Does not create WorkspaceMember.
 */
export async function provisionPasswordlessAgentFromInvite(
  db: Db,
  input: {
    email: string;
    profile: ParsedAdminManagedAgentProfile;
    /** Phase 3: tenant identity home workspace (required for tenant invites). */
    workspaceId: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ userId: string }> {
  const now = new Date();
  const user = await db.user.create({
    data: {
      name: input.profile.displayName,
      email: input.email,
      password: null,
      workspaceId: input.workspaceId,
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      phone: input.profile.phone,
      phoneE164: input.profile.phoneE164,
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      vowAcceptedAt: now,
      vowVersion: VOW_VERSION,
      caslConsentAt: now,
    },
  });

  await db.agentProfile.create({
    data: agentProfileCreateData(user.id, input.profile),
  });

  await persistSignupConsentEvents(db, {
    userId: user.id,
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { userId: user.id };
}

export async function createAgentAccountFromInvite(
  db: Db,
  input: {
    name: string;
    email: string;
    password: string;
    /** Phase 3: tenant identity home workspace (required for tenant invites). */
    workspaceId: string;
    ip?: string;
    userAgent?: string;
    profile?: ParsedAdminManagedAgentProfile | null;
  },
): Promise<{ userId: string }> {
  const hashed = await bcrypt.hash(input.password, 10);
  const now = new Date();

  const user = await db.user.create({
    data: {
      name: input.profile?.displayName || input.name,
      email: input.email,
      password: hashed,
      workspaceId: input.workspaceId,
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      ...(input.profile
        ? {
            phone: input.profile.phone,
            phoneE164: input.profile.phoneE164,
          }
        : {}),
      emailVerified: now,
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      vowAcceptedAt: now,
      vowVersion: VOW_VERSION,
      caslConsentAt: now,
    },
  });

  await db.agentProfile.create({
    data: agentProfileCreateData(user.id, input.profile),
  });

  await persistSignupConsentEvents(db, {
    userId: user.id,
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { userId: user.id };
}

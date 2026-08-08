import type { OrgMembershipRole, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  COMMUNICATIONS_CONSENT_KIND,
  COMMUNICATIONS_CONSENT_VERSION,
  TERMS_ACCEPT_KIND,
  TERMS_VERSION,
} from "@/lib/consent";
import { prisma } from "@/lib/prisma";
import { VOW_VERSION } from "@/lib/vow";

export type InvitePreview = {
  email: string;
  role: OrgMembershipRole;
  orgName: string;
  invitedByName: string | null;
  expiresAt: string;
  accepted: boolean;
  expired: boolean;
  /** An account already exists for this invite email. */
  accountExists: boolean;
  /** Existing account is a consumer (buyer and/or seller). */
  convertsConsumerAccount: boolean;
  consumerLabels: Array<"buyer" | "seller">;
};

export async function loadInvitePreview(
  token: string,
): Promise<InvitePreview | null> {
  const invite = await prisma.organizationInvite.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
    },
  });
  if (!invite) return null;

  const invitedBy = invite.invitedById
    ? await prisma.user.findUnique({
        where: { id: invite.invitedById },
        select: { name: true, email: true },
      })
    : null;

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: {
      id: true,
      role: true,
      isBuyer: true,
      isSeller: true,
    },
  });

  const consumerLabels: Array<"buyer" | "seller"> = [];
  if (existing) {
    if (existing.isBuyer || existing.role === "BUYER") consumerLabels.push("buyer");
    if (existing.isSeller) consumerLabels.push("seller");
  }

  return {
    email: invite.email,
    role: invite.role,
    orgName: invite.organization.name,
    invitedByName: invitedBy?.name?.trim() || invitedBy?.email || null,
    expiresAt: invite.expiresAt.toISOString(),
    accepted: Boolean(invite.acceptedAt),
    expired: invite.expiresAt.getTime() < Date.now(),
    accountExists: Boolean(existing),
    convertsConsumerAccount: consumerLabels.length > 0,
    consumerLabels,
  };
}

/** Promote user to agent CRM seat and disable consumer dashboards. */
export async function ensureAgentSeat(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return;

  const nextRole: Role = user.role === "ADMIN" ? "ADMIN" : "AGENT";

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: nextRole,
      isBuyer: false,
      isSeller: false,
      activeMode: "BUYER",
      emailVerified: new Date(),
    },
  });

  await prisma.agentProfile.upsert({
    where: { userId },
    create: { userId, active: true },
    update: { active: true },
  });
}

export async function acceptOrganizationInvite(input: {
  token: string;
  /** Signed-in user accepting an existing-account invite. */
  actingUserId?: string | null;
  /** Required when creating a new agent account. */
  name?: string;
  password?: string;
}): Promise<
  | {
      ok: true;
      userId: string;
      createdAccount: boolean;
      convertedConsumer: boolean;
    }
  | { ok: false; error: string; code?: "NEED_SIGN_IN" | "WRONG_ACCOUNT" }
> {
  const invite = await prisma.organizationInvite.findUnique({
    where: { token: input.token },
    include: {
      organization: { select: { id: true, name: true, seatLimit: true } },
    },
  });

  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.acceptedAt) {
    return { ok: false, error: "This invite was already accepted." };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This invite has expired." };
  }

  const memberCount = await prisma.organizationMembership.count({
    where: { organizationId: invite.organizationId },
  });
  if (memberCount >= invite.organization.seatLimit) {
    return {
      ok: false,
      error: `Seat limit reached (${invite.organization.seatLimit}). Ask your team leader to free a seat.`,
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: {
      id: true,
      email: true,
      role: true,
      isBuyer: true,
      isSeller: true,
    },
  });

  if (existing) {
    if (!input.actingUserId) {
      return {
        ok: false,
        error: "Sign in with this email to accept the invite.",
        code: "NEED_SIGN_IN",
      };
    }
    if (input.actingUserId !== existing.id) {
      return {
        ok: false,
        error: "You’re signed in with a different email. Sign out and try again.",
        code: "WRONG_ACCOUNT",
      };
    }

    const convertedConsumer =
      existing.isBuyer ||
      existing.isSeller ||
      existing.role === "BUYER";

    await ensureAgentSeat(existing.id);
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: existing.id,
        },
      },
      create: {
        organizationId: invite.organizationId,
        userId: existing.id,
        role: invite.role,
      },
      update: { role: invite.role },
    });
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    return {
      ok: true,
      userId: existing.id,
      createdAccount: false,
      convertedConsumer,
    };
  }

  const name = input.name?.trim();
  const password = input.password ?? "";
  if (!name || name.length < 1) {
    return { ok: false, error: "Name is required to create your account." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const hashed = await bcrypt.hash(password, 10);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      name,
      email: invite.email,
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
      agentProfile: { create: { active: true } },
      consentEvents: {
        create: [
          {
            kind: TERMS_ACCEPT_KIND,
            version: TERMS_VERSION,
            email: invite.email,
          },
          {
            kind: "vow_accept",
            version: VOW_VERSION,
            email: invite.email,
          },
          {
            kind: COMMUNICATIONS_CONSENT_KIND,
            version: COMMUNICATIONS_CONSENT_VERSION,
            email: invite.email,
          },
        ],
      },
    },
  });

  await prisma.organizationMembership.create({
    data: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
    },
  });

  await prisma.organizationInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return {
    ok: true,
    userId: user.id,
    createdAccount: true,
    convertedConsumer: false,
  };
}

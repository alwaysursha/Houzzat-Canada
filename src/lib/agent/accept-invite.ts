import type { OrgMembershipRole, Role } from "@prisma/client";
import { createAgentAccountFromInvite } from "@/lib/auth/invite-account";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";

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
  /** Hostname / home workspace the invite binds identity into. */
  workspaceId: string | null;
};

type InviteWorkspaceDb = {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { workspaceId: true };
    }) => Promise<{ workspaceId: string | null } | null>;
  };
  workspaceMember: {
    findMany: (args: {
      where: {
        userId: string;
        status: "ACTIVE";
        role: { in: Array<"OWNER" | "ADMIN" | "AGENT"> };
      };
      select: { workspaceId: true };
      take: number;
    }) => Promise<Array<{ workspaceId: string }>>;
  };
};

/**
 * OrganizationInvite → workspace binding for Phase 3 identity.
 * Prefer inviter home workspace, then sole ACTIVE staff membership, then
 * legacy org→workspace CRM bridge. Fail closed when unresolved.
 */
export async function resolveOrganizationInviteWorkspaceId(
  invite: { organizationId: string; invitedById: string | null },
  db: InviteWorkspaceDb = prisma,
  resolveOrgOwnership: (
    organizationId: string,
  ) => Promise<{ workspaceId?: string }> = resolveLeadCrmOwnership,
): Promise<string | null> {
  if (invite.invitedById) {
    const inviter = await db.user.findUnique({
      where: { id: invite.invitedById },
      select: { workspaceId: true },
    });
    if (inviter?.workspaceId) return inviter.workspaceId;

    const memberships = await db.workspaceMember.findMany({
      where: {
        userId: invite.invitedById,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "AGENT"] },
      },
      select: { workspaceId: true },
      take: 2,
    });
    if (memberships.length === 1) return memberships[0]!.workspaceId;
  }

  const ownership = await resolveOrgOwnership(invite.organizationId);
  return ownership.workspaceId ?? null;
}

export type OrgInviteCandidateUser = {
  id: string;
  email: string;
  workspaceId: string | null;
  role: Role | string;
  isBuyer: boolean;
  isSeller: boolean;
};

/**
 * Pure Phase 3 gate: which User may satisfy an organization invite.
 * Never returns a cross-workspace or NULL-workspace identity.
 */
export function selectOrganizationInviteIdentity(input: {
  inviteWorkspaceId: string;
  inviteEmail: string;
  /** Users that share the invite email anywhere (caller may pass all matches). */
  candidates: OrgInviteCandidateUser[];
  actingUserId?: string | null;
}):
  | { ok: true; user: OrgInviteCandidateUser }
  | {
      ok: false;
      reason: "NONE_IN_WORKSPACE" | "WRONG_ACCOUNT" | "NEED_SIGN_IN";
    } {
  const email = normalizeIdentityEmail(input.inviteEmail);
  const inWorkspace = input.candidates.filter(
    (u) =>
      normalizeIdentityEmail(u.email) === email &&
      u.workspaceId === input.inviteWorkspaceId,
  );
  if (inWorkspace.length === 0) {
    if (input.actingUserId) {
      const acting = input.candidates.find((u) => u.id === input.actingUserId);
      if (
        acting &&
        (acting.workspaceId !== input.inviteWorkspaceId ||
          normalizeIdentityEmail(acting.email) !== email)
      ) {
        return { ok: false, reason: "WRONG_ACCOUNT" };
      }
    }
    return { ok: false, reason: "NONE_IN_WORKSPACE" };
  }

  const existing = inWorkspace[0]!;
  if (!input.actingUserId) {
    return { ok: false, reason: "NEED_SIGN_IN" };
  }
  if (input.actingUserId !== existing.id) {
    return { ok: false, reason: "WRONG_ACCOUNT" };
  }
  return { ok: true, user: existing };
}

async function findWorkspaceInviteUser(
  workspaceId: string,
  email: string,
): Promise<{
  id: string;
  email: string;
  role: Role;
  isBuyer: boolean;
  isSeller: boolean;
  workspaceId: string | null;
} | null> {
  const normalized = normalizeIdentityEmail(email);
  return prisma.user.findFirst({
    where: { email: normalized, workspaceId },
    select: {
      id: true,
      email: true,
      role: true,
      isBuyer: true,
      isSeller: true,
      workspaceId: true,
    },
  });
}

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
    ? await prisma.user.findFirst({
        where: { id: invite.invitedById },
        select: { name: true, email: true },
      })
    : null;

  const workspaceId = await resolveOrganizationInviteWorkspaceId(invite);
  const existing = workspaceId
    ? await findWorkspaceInviteUser(workspaceId, invite.email)
    : null;

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
    workspaceId,
  };
}

/** Promote user to agent CRM seat and disable consumer dashboards. */
export async function ensureAgentSeat(userId: string) {
  const user = await prisma.user.findFirst({
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
      workspaceId: string;
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

  const workspaceId = await resolveOrganizationInviteWorkspaceId(invite);
  if (!workspaceId) {
    return {
      ok: false,
      error: "Invite workspace could not be resolved.",
    };
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

  const inviteEmail = normalizeIdentityEmail(invite.email);
  // Phase 3: never resolve User by global email — invite workspace only.
  const existing = await findWorkspaceInviteUser(workspaceId, inviteEmail);

  if (existing) {
    const selected = selectOrganizationInviteIdentity({
      inviteWorkspaceId: workspaceId,
      inviteEmail,
      candidates: [existing],
      actingUserId: input.actingUserId,
    });
    if (!selected.ok) {
      if (selected.reason === "NEED_SIGN_IN") {
        return {
          ok: false,
          error: "Sign in with this email to accept the invite.",
          code: "NEED_SIGN_IN",
        };
      }
      return {
        ok: false,
        error: "You’re signed in with a different email. Sign out and try again.",
        code: "WRONG_ACCOUNT",
      };
    }

    const convertedConsumer =
      selected.user.isBuyer ||
      selected.user.isSeller ||
      selected.user.role === "BUYER";

    await ensureAgentSeat(selected.user.id);
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: selected.user.id,
        },
      },
      create: {
        organizationId: invite.organizationId,
        userId: selected.user.id,
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
      userId: selected.user.id,
      createdAccount: false,
      convertedConsumer,
      workspaceId,
    };
  }

  // No tenant User in this workspace yet — create only inside workspaceId.
  // Reject sessions from other workspaces / NULL orphans / platform users.
  if (input.actingUserId) {
    const acting = await prisma.user.findFirst({
      where: { id: input.actingUserId },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        disabledAt: true,
        role: true,
        isBuyer: true,
        isSeller: true,
      },
    });
    if (!acting || acting.disabledAt) {
      return { ok: false, error: "This account is disabled." };
    }
    const gate = selectOrganizationInviteIdentity({
      inviteWorkspaceId: workspaceId,
      inviteEmail,
      candidates: [acting],
      actingUserId: input.actingUserId,
    });
    if (!gate.ok && gate.reason === "WRONG_ACCOUNT") {
      return {
        ok: false,
        error: "You’re signed in with a different email. Sign out and try again.",
        code: "WRONG_ACCOUNT",
      };
    }
  }

  const name = input.name?.trim();
  const password = input.password ?? "";
  if (!name || name.length < 1) {
    return { ok: false, error: "Name is required to create your account." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  // Flat writes only — nested user.create fails on PrismaNeonHttp (Workers).
  const { userId } = await createAgentAccountFromInvite(prisma, {
    name,
    email: inviteEmail,
    password,
    workspaceId,
  });

  await prisma.organizationMembership.create({
    data: {
      organizationId: invite.organizationId,
      userId,
      role: invite.role,
    },
  });

  await prisma.organizationInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return {
    ok: true,
    userId,
    createdAccount: true,
    convertedConsumer: false,
    workspaceId,
  };
}

/**
 * Stage 3I — WorkspaceInvite lifecycle (create / accept / preview / cancel / resend).
 * Token is cryptographically random; authority comes from token + server lookup only.
 */
import type { WorkspaceInviteStatus, WorkspaceMemberRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { AgentOrgContext } from "@/lib/agent";
import {
  COMMUNICATIONS_CONSENT_KIND,
  COMMUNICATIONS_CONSENT_VERSION,
  TERMS_ACCEPT_KIND,
  TERMS_VERSION,
} from "@/lib/consent";
import { SITE_URL } from "@/lib/constants";
import { sendRenderedEmail } from "@/lib/email/send";
import { renderTeamInviteEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import { reconcileUserPlatformStaffState } from "@/lib/reconcile-user-platform-staff";
import { VOW_VERSION } from "@/lib/vow";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
} from "@/lib/workspace-invite-token";
import {
  workspaceAdminCanInviteRole,
  workspaceTeamCanManage,
} from "@/lib/workspace-team";

export { createWorkspaceInviteToken } from "@/lib/workspace-invite-token";

export const WORKSPACE_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findWorkspaceInviteByRawToken(rawToken: string) {
  const tokenHash = hashWorkspaceInviteToken(rawToken);
  return prisma.workspaceInvite.findUnique({
    where: { token: tokenHash },
    include: {
      workspace: { select: { id: true, name: true, status: true } },
    },
  });
}

export type WorkspaceInvitePreview = {
  kind: "workspace";
  email: string;
  role: WorkspaceMemberRole;
  workspaceName: string;
  workspaceIdPrefix: string;
  invitedByName: string | null;
  expiresAt: string;
  status: WorkspaceInviteStatus;
  accepted: boolean;
  expired: boolean;
  cancelled: boolean;
  accountExists: boolean;
  convertsConsumerAccount: boolean;
  consumerLabels: Array<"buyer" | "seller">;
};

async function sendWorkspaceInviteEmail(input: {
  to: string;
  workspaceName: string;
  role: string;
  token: string;
  invitedByName: string | null;
  expiresAt: Date;
  alreadyMember?: boolean;
  convertsConsumerAccount?: boolean;
  consumerLabels?: Array<"buyer" | "seller">;
}) {
  const rendered = renderTeamInviteEmail({
    orgName: input.workspaceName,
    role: input.role,
    inviteUrl: `${SITE_URL}/auth/invite/${input.token}`,
    invitedByName: input.invitedByName,
    alreadyMember: input.alreadyMember,
    convertsConsumerAccount: input.convertsConsumerAccount,
    consumerLabels: input.consumerLabels,
    expiresAt: input.expiresAt,
  });
  return sendRenderedEmail({
    to: input.to,
    rendered,
    stream: "notify",
  });
}

export async function loadWorkspaceInvitePreview(
  token: string,
): Promise<WorkspaceInvitePreview | null> {
  const invite = await findWorkspaceInviteByRawToken(token);
  if (!invite) return null;

  if (
    invite.status === "PENDING" &&
    invite.expiresAt.getTime() < Date.now()
  ) {
    await prisma.workspaceInvite
      .update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      })
      .catch(() => undefined);
    invite.status = "EXPIRED";
  }

  const invitedBy = invite.invitedById
    ? await prisma.user.findUnique({
        where: { id: invite.invitedById },
        select: { name: true, email: true },
      })
    : null;

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true, role: true, isBuyer: true, isSeller: true },
  });

  const consumerLabels: Array<"buyer" | "seller"> = [];
  if (existing) {
    if (existing.isBuyer || existing.role === "BUYER") consumerLabels.push("buyer");
    if (existing.isSeller) consumerLabels.push("seller");
  }

  return {
    kind: "workspace",
    email: invite.email,
    role: invite.role,
    workspaceName: invite.workspace.name,
    workspaceIdPrefix: invite.workspace.id.slice(0, 8),
    invitedByName: invitedBy?.name?.trim() || invitedBy?.email || null,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.status,
    accepted: invite.status === "ACCEPTED" || Boolean(invite.acceptedAt),
    expired:
      invite.status === "EXPIRED" || invite.expiresAt.getTime() < Date.now(),
    cancelled: invite.status === "CANCELLED",
    accountExists: Boolean(existing),
    convertsConsumerAccount: consumerLabels.length > 0,
    consumerLabels,
  };
}

export async function createWorkspaceInvite(input: {
  ctx: AgentOrgContext;
  email: string;
  role: WorkspaceMemberRole;
}): Promise<
  | {
      ok: true;
      invite: { id: string; email: string; role: WorkspaceMemberRole };
      alreadyMember: boolean;
      convertsConsumerAccount: boolean;
      emailStatus: string;
    }
  | { ok: false; error: string; status?: number }
> {
  if (!input.ctx.workspaceId) {
    return { ok: false, error: "Workspace required.", status: 403 };
  }
  if (!workspaceTeamCanManage(input.ctx)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }
  if (!workspaceAdminCanInviteRole(input.ctx.workspaceRole, input.role)) {
    return { ok: false, error: "You can’t invite that role.", status: 403 };
  }
  if (input.role === "OWNER") {
    return {
      ok: false,
      error: "Cannot invite OWNER. Provision ownership separately.",
      status: 400,
    };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.ctx.workspaceId },
    select: { id: true, name: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") {
    return { ok: false, error: "Workspace is not active.", status: 403 };
  }

  const email = normalizeEmail(input.email);
  const existingPending = await prisma.workspaceInvite.findFirst({
    where: {
      workspaceId: workspace.id,
      email,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    return {
      ok: false,
      error: "A pending invite already exists for this email.",
      status: 400,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      disabledAt: true,
      isBuyer: true,
      isSeller: true,
    },
  });
  if (existingUser?.disabledAt) {
    return { ok: false, error: "That account is disabled.", status: 400 };
  }

  if (existingUser) {
    const already = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, userId: existingUser.id },
    });
    if (already?.status === "ACTIVE") {
      return {
        ok: false,
        error: "That user is already an ACTIVE member of this Workspace.",
        status: 400,
      };
    }
  }

  const expiresAt = new Date(Date.now() + WORKSPACE_INVITE_TTL_MS);
  const rawToken = createWorkspaceInviteRawToken();
  const tokenHash = hashWorkspaceInviteToken(rawToken);

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId: workspace.id,
      email,
      role: input.role,
      token: tokenHash,
      invitedById: input.ctx.user.id,
      status: "PENDING",
      expiresAt,
    },
  });

  // Existing staff: activate/create membership immediately (same UX as org invites).
  let alreadyMember = false;
  if (
    existingUser &&
    (existingUser.role === "AGENT" || existingUser.role === "ADMIN")
  ) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: existingUser.id,
        },
      },
      create: {
        workspaceId: workspace.id,
        userId: existingUser.id,
        role: input.role,
        status: "ACTIVE",
        invitedById: input.ctx.user.id,
        joinedAt: new Date(),
      },
      update: {
        role: input.role,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    await reconcileUserPlatformStaffState(existingUser.id);
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    alreadyMember = true;
  }

  const consumerLabels: Array<"buyer" | "seller"> = [];
  if (existingUser && !alreadyMember) {
    if (existingUser.isBuyer || existingUser.role === "BUYER") {
      consumerLabels.push("buyer");
    }
    if (existingUser.isSeller) consumerLabels.push("seller");
  }

  const sendResult = await sendWorkspaceInviteEmail({
    to: email,
    workspaceName: workspace.name,
    role: input.role,
    token: rawToken,
    invitedByName: input.ctx.user.name || input.ctx.user.email,
    alreadyMember,
    convertsConsumerAccount: consumerLabels.length > 0,
    consumerLabels,
    expiresAt,
  });
  if (!sendResult.ok) {
    console.error("[workspace-invite] email failed", email, sendResult.error);
  }

  return {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
    },
    alreadyMember,
    convertsConsumerAccount: consumerLabels.length > 0,
    emailStatus: sendResult.status,
  };
}

export async function resendWorkspaceInvite(
  ctx: AgentOrgContext,
  inviteId: string,
): Promise<
  | { ok: true; emailStatus: string }
  | { ok: false; error: string; status?: number }
> {
  if (!ctx.workspaceId || !workspaceTeamCanManage(ctx)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: ctx.workspaceId },
    include: { workspace: { select: { name: true, status: true } } },
  });
  if (!invite) return { ok: false, error: "Invite not found.", status: 404 };
  if (invite.status !== "PENDING") {
    return { ok: false, error: "Invite is no longer pending.", status: 400 };
  }
  if (invite.workspace.status !== "ACTIVE") {
    return { ok: false, error: "Workspace is not active.", status: 403 };
  }

  const expiresAt = new Date(Date.now() + WORKSPACE_INVITE_TTL_MS);
  const rawToken = createWorkspaceInviteRawToken();
  const tokenHash = hashWorkspaceInviteToken(rawToken);
  await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { expiresAt, token: tokenHash },
  });

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { role: true, isBuyer: true, isSeller: true },
  });
  const consumerLabels: Array<"buyer" | "seller"> = [];
  if (existing) {
    if (existing.isBuyer || existing.role === "BUYER") consumerLabels.push("buyer");
    if (existing.isSeller) consumerLabels.push("seller");
  }

  const sendResult = await sendWorkspaceInviteEmail({
    to: invite.email,
    workspaceName: invite.workspace.name,
    role: invite.role,
    token: rawToken,
    invitedByName: ctx.user.name || ctx.user.email,
    convertsConsumerAccount: consumerLabels.length > 0,
    consumerLabels,
    expiresAt,
  });
  if (!sendResult.ok) {
    return { ok: false, error: "Could not resend invite email.", status: 502 };
  }
  return { ok: true, emailStatus: sendResult.status };
}

export async function cancelWorkspaceInvite(
  ctx: AgentOrgContext,
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!ctx.workspaceId || !workspaceTeamCanManage(ctx)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }
  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: ctx.workspaceId },
  });
  if (!invite) return { ok: false, error: "Invite not found.", status: 404 };
  if (invite.status !== "PENDING") {
    return { ok: false, error: "Invite is no longer pending.", status: 400 };
  }
  await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { status: "CANCELLED" },
  });
  return { ok: true };
}

export async function acceptWorkspaceInvite(input: {
  token: string;
  actingUserId?: string | null;
  name?: string;
  password?: string;
}): Promise<
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      createdAccount: boolean;
      convertedConsumer: boolean;
      secondMembership: boolean;
    }
  | { ok: false; error: string; code?: "NEED_SIGN_IN" | "WRONG_ACCOUNT" }
> {
  const invite = await findWorkspaceInviteByRawToken(input.token);

  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.status === "CANCELLED") {
    return { ok: false, error: "This invite was cancelled." };
  }
  if (invite.status === "ACCEPTED" || invite.acceptedAt) {
    return { ok: false, error: "This invite was already accepted." };
  }
  if (
    invite.status === "EXPIRED" ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    if (invite.status === "PENDING") {
      await prisma.workspaceInvite
        .update({
          where: { id: invite.id },
          data: { status: "EXPIRED" },
        })
        .catch(() => undefined);
    }
    return { ok: false, error: "This invite has expired." };
  }
  if (invite.workspace.status !== "ACTIVE") {
    return { ok: false, error: "This Workspace is not accepting members." };
  }
  // Invite role must never grant platform ADMIN / OWNER via accept.
  if (invite.role === "OWNER") {
    return { ok: false, error: "Invalid invite role." };
  }

  const inviteEmail = normalizeEmail(invite.email);

  const existing = await prisma.user.findUnique({
    where: { email: inviteEmail },
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      isBuyer: true,
      isSeller: true,
    },
  });

  if (existing?.disabledAt) {
    return { ok: false, error: "This account is disabled." };
  }

  if (existing) {
    if (!input.actingUserId) {
      return {
        ok: false,
        error: "Sign in with this email to accept the invite.",
        code: "NEED_SIGN_IN",
      };
    }

    const acting = await prisma.user.findUnique({
      where: { id: input.actingUserId },
      select: { id: true, email: true, disabledAt: true },
    });
    if (!acting || acting.disabledAt) {
      return { ok: false, error: "This account is disabled." };
    }
    // Session email must match invite email (case-insensitive).
    if (
      acting.id !== existing.id ||
      normalizeEmail(acting.email) !== inviteEmail
    ) {
      return {
        ok: false,
        error: "You’re signed in with a different email. Sign out and try again.",
        code: "WRONG_ACCOUNT",
      };
    }

    const priorMemberships = await prisma.workspaceMember.count({
      where: { userId: existing.id, status: "ACTIVE" },
    });

    const convertedConsumer =
      existing.isBuyer ||
      existing.isSeller ||
      existing.role === "BUYER";

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: existing.id,
        },
      },
      create: {
        workspaceId: invite.workspaceId,
        userId: existing.id,
        role: invite.role,
        status: "ACTIVE",
        invitedById: invite.invitedById,
        joinedAt: new Date(),
      },
      update: {
        role: invite.role,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    await reconcileUserPlatformStaffState(existing.id);
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return {
      ok: true,
      userId: existing.id,
      workspaceId: invite.workspaceId,
      createdAccount: false,
      convertedConsumer,
      secondMembership: priorMemberships >= 1,
    };
  }

  // New email: invite proves join permission, but identity requires password signup.
  // Possession of URL alone cannot create a session — credentials required.
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
      email: inviteEmail,
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
            email: inviteEmail,
          },
          {
            kind: "vow_accept",
            version: VOW_VERSION,
            email: inviteEmail,
          },
          {
            kind: COMMUNICATIONS_CONSENT_KIND,
            version: COMMUNICATIONS_CONSENT_VERSION,
            email: inviteEmail,
          },
        ],
      },
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role,
      status: "ACTIVE",
      invitedById: invite.invitedById,
      joinedAt: now,
    },
  });

  await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedAt: now },
  });

  return {
    ok: true,
    userId: user.id,
    workspaceId: invite.workspaceId,
    createdAccount: true,
    convertedConsumer: false,
    secondMembership: false,
  };
}

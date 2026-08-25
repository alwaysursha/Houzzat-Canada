import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAgentContext,
  resolveOrganizationIdForAssignee,
} from "@/lib/agent";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import {
  deleteTeamMember,
  disableTeamMember,
  enableTeamMember,
} from "@/lib/agent/team-member-admin";
import { SITE_URL } from "@/lib/constants";
import { sendRenderedEmail } from "@/lib/email/send";
import { renderTeamInviteEmail } from "@/lib/email/templates";
import { notifyLeadAssignedToAgent } from "@/lib/notifications/staff-events";
import { prisma } from "@/lib/prisma";
import {
  cancelWorkspaceInvite,
  createWorkspaceInvite,
  resendWorkspaceInvite,
} from "@/lib/workspace-invite";
import {
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
  removeWorkspaceMember,
  setWorkspacePrimaryAgent,
  suspendWorkspaceMember,
} from "@/lib/workspace-team-admin";
import {
  getWorkspaceTeamPayload,
  resolveTeamAuthority,
  workspaceTeamCanManage,
} from "@/lib/workspace-team";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "AGENT"]).default("AGENT"),
});

const reassignSchema = z.object({
  leadId: z.string().min(1),
  assigneeId: z.string().min(1).nullable(),
});

const inviteActionSchema = z.object({
  action: z.enum(["resend_invite", "cancel_invite"]),
  inviteId: z.string().min(1),
});

const memberActionSchema = z.object({
  action: z.enum([
    "disable_member",
    "enable_member",
    "delete_member",
    "change_role",
    "set_primary_agent",
  ]),
  membershipId: z.string().min(1).optional(),
  transferToUserId: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "AGENT"]).optional(),
  userId: z.string().min(1).optional(),
});

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function sendTeamInviteEmail(input: {
  to: string;
  orgName: string;
  role: string;
  token: string;
  invitedByName: string | null;
  expiresAt: Date;
  alreadyMember?: boolean;
  convertsConsumerAccount?: boolean;
  consumerLabels?: Array<"buyer" | "seller">;
}) {
  const rendered = renderTeamInviteEmail({
    orgName: input.orgName,
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

export async function GET() {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "unavailable") {
    return NextResponse.json(
      {
        error: "Select an active Workspace to manage Team.",
        code: "WORKSPACE_CONTEXT_REQUIRED",
      },
      { status: 403 },
    );
  }

  if (authority.mode === "workspace") {
    const payload = await getWorkspaceTeamPayload(ctx);
    if (!payload) {
      return NextResponse.json({ error: "Workspace required" }, { status: 403 });
    }
    return NextResponse.json({
      scope: "workspace",
      workspace: payload.workspace,
      primaryAgentId: payload.primaryAgentId,
      members: payload.members,
      invites: payload.invites,
      canManage: payload.canManage,
      seats: payload.seats,
    });
  }

  const [members, invites, org] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            agentProfile: { select: { active: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvite.findMany({
      where: {
        organizationId: ctx.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
    }),
  ]);

  return NextResponse.json({
    scope: "organization",
    organization: org,
    members,
    invites,
    canManage: ctx.canSeeTeamLeads,
  });
}

async function handleWorkspaceTeamPost(
  ctx: NonNullable<Awaited<ReturnType<typeof requireAgentContext>>>,
  body: unknown,
) {
  if (!ctx.workspaceId) {
    return NextResponse.json({ error: "Workspace required" }, { status: 403 });
  }
  const workspaceId = ctx.workspaceId;

  if (!workspaceTeamCanManage(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actionRaw =
    typeof body === "object" && body !== null && "action" in body
      ? (body as { action?: unknown }).action
      : null;

  // Ignore client-supplied workspaceId — authority is active Workspace cookie only.
  if (
    typeof body === "object" &&
    body !== null &&
    "workspaceId" in body &&
    (body as { workspaceId?: unknown }).workspaceId != null &&
    (body as { workspaceId?: unknown }).workspaceId !== workspaceId
  ) {
    return NextResponse.json(
      { error: "workspaceId in body is not authoritative.", code: "WORKSPACE_ID_IGNORED" },
      { status: 400 },
    );
  }

  if (
    actionRaw === "disable_member" ||
    actionRaw === "enable_member" ||
    actionRaw === "delete_member" ||
    actionRaw === "change_role" ||
    actionRaw === "set_primary_agent"
  ) {
    const parsed = memberActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
    }

    if (parsed.data.action === "set_primary_agent") {
      if (!parsed.data.userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      const result = await setWorkspacePrimaryAgent(ctx, parsed.data.userId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      return NextResponse.json({ ok: true, primaryAgentId: result.primaryAgentId });
    }

    if (!parsed.data.membershipId) {
      return NextResponse.json({ error: "membershipId required" }, { status: 400 });
    }

    if (parsed.data.action === "disable_member") {
      const result = await suspendWorkspaceMember(ctx, parsed.data.membershipId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      return NextResponse.json({ ok: true, suspended: true });
    }

    if (parsed.data.action === "enable_member") {
      const result = await reactivateWorkspaceMember(
        ctx,
        parsed.data.membershipId,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      return NextResponse.json({ ok: true, reactivated: true });
    }

    if (parsed.data.action === "change_role") {
      if (!parsed.data.role) {
        return NextResponse.json({ error: "role required" }, { status: 400 });
      }
      const result = await changeWorkspaceMemberRole(
        ctx,
        parsed.data.membershipId,
        parsed.data.role,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      return NextResponse.json({ ok: true, role: result.role });
    }

    if (!parsed.data.transferToUserId) {
      return NextResponse.json(
        { error: "Choose a teammate to transfer data to." },
        { status: 400 },
      );
    }
    const result = await removeWorkspaceMember({
      ctx,
      membershipId: parsed.data.membershipId,
      transferToUserId: parsed.data.transferToUserId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      deleted: true,
      transferred: result.transferred,
    });
  }

  if (actionRaw === "resend_invite" || actionRaw === "cancel_invite") {
    const parsed = inviteActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invite action" }, { status: 400 });
    }
    if (parsed.data.action === "cancel_invite") {
      const result = await cancelWorkspaceInvite(ctx, parsed.data.inviteId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      return NextResponse.json({ ok: true, cancelled: true });
    }
    const result = await resendWorkspaceInvite(ctx, parsed.data.inviteId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      resent: true,
      emailStatus: result.emailStatus,
    });
  }

  if (actionRaw === "reassign") {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = reassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }
    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
    });
    if (!lead || lead.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (parsed.data.assigneeId) {
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId: parsed.data.assigneeId,
          status: "ACTIVE",
        },
      });
      if (!member) {
        return NextResponse.json(
          { error: "Assignee not on this Workspace" },
          { status: 400 },
        );
      }
    }
    const ownership = await resolveLeadCrmOwnership(
      lead.organizationId ?? ctx.organizationId,
    );
    const updated = await prisma.lead.update({
      where: { id: parsed.data.leadId },
      data: {
        assignedAgentId: parsed.data.assigneeId,
        organizationId: ownership.organizationId ?? lead.organizationId,
        workspaceId: ownership.workspaceId ?? lead.workspaceId,
        activities: {
          create: {
            type: "reassigned",
            userId: ctx.user.id,
            body: parsed.data.assigneeId
              ? `Reassigned to ${parsed.data.assigneeId}`
              : "Moved to pond",
          },
        },
      },
    });
    if (parsed.data.assigneeId && parsed.data.assigneeId !== ctx.user.id) {
      notifyLeadAssignedToAgent(parsed.data.assigneeId, {
        leadId: updated.id,
        label: updated.listingMls
          ? `MLS® ${updated.listingMls}`
          : "A lead was assigned to you",
      });
    }
    return NextResponse.json({ ok: true, lead: updated });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  const result = await createWorkspaceInvite({
    ctx,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    scope: "workspace",
    invite: {
      id: result.invite.id,
      email: result.invite.email,
      role: result.invite.role,
    },
    alreadyMember: result.alreadyMember,
    convertsConsumerAccount: result.convertsConsumerAccount,
    emailStatus: result.emailStatus,
  });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();

  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "unavailable") {
    return NextResponse.json(
      {
        error: "Select an active Workspace before managing Team.",
        code: "WORKSPACE_CONTEXT_REQUIRED",
      },
      { status: 403 },
    );
  }

  if (authority.mode === "workspace") {
    return handleWorkspaceTeamPost(ctx, body);
  }

  // Legacy organization authority ONLY when WORKSPACE_TEAM_SCOPE is explicitly legacy.
  const canManageTeam = ctx.canSeeTeamLeads;
  if (!canManageTeam) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actionRaw =
    typeof body === "object" && body !== null && "action" in body
      ? (body as { action?: unknown }).action
      : null;

  if (
    actionRaw === "disable_member" ||
    actionRaw === "enable_member" ||
    actionRaw === "delete_member"
  ) {
    const parsed = memberActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
    }

    if (parsed.data.action === "disable_member") {
      if (!parsed.data.membershipId) {
        return NextResponse.json({ error: "membershipId required" }, { status: 400 });
      }
      const result = await disableTeamMember(ctx, parsed.data.membershipId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, disabled: true });
    }

    if (parsed.data.action === "enable_member") {
      if (!parsed.data.membershipId) {
        return NextResponse.json({ error: "membershipId required" }, { status: 400 });
      }
      const result = await enableTeamMember(ctx, parsed.data.membershipId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, enabled: true });
    }

    if (!parsed.data.membershipId || !parsed.data.transferToUserId) {
      return NextResponse.json(
        { error: "Choose a teammate to transfer data to." },
        { status: 400 },
      );
    }
    const result = await deleteTeamMember({
      ctx,
      membershipId: parsed.data.membershipId,
      transferToUserId: parsed.data.transferToUserId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      deleted: true,
      transferred: result.transferred,
    });
  }

  if (actionRaw === "resend_invite" || actionRaw === "cancel_invite") {
    const parsed = inviteActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invite action" }, { status: 400 });
    }

    const invite = await prisma.organizationInvite.findFirst({
      where: {
        id: parsed.data.inviteId,
        organizationId: ctx.organizationId,
      },
      include: { organization: { select: { name: true } } },
    });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (parsed.data.action === "cancel_invite") {
      await prisma.organizationInvite.delete({ where: { id: invite.id } });
      return NextResponse.json({ ok: true, cancelled: true });
    }

    if (invite.acceptedAt) {
      return NextResponse.json(
        { error: "Invite was already accepted" },
        { status: 400 },
      );
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const updated = await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { expiresAt },
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

    const sendResult = await sendTeamInviteEmail({
      to: invite.email,
      orgName: invite.organization.name,
      role: invite.role,
      token: invite.token,
      invitedByName: ctx.user.name || ctx.user.email,
      convertsConsumerAccount: consumerLabels.length > 0,
      consumerLabels,
      expiresAt,
    });
    if (!sendResult.ok) {
      console.error("[team:invite] resend failed", invite.email, sendResult.error);
      return NextResponse.json(
        { error: "Could not resend invite email" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      resent: true,
      invite: updated,
      emailStatus: sendResult.status,
    });
  }

  if (actionRaw === "reassign") {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = reassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
    });
    if (!lead || lead.organizationId !== ctx.organizationId) {
      if (!ctx.isPlatformAdmin) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    if (parsed.data.assigneeId) {
      const member = await prisma.organizationMembership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: parsed.data.assigneeId,
        },
      });
      if (!member && !ctx.isPlatformAdmin) {
        return NextResponse.json(
          { error: "Assignee not on team" },
          { status: 400 },
        );
      }
    }

    let organizationId = lead?.organizationId ?? ctx.organizationId;
    if (parsed.data.assigneeId) {
      organizationId =
        (await resolveOrganizationIdForAssignee(parsed.data.assigneeId)) ??
        organizationId;
    }
    const ownership = await resolveLeadCrmOwnership(organizationId);

    const updated = await prisma.lead.update({
      where: { id: parsed.data.leadId },
      data: {
        assignedAgentId: parsed.data.assigneeId,
        organizationId,
        workspaceId: ownership.workspaceId,
        activities: {
          create: {
            type: "reassigned",
            userId: ctx.user.id,
            body: parsed.data.assigneeId
              ? `Reassigned to ${parsed.data.assigneeId}`
              : "Moved to pond",
          },
        },
      },
    });

    if (parsed.data.assigneeId && parsed.data.assigneeId !== ctx.user.id) {
      notifyLeadAssignedToAgent(parsed.data.assigneeId, {
        leadId: updated.id,
        label: updated.listingMls
          ? `MLS® ${updated.listingMls}`
          : "A lead was assigned to you",
      });
    }

    return NextResponse.json({ ok: true, lead: updated });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  const memberCount = await prisma.organizationMembership.count({
    where: { organizationId: org.id },
  });
  if (memberCount >= org.seatLimit) {
    return NextResponse.json(
      { error: `Seat limit reached (${org.seatLimit})` },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: org.id,
      email,
      role: parsed.data.role,
      invitedById: ctx.user.id,
      expiresAt,
    },
  });

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isBuyer: true, isSeller: true },
  });
  let alreadyMember = false;
  if (
    existingUser &&
    (existingUser.role === "AGENT" || existingUser.role === "ADMIN")
  ) {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: existingUser.id,
        },
      },
      create: {
        organizationId: org.id,
        userId: existingUser.id,
        role: parsed.data.role,
      },
      update: { role: parsed.data.role },
    });
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
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

  const sendResult = await sendTeamInviteEmail({
    to: email,
    orgName: org.name,
    role: parsed.data.role,
    token: invite.token,
    invitedByName: ctx.user.name || ctx.user.email,
    alreadyMember,
    convertsConsumerAccount: consumerLabels.length > 0,
    consumerLabels,
    expiresAt,
  });
  if (!sendResult.ok) {
    console.error("[team:invite] email failed", email, sendResult.error);
  }

  return NextResponse.json({
    ok: true,
    scope: "organization",
    invite,
    alreadyMember,
    convertsConsumerAccount: consumerLabels.length > 0,
    emailStatus: sendResult.status,
  });
}
